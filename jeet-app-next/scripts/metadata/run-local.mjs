// Genuine cloned Metaplex executable and fresh JeeT programs, with disposable local funds.
import { spawn } from "node:child_process";
import { mkdtemp, open, writeFile, readFile } from "node:fs/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
const dir = await mkdtemp("/tmp/jeet-metadata-"),
  log = await open(dir + "/validator.log", "w");
const paths = {
  jeet: "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
  default: "programs/launch-custody/target/deploy/jeet_launch_custody.so",
  metaplex:
    "programs/launch-custody/target/metadata-research/mpl_token_metadata.so",
};
const validator = spawn(
  process.env.JEET_VALIDATOR_BIN ??
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
    "8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo",
    paths.jeet,
    "--bpf-program",
    "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31",
    paths.default,
    "--bpf-program",
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    paths.metaplex,
  ],
  { stdio: ["ignore", log.fd, log.fd] },
);
await log.close();
validator.on("error", console.error);
let deadline;
try {
  for (let i = 0; i < 100; i++) {
    if (validator.exitCode !== null) throw Error("Validator exited: " + dir);
    try {
      const r = await fetch("http://127.0.0.1:9917", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
        signal: AbortSignal.timeout(1000),
      });
      if ((await r.json()).result === "ok") break;
    } catch {}
    if (i === 99) throw Error("Validator startup timeout");
    await new Promise((r) => setTimeout(r, 300));
  }
  const { testMetadata } = await import("./test-local.mjs");
  const e = await Promise.race([
    testMetadata(),
    new Promise(
      (_, reject) =>
        (deadline = setTimeout(
          () => reject(Error("Metadata suite exceeded300s: " + dir)),
          300000,
        )),
    ),
  ]);
  e.completed = true;
  e.ledger = dir;
  e.artifactSha256 = {};
  for (const [key, path] of Object.entries(paths))
    e.artifactSha256[key] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  await writeFile(
    "programs/launch-custody/target/master-verification/v6-metadata-evidence.json",
    JSON.stringify(e, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
  console.log(
    "METADATA VERIFIED " +
      JSON.stringify(
        {
          positive: e.positive.length,
          rejection: e.rejections.length,
          metadata: e.metadata,
          conservation: e.conservation,
        },
        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
  );
} finally {
  clearTimeout(deadline);
  if (validator.exitCode === null) {
    const done = once(validator, "exit");
    validator.kill("SIGTERM");
    const timer = setTimeout(() => validator.kill("SIGKILL"), 5000);
    await done;
    clearTimeout(timer);
  }
  console.log("Metadata logs: " + dir);
}
