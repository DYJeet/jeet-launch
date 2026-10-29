import { spawn } from "node:child_process";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import { once } from "node:events";
const dir = await mkdtemp("/tmp/jeet-v5-");
const program = "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31";
let validator;
async function stop() {
  if (
    validator &&
    validator.exitCode === null &&
    validator.signalCode === null
  ) {
    const exited = once(validator, "exit");
    validator.kill("SIGTERM");
    const timer = setTimeout(() => validator.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(timer);
  }
}
async function start(name, extra = []) {
  const log = await open(dir + "/" + name + ".log", "w");
  validator = spawn(
    process.env.JEET_VALIDATOR_BIN ?? "solana-test-validator",
    [
      "--rpc-port",
      "9907",
      "--faucet-port",
      "9909",
      "--dynamic-port-range",
      "11000-11100",
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--ledger",
      dir + "/" + name,
      "--bpf-program",
      program,
      "programs/launch-custody/target/deploy/jeet_launch_custody.so",
      ...extra,
    ],
    { stdio: ["ignore", log.fd, log.fd] },
  );
  validator.on("error", (error) => console.error(error));
  await log.close();
  for (let i = 0; i < 60; i++) {
    if (validator.exitCode !== null)
      throw new Error("Validator exited; " + dir);
    try {
      const r = await fetch("http://127.0.0.1:9907", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if ((await r.json()).result === "ok") return;
    } catch {
      /* validator is starting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Startup timeout; " + dir);
}
try {
  await start("market", [
    "--bpf-program",
    "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
    "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
  ]);
  const { runV5Tests } = await import("./test-v5-local.mjs");
  const { fixtures, ...evidence } = await runV5Tests();
  await stop();
  const { verifyV5Integrity } = await import("./test-v5-integrity.mjs");
  evidence.integrityRejections = [];
  for (const [i, f] of fixtures.entries()) {
    const args = [];
    for (const [j, a] of f.accounts.entries()) {
      const file = dir + `/v5-fixture-${i}-${j}.json`;
      await writeFile(file, JSON.stringify(a.account));
      args.push("--account", a.address, file);
    }
    await start(`integrity-${i}`, [
      "--bpf-program",
      "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
      "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
      ...args,
    ]);
    evidence.integrityRejections.push(await verifyV5Integrity(f));
    await stop();
  }
  await writeFile(
    "programs/launch-custody/target/master-verification/v5-local-evidence.json",
    JSON.stringify(
      evidence,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
} finally {
  await stop();
  console.log("Market logs: " + dir);
}
