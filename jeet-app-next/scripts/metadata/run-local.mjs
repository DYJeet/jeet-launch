// Disposable local genesis with explicit config/fee fixtures; the AMM itself is genuine SBF.
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, open, readFile } from "node:fs/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { getProgramDerivedAddress } from "@solana/kit";
import { CPMM, WSOL, TOKEN, FEE, SYSTEM, bytes } from "../amm/cpmm.mjs";
const dir = await mkdtemp("/tmp/jeet-metadata-");
const config = Buffer.alloc(236);
createHash("sha256").update("account:AmmConfig").digest().copy(config, 0, 0, 8);
const [configKey, bump] = await getProgramDerivedAddress({
  programAddress: CPMM,
  seeds: [new TextEncoder().encode("amm_config"), new Uint8Array([0, 0])],
});
config[8] = bump;
for (const [at, n] of [
  [12, 2500n],
  [20, 300000n],
  [28, 40000n],
  [36, 150000000n],
  [108, 2500n],
])
  config.writeBigUInt64LE(n, at);
config.set(bytes(SYSTEM), 44);
config.set(bytes(SYSTEM), 76);
const fee = Buffer.alloc(165);
fee.set(bytes(WSOL), 0);
fee.set(bytes(SYSTEM), 32);
fee[108] = 1;
fee.writeUInt32LE(1, 109);
fee.writeBigUInt64LE(10000000n, 113);
const native = Buffer.alloc(82);
native[44] = 9;
native[45] = 1;
const args = [];
for (const [i, [key, owner, data]] of [
  [configKey, CPMM, config],
  [FEE, TOKEN, fee],
  [WSOL, TOKEN, native],
].entries()) {
  const f = dir + `/genesis-${i}.json`;
  await writeFile(
    f,
    JSON.stringify({
      pubkey: key,
      account: {
        lamports: 10000000,
        data: [data.toString("base64"), "base64"],
        owner,
        executable: false,
        rentEpoch: 0,
      },
    }),
  );
  args.push("--account", key, f);
}
const log = await open(dir + "/validator.log", "w");
const validator = spawn(
  process.env.JEET_AMM_VALIDATOR_BIN ??
    "programs/launch-custody/target/toolchain/validator",
  [
    "--log",
    "--bind-address",
    "127.0.0.1",
    "--rpc-port",
    "9917",
    "--faucet-port",
    "9919",
    "--dynamic-port-range",
    "13000-13100",
    "--ledger",
    dir + "/ledger",
    "--bpf-program",
    CPMM,
    "programs/launch-custody/target/amm-research/devnet-v0/raydium_cp_swap.so",
    "--bpf-program",
    "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
    process.env.JEET_GRADUATION_SBF ??
      "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
    "--bpf-program",
    "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
    "programs/launch-custody/target/deploy/jeet_launch_custody.so",
    "--bpf-program",
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    "programs/launch-custody/target/metadata-research/mpl_token_metadata.so",
    ...args,
  ],
  { stdio: ["ignore", log.fd, log.fd] },
);
await log.close();
validator.on("error", console.error);
try {
  for (let i = 0; i < 100; i++) {
    if (validator.exitCode !== null) throw Error("Validator exited: " + dir);
    try {
      const r = await (
        await fetch("http://127.0.0.1:9917", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
        })
      ).json();
      if (r.result === "ok") break;
    } catch {}
    if (i === 99) throw Error("Validator timeout: " + dir);
    await new Promise((r) => setTimeout(r, 300));
  }
  const { testMetadata: testCpmm } = await import("./test-local.mjs");
  let deadline;
  let result;
  try {
    result = await Promise.race([
      testCpmm(),
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(Error("CPMM lifecycle exceeded 300s; inspect " + dir)),
          300000,
        );
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
  result.completed = true;
  result.jeetSbfSha256 = createHash("sha256")
    .update(
      await readFile(
        process.env.JEET_GRADUATION_SBF ??
          "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
      ),
    )
    .digest("hex");
  result.ledger = dir;
  result.sourceCommit = "f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5";
  result.sbfSha256 = createHash("sha256")
    .update(
      await readFile(
        "programs/launch-custody/target/amm-research/devnet-v0/raydium_cp_swap.so",
      ),
    )
    .digest("hex");
  await writeFile(
    "programs/launch-custody/target/master-verification/metadata-evidence.json",
    JSON.stringify(
      result,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  console.log(
    "METADATA VERIFIED " +
      JSON.stringify(
        {
          positive: result.positive.length,
          rejection: result.rejections.length,
          transactions: result.transactions,
        },
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
  );
} finally {
  if (validator.exitCode === null) {
    const done = once(validator, "exit");
    validator.kill("SIGTERM");
    const timer = setTimeout(() => validator.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(timer);
  }
  console.log("CPMM logs: " + dir);
}
