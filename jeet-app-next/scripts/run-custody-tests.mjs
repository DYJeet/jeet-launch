import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";

// Keep app, validator, and RPC test client in one network namespace.
const directory = await mkdtemp(path.join(tmpdir(), "jeet-custody-"));
const processes = [];
async function start(command, args, name) {
  const log = await open(path.join(directory, `${name}.log`), "w");
  const child = spawn(command, args, { stdio: ["ignore", log.fd, log.fd] });
  child.on("error", (error) => console.error(`${name}: ${error.message}`));
  await log.close();
  processes.push(child);
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timer);
  }
}
async function ready(url, child) {
  for (let i = 0; i < 60; i++) {
    assert.equal(child.exitCode, null, `Process exited; inspect ${directory}`);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* process is starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Startup timeout for ${url}; inspect ${directory}`);
}
const validatorBin = process.env.JEET_VALIDATOR_BIN ?? "solana-test-validator";
const program = "7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31";
try {
  const app = await start(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"],
    "app",
  );
  await ready("http://127.0.0.1:3000/create", app);
  let validator = await start(
    validatorBin,
    [
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--ledger",
      path.join(directory, "missing-program"),
    ],
    "missing-program",
  );
  await ready("http://127.0.0.1:3000/api/local-test/health", validator);
  const response = await fetch("http://127.0.0.1:3000/api/local-test/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      totalSupply: "1000",
      decimals: 0,
      devAllocation: "2",
    }),
  });
  const failure = await response.json();
  assert.equal(response.status, 500);
  assert.equal(failure.phase, "custody-program-check");
  assert.equal(failure.mintAddress, null);
  console.log("PASS missing custody program fails before mint creation");
  await stop(validator);
  validator = await start(
    validatorBin,
    [
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--ledger",
      path.join(directory, "custody"),
      "--bpf-program",
      program,
      "programs/launch-custody/target/deploy/jeet_launch_custody.so",
    ],
    "validator",
  );
  await ready("http://127.0.0.1:3000/api/local-test/health", validator);
  await import("./test-creator-allocation.mjs");
  await import("./test-wallet-caps.mjs");
  await import("./test-bonding-curve.mjs");
  await stop(validator);
  validator = await start(
    validatorBin,
    [
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--ticks-per-slot",
      "256",
      "--ledger",
      path.join(directory, "protected-opening"),
      "--bpf-program",
      program,
      "programs/launch-custody/target/deploy/jeet_launch_custody.so",
    ],
    "protected-validator",
  );
  await ready("http://127.0.0.1:3000/api/local-test/health", validator);
  const protectedTests = await import("./test-protected-opening.mjs");
  const fixtures = await protectedTests.integrityAccounts();
  await stop(validator);
  const args = [
    "--log",
    "--bind-address",
    "127.0.0.1",
    "--ledger",
    path.join(directory, "inconsistent-opening"),
    "--bpf-program",
    program,
    "programs/launch-custody/target/deploy/jeet_launch_custody.so",
  ];
  for (let i = 0; i < fixtures.length; i++) {
    const file = path.join(directory, `integrity-${i}.json`);
    await writeFile(file, JSON.stringify(fixtures[i].account));
    args.push("--account", fixtures[i].address, file);
  }
  validator = await start(validatorBin, args, "integrity-validator");
  await ready("http://127.0.0.1:3000/api/local-test/health", validator);
  await protectedTests.verifyIntegrity();
  console.log(
    `PASS full local suite (allocation, custody, opening caps, bonding curve, protected opening). Logs and disposable ledgers: ${directory}`,
  );
} finally {
  for (const child of processes.reverse()) await stop(child);
}
