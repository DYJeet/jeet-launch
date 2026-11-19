// Disposable local genesis with explicit config/fee fixtures; the AMM itself is genuine SBF.
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, open, readFile } from "node:fs/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { address, getProgramDerivedAddress } from "@solana/kit";
import assert from 'node:assert/strict';
import { CPMM as defaultAmm, WSOL, TOKEN, FEE as defaultFee, SYSTEM, bytes } from "./cpmm.mjs";
import { mainnetGraduationProfile } from '../../src/lib/launch-graduation.ts';
const candidate = process.env.JEET_LOCAL_MAINNET_FIXTURE_PROGRAM;
const profile = candidate ? mainnetGraduationProfile(address(candidate)) : undefined;
const CPMM = profile?.amm ?? defaultAmm;
const FEE = profile?.feeRecipient ?? defaultFee;
const fixtureDir = process.env.JEET_LOCAL_MAINNET_FIXTURE_ACCOUNTS;
const jeetSbf = process.env.JEET_GRADUATION_SBF ??
  "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so";
if (profile) assert(fixtureDir && process.env.JEET_GRADUATION_SBF && process.env.JEET_AMM_SBF,
  'The local Mainnet replay requires exact executable and genesis fixtures.');
const ammSbf = process.env.JEET_AMM_SBF ??
  "programs/launch-custody/target/amm-research/devnet-v0/raydium_cp_swap.so";
const dir = await mkdtemp("/tmp/jeet-graduation-");
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
  if (profile) {
    const source = JSON.parse(await readFile(fixtureDir + '/cpmm-mainnet-account-' + (i + 1) + '.json'));
    assert.equal(source.pubkey, key);
    assert.equal(source.account.owner, owner);
    assert(!source.account.executable);
    await writeFile(f, JSON.stringify(source));
    args.push("--account", key, f);
    continue;
  }
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
if (profile) {
  assert.equal(createHash('sha256').update(await readFile(ammSbf)).digest('hex'),
    'c383e1c5b1f578f3d1bf42f12360fca67225b9adda0f3b6c293ad0d6b966818d');
  const [control, bump] = await getProgramDerivedAddress({
    programAddress: profile.program,
    seeds: ['release-control'],
  });
  const data = Buffer.concat([Buffer.from('JEETCTL1'), Buffer.from([bump, 2])]);
  const file = dir + '/release-control.json';
  await writeFile(file, JSON.stringify({ pubkey: control, account: {
    lamports: 10_000_000, data: [data.toString('base64'), 'base64'],
    owner: profile.program, executable: false, rentEpoch: 0,
  } }));
  args.push('--account', control, file);
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
    ammSbf,
    "--bpf-program",
    profile?.program ?? "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
    jeetSbf,
    ...(profile ? [] : ["--bpf-program", "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31", "programs/launch-custody/target/deploy/jeet_launch_custody.so"]),
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
          signal: AbortSignal.timeout(3000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
        })
      ).json();
      if (r.result === "ok") break;
    } catch {}
    if (i === 99) throw Error("Validator timeout: " + dir);
    await new Promise((r) => setTimeout(r, 300));
  }
  const { testGraduation: testCpmm } = await import("./test-graduation.mjs");
  let deadline;
  let result;
  try {
    result = await Promise.race([
      testCpmm(profile),
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
  if (profile) result.network = "local validator replay using Mainnet CPMM and fixture JeeT identities";
  result.jeetSbfSha256 = createHash("sha256")
    .update(
      await readFile(
        process.env.JEET_GRADUATION_SBF ??
          "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
      ),
    )
    .digest("hex");
  result.ledger = dir;
  result.sourceCommit = process.env.JEET_AMM_SBF ? null : "f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5";
  result.ammFixture = ammSbf;
  result.sbfSha256 = createHash("sha256")
    .update(
      await readFile(
        ammSbf,
      ),
    )
    .digest("hex");
  await writeFile(
    profile ? dir + "/mainnet-fixture-evidence.json" : "programs/launch-custody/target/master-verification/graduation-evidence.json",
    JSON.stringify(
      result,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
  console.log(
    "GRADUATION VERIFIED " +
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
