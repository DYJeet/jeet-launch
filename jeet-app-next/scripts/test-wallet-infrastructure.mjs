// State-machine unit tests use an explicitly synthetic RPC, not financial/validator evidence.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import { WalletTransactionExecutor } from "../src/lib/wallet-transactions.ts";
import {
  validateWalletEnvironment,
  parseUnits,
  formatUnits,
  LOCAL_WALLET_PROGRAM,
} from "../src/lib/wallet-environment.ts";
import {
  localWalletConfiguration,
  validateWalletRpc,
} from "../src/lib/local-wallet-server.ts";
const wallet = await generateKeyPairSigner(),
  genesis = (await generateKeyPairSigner()).address;
const env = {
  network: "local",
  chain: "solana:devnet",
  genesis,
  program: LOCAL_WALLET_PROGRAM,
  rpcPath: "/api/wallet/rpc",
};
let options = {},
  calls = [],
  lastSignature;
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const b = JSON.parse(raw);
  calls.push(b.method);
  let result;
  switch (b.method) {
    case "getGenesisHash":
      result = options.genesis ?? genesis;
      break;
    case "getAccountInfo":
      result = {
        context: { slot: 1 },
        value: options.missing
          ? null
          : {
              data: ["", "base64"],
              executable: true,
              owner: "BPFLoader2111111111111111111111111111111111",
              lamports: 10000000,
              rentEpoch: 0,
            },
      };
      break;
    case "getLatestBlockhash":
      result = {
        context: { slot: 1 },
        value: { blockhash: genesis, lastValidBlockHeight: 100 },
      };
      break;
    case "simulateTransaction":
      result = {
        context: { slot: 1 },
        value: {
          err: options.simulationError ?? null,
          logs: [],
          unitsConsumed: 200,
        },
      };
      break;
    case "getFeeForMessage":
      result = { context: { slot: 1 }, value: options.nullFee ? null : 5000 };
      break;
    case "getBalance":
      result = { context: { slot: 1 }, value: options.balance ?? 100000000 };
      break;
    case "getBlockHeight":
      result = options.height ?? 2;
      break;
    case "sendTransaction":
      lastSignature = getSignatureFromTransaction(
        getTransactionDecoder().decode(Buffer.from(b.params[0], "base64")),
      );
      if (options.dropResponse) {
        res.destroy();
        return;
      }
      result = lastSignature;
      break;
    case "getSignatureStatuses":
      result = {
        context: { slot: 1 },
        value: [
          options.unknown
            ? null
            : {
                slot: 1,
                confirmations: 1,
                confirmationStatus: "confirmed",
                err: options.chainError ?? null,
              },
        ],
      };
      break;
    default:
      throw Error(b.method);
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ jsonrpc: "2.0", id: b.id, result }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
after(() => server.close());
const rpc = `http://127.0.0.1:${server.address().port}`;
function context() {
  options = {};
  calls = [];
  const data = new Map(),
    notices = [];
  const state = {
    status: "connected",
    connected: {
      account: { address: wallet.address, chains: ["solana:devnet"] },
      signer: wallet,
      supportedTransactionVersions: new Set([0]),
    },
  };
  const store = {
    get: (k) => data.get(k) ?? null,
    put: (k, v) => data.set(k, v),
    remove: (k) => data.delete(k),
  };
  const executor = new WalletTransactionExecutor(
    env,
    rpc,
    () => state,
    store,
    (n) => notices.push(n),
    20,
  );
  const ix = async (signer) => [
    {
      programAddress: address("11111111111111111111111111111111"),
      accounts: [
        { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      ],
      data: new Uint8Array([0]),
    },
  ];
  return { executor, state, store, data, notices, ix };
}
test("exact decimal amounts reject precision loss, exponents, signs and overflow", () => {
  assert.equal(parseUnits("9007199.254740993"), 9007199254740993n);
  assert.equal(formatUnits(9007199254740993n), "9007199.254740993");
  for (const v of [
    "-1",
    "1e9",
    "01",
    "NaN",
    "1.0000000001",
    "18446744073.709551616",
  ])
    assert.throws(() => parseUnits(v));
});
test("local config rejects public genesis, disabled mode, remote RPC and cross-origin", () => {
  assert.throws(() =>
    validateWalletEnvironment({
      ...env,
      genesis: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
    }),
  );
  assert.throws(() =>
    localWalletConfiguration(new Request("http://127.0.0.1/api/wallet/rpc")),
  );
  process.env.JEET_LOCAL_WALLET = "1";
  process.env.JEET_LOCAL_WALLET_RPC = rpc;
  process.env.JEET_LOCAL_WALLET_GENESIS = genesis;
  assert.equal(
    localWalletConfiguration(new Request("http://127.0.0.1/api/wallet/rpc"))
      .environment.genesis,
    genesis,
  );
  assert.throws(() =>
    localWalletConfiguration(
      new Request("http://127.0.0.1/api/wallet/rpc", {
        headers: { origin: "https://evil.invalid" },
      }),
    ),
  );
  process.env.JEET_LOCAL_WALLET_RPC = "https://api.mainnet-beta.solana.com";
  assert.throws(() =>
    localWalletConfiguration(new Request("http://127.0.0.1")),
  );
  delete process.env.JEET_LOCAL_WALLET;
});
test("RPC rejects arbitrary methods, batches, unsafe preflight and unbounded scans", () => {
  const b = { jsonrpc: "2.0", id: 1, method: "getGenesisHash", params: [] };
  assert.equal(validateWalletRpc(b).method, b.method);
  for (const x of [
    [b],
    { ...b, method: "requestAirdrop" },
    { ...b, method: "getProgramAccounts" },
    { ...b, method: "getMultipleAccounts", params: [Array(33)] },
    {
      ...b,
      method: "sendTransaction",
      params: ["aaaa", { encoding: "base64", skipPreflight: true }],
    },
    { ...b, method: "getSignaturesForAddress", params: [wallet.address] },
  ])
    assert.throws(() => validateWalletRpc(x));
});
test("signed execution confirms once and clears saved signature", async () => {
  const c = context();
  const s = await c.executor.execute(c.ix, 1n);
  assert.equal(s, lastSignature);
  assert.equal(c.data.size, 0);
  assert.equal(c.notices.at(-1).phase, "confirmed");
  assert.equal(calls.filter((x) => x === "sendTransaction").length, 1);
});
for (const [label, opt, pattern] of [
  ["wrong genesis", { genesis: wallet.address }, /network changed/],
  ["missing program", { missing: true }, /unavailable/],
  [
    "simulation rejection",
    { simulationError: { InstructionError: [0, { Custom: 1005 }] } },
    /Simulation rejected/,
  ],
  ["insufficient SOL", { balance: 5000 }, /Insufficient/],
  ["no network fee", { nullFee: true }, /fee is unavailable/],
  ["expired signing", { height: 101 }, /expired/],
])
  test(label + " never broadcasts", async () => {
    const c = context();
    options = opt;
    await assert.rejects(c.executor.execute(c.ix, 1n), pattern);
    assert.ok(!calls.includes("sendTransaction"));
    assert.equal(c.data.size, 0);
  });
test("rejection is explicit; duplicate calls are blocked while wallet signing is pending", async () => {
  const c = context();
  let release, started;
  const ready = new Promise((r) => (started = r));
  c.state.connected.signer = {
    address: wallet.address,
    signTransactions: async () => {
      started();
      return await new Promise((_, r) => (release = r));
    },
  };
  const first = c.executor.execute(c.ix, 0n);
  await ready;
  await assert.rejects(c.executor.execute(c.ix, 0n), /already in progress/);
  release(Error("User rejected request"));
  await assert.rejects(first, /User rejected/);
  assert.equal(c.notices.at(-1).phase, "rejected");
  assert.ok(!calls.includes("sendTransaction"));
});
test("disconnect or changed chain after signature cannot broadcast", async () => {
  const c = context();
  c.state.connected.signer = {
    ...wallet,
    signTransactions: async (...args) => {
      const result = await wallet.signTransactions(...args);
      c.state.status = "disconnected";
      return result;
    },
  };
  await assert.rejects(c.executor.execute(c.ix, 0n), /disconnected/);
  assert.ok(!calls.includes("sendTransaction"));
});
test("wallet message substitution cannot broadcast", async () => {
  const c = context();
  c.state.connected.signer = {
    address: wallet.address,
    modifyAndSignTransactions: async (txs) =>
      txs.map((tx) => ({
        ...tx,
        messageBytes: new Uint8Array(tx.messageBytes.length),
        signatures: { [wallet.address]: new Uint8Array(64) },
      })),
  };
  await assert.rejects(c.executor.execute(c.ix, 0n), /changed the reviewed/);
  assert.ok(!calls.includes("sendTransaction"));
});
test("save failure blocks broadcasting", async () => {
  const c = context();
  c.store.put = () => {
    throw Error("Storage unavailable");
  };
  await assert.rejects(c.executor.execute(c.ix, 0n), /Storage unavailable/);
  assert.ok(!calls.includes("sendTransaction"));
});
test("lost send response reconciles known signature without resending", async () => {
  const c = context();
  options.dropResponse = true;
  assert.ok(await c.executor.execute(c.ix, 0n));
  assert.equal(calls.filter((x) => x === "sendTransaction").length, 1);
  assert.equal(c.data.size, 0);
});
test("unknown result remains saved and blocks new submissions, even with a new executor", async () => {
  const c = context();
  options.unknown = true;
  await assert.rejects(c.executor.execute(c.ix, 0n), /unavailable/);
  assert.equal(c.data.size, 1);
  const e = new WalletTransactionExecutor(env, rpc, () => c.state, c.store);
  await assert.rejects(e.execute(c.ix, 0n), /requires confirmation/);
  options.unknown = false;
  assert.ok(await e.reconcile(wallet.address));
  assert.equal(c.data.size, 0);
});
test("confirmed failure clears liability to retry without reporting success", async () => {
  const c = context();
  options.chainError = { InstructionError: [0, { Custom: 1005 }] };
  await assert.rejects(c.executor.execute(c.ix, 0n), /failed on-chain/);
  assert.equal(c.notices.at(-1).phase, "failed");
  assert.equal(c.data.size, 0);
});
test("finalized expiration clears only after history is checked again", async () => {
  const c = context();
  options.unknown = true;
  await assert.rejects(c.executor.execute(c.ix, 0n), /unavailable/);
  options.height = 102;
  await assert.rejects(c.executor.reconcile(wallet.address), /expired/);
  assert.equal(c.data.size, 0);
  assert.ok(calls.filter((x) => x === "getSignatureStatuses").length >= 3);
});
test("abort after wallet signature prevents submission", async () => {
  const c = context(),
    controller = new AbortController();
  c.state.connected.signer = {
    ...wallet,
    signTransactions: async (...args) => {
      const result = await wallet.signTransactions(...args);
      controller.abort();
      return result;
    },
  };
  await assert.rejects(c.executor.execute(c.ix, 0n, controller.signal));
  assert.ok(!calls.includes("sendTransaction"));
  assert.equal(c.data.size, 0);
});
test("read-only and send-only wallets cannot silently broadcast", async () => {
  for (const signer of [
    null,
    {
      address: wallet.address,
      signAndSendTransactions: async () => {
        throw Error("must not call");
      },
    },
  ]) {
    const c = context();
    c.state.connected.signer = signer;
    await assert.rejects(c.executor.execute(c.ix, 0n), /signing-capable/);
    assert.deepEqual(calls, []);
  }
});
test("network change after wallet signature prevents broadcast", async () => {
  const c = context();
  c.state.connected.signer = {
    ...wallet,
    signTransactions: async (...args) => {
      const result = await wallet.signTransactions(...args);
      options.genesis = wallet.address;
      return result;
    },
  };
  await assert.rejects(c.executor.execute(c.ix, 0n), /network changed/);
  assert.ok(!calls.includes("sendTransaction"));
});
