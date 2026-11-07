// Read-only preflight. This script never loads signing material or submits transactions.
import { address, getAddressDecoder, getProgramDerivedAddress } from "@solana/kit";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const genesis = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
const forbidden = new Set([
  "11111111111111111111111111111111",
  "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
  "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
  "HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP",
  "2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ",
]);
const dependencies = {
  raydiumCpmm: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
  metadata: "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  splToken: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  associatedToken: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
};
const confirmed = { commitment: "confirmed" };
const decoder = getAddressDecoder();

function optionalIdentity(name) {
  const value = process.env[name];
  if (!value) return null;
  if (forbidden.has(value)) throw Error(`${name} must use a distinct disposable Devnet address`);
  return address(value);
}

async function main() {
  const url = new URL(process.env.JEET_DEVNET_RPC_URL || "https://api.devnet.solana.com");
  if (url.protocol !== "https:" || url.username || url.password) throw Error("An HTTPS Devnet RPC URL is required");
  const program = optionalIdentity("JEET_DEVNET_PROGRAM_ID");
  const authority = optionalIdentity("JEET_DEVNET_UPGRADE_AUTHORITY");
  const payer = optionalIdentity("JEET_DEVNET_PAYER");
  const treasury = optionalIdentity("JEET_DEVNET_TREASURY");
  const identities = [program, authority, payer, treasury].filter(Boolean);
  if (new Set(identities).size !== identities.length) throw Error("Use separate Devnet public addresses for each role");
  async function rpc(method, params = []) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    } catch {
      throw Error(`${method}: RPC transport unavailable`);
    }
    if (!response.ok) throw Error(`${method}: HTTP ${response.status}`);
    const result = await response.json();
    if (result.error || !Object.hasOwn(result, "result")) throw Error(`${method}: RPC rejected request`);
    return result.result;
  }
  if (await rpc("getGenesisHash") !== genesis) throw Error("Unexpected genesis. Only Solana Devnet is allowed");
  const entries = Object.entries({ ...dependencies, ...(program ? { jeet: program } : {}) });
  const snapshot = await rpc("getMultipleAccounts", [entries.map(([, key]) => key), {
    ...confirmed, encoding: "base64", dataSlice: { offset: 0, length: 37 },
  }]);
  const programs = Object.fromEntries(entries.map(([name, key], i) => {
    const account = snapshot.value[i];
    return [name, { address: key, exists: !!account, executable: account?.executable === true, loader: account?.owner }];
  }));
  let upgradeAuthority = null;
  const candidate = program && snapshot.value.at(-1);
  if (candidate?.executable && candidate.owner === loader) {
    const header = Buffer.from(candidate.data[0], "base64");
    if (header.length !== 36 || header.readUInt32LE() !== 2) throw Error("Invalid upgradeable program account");
    const programData = decoder.decode(header.subarray(4));
    const { value } = await rpc("getAccountInfo", [programData, {
      ...confirmed, encoding: "base64", dataSlice: { offset: 0, length: 45 },
    }]);
    const data = Buffer.from(value?.data?.[0] ?? "", "base64");
    if (value?.owner !== loader || value.executable || data.length < 13 || data.readUInt32LE() !== 3 ||
        (data[12] !== 0 && (data[12] !== 1 || data.length !== 45))) throw Error("Invalid ProgramData account");
    upgradeAuthority = { programData, address: data[12] === 1 ? decoder.decode(data.subarray(13)) : null };
  }
  const [config] = await getProgramDerivedAddress({
    programAddress: address(dependencies.raydiumCpmm),
    seeds: ["amm_config", new Uint8Array(2)],
  });
  const feeReceiver = "3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy";
  const { value: [configAccount, feeAccount] } = await rpc("getMultipleAccounts", [
    [config, feeReceiver], { ...confirmed, encoding: "base64", minContextSlot: snapshot.context.slot },
  ]);
  const configData = Buffer.from(configAccount?.data?.[0] ?? "", "base64");
  const recognizedConfig = configAccount?.owner === dependencies.raydiumCpmm &&
    !configAccount.executable && configData.length === 236 &&
    configData.subarray(0, 8).equals(Buffer.from([218, 244, 33, 104, 203, 203, 43, 111]));
  const feeData = Buffer.from(feeAccount?.data?.[0] ?? "", "base64");
  const wrappedSolFeeReceiver = feeAccount?.owner === dependencies.splToken && feeData.length === 165 &&
    decoder.decode(feeData.subarray(0, 32)) === "So11111111111111111111111111111111111111112";
  const raydiumSetup = {
    config, feeReceiver, recognizedConfig, wrappedSolFeeReceiver,
    enabled: recognizedConfig && configData[9] === 0,
    tradeFeeMillionths: recognizedConfig ? configData.readBigUInt64LE(12).toString() : null,
    createPoolFeeLamports: recognizedConfig ? configData.readBigUInt64LE(36).toString() : null,
  };
  const payerLamports = payer ? (await rpc("getBalance", [payer, confirmed])).value : null;
  const artifactPath = process.env.JEET_DEVNET_ESTIMATE_ELF;
  let rentEstimate = null;
  if (artifactPath) {
    const elf = await readFile(artifactPath);
    if (!elf.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) throw Error("Expected an ELF artifact for rent sizing");
    const rent = size => rpc("getMinimumBalanceForRentExemption", [size, confirmed]);
    const [program, programData, buffer] = await Promise.all([rent(36), rent(elf.length * 2 + 45), rent(elf.length + 37)]);
    rentEstimate = {
      sizingOnly: true, elfBytes: elf.length, sha256: createHash("sha256").update(elf).digest("hex"),
      program, programData, buffer, conservativeFundingLamports: program + programData + buffer,
      excludesTransactionFeesAndLaunchCosts: true,
    };
  }
  console.log(JSON.stringify({
    genesis, slot: snapshot.context.slot, programs, raydiumSetup, payer, payerLamports, rentEstimate,
    upgradeAuthority, upgradeAuthorityMatches: !!authority && upgradeAuthority?.address === authority,
    configuredTreasury: treasury, treasuryVerifiedOnChain: false, deploymentAuthorized: false,
  }, null, 2));
}

main().catch(error => {
  // Avoid emitting provider URLs, headers or raw RPC errors.
  console.error(error.message);
  process.exitCode = 1;
});
