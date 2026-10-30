/** Signing-only Wallet Standard execution. Never delegates broadcasting to a wallet. */
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getTransactionEncoder,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  signature as parseSignature,
  type Instruction,
  type TransactionSigner,
  type TransactionMessageBytesBase64,
} from "@solana/kit";
import {
  validateWalletEnvironment,
  type WalletEnvironment,
} from "./wallet-environment.ts";

export type TransactionPhase =
  | "preparing"
  | "simulating"
  | "awaiting-signature"
  | "submitting"
  | "confirming"
  | "confirmed"
  | "rejected"
  | "expired"
  | "failed"
  | "unknown";
export type TransactionNotice = {
  phase: TransactionPhase;
  signature?: string;
  message?: string;
  networkFee?: bigint;
};
type Connection = {
  status: string;
  connected: null | {
    account: { address: string; chains: readonly string[] };
    signer: TransactionSigner | null;
    supportedTransactionVersions: ReadonlySet<number | "legacy">;
  };
};
export type PendingTransaction = {
  signature: string;
  lastValidBlockHeight: string;
};
export type PendingStore = {
  get: (key: string) => PendingTransaction | null;
  put: (key: string, value: PendingTransaction) => void;
  remove: (key: string) => void;
};
export function browserPendingStore(): PendingStore {
  const key = (s: string) => `jeet-pending-v1:${s}`;
  return {
    get: (s) => {
      const raw = localStorage.getItem(key(s));
      if (!raw) return null;
      const value = JSON.parse(raw) as PendingTransaction;
      parseSignature(value.signature);
      if (!/^\d+$/.test(value.lastValidBlockHeight))
        throw Error(
          "Invalid saved transaction; reconcile its signature before retrying.",
        );
      return value;
    },
    put: (s, value) => localStorage.setItem(key(s), JSON.stringify(value)),
    remove: (s) => localStorage.removeItem(key(s)),
  };
}
export class WalletTransactionError extends Error {
  readonly phase: TransactionPhase;
  readonly signature?: string;
  constructor(message: string, phase: TransactionPhase, signature?: string) {
    super(message);
    this.phase = phase;
    this.signature = signature;
  }
}
const locks = new Set<string>();
const describeRpcError = (error: unknown) =>
  JSON.stringify(error, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export class WalletTransactionExecutor {
  readonly rpc;
  readonly environment: WalletEnvironment;
  readonly connection: () => Connection;
  readonly store: PendingStore;
  readonly notice: (value: TransactionNotice) => void;
  readonly confirmationTimeoutMs: number;
  constructor(
    environment: WalletEnvironment,
    rpcUrl: string,
    connection: () => Connection,
    store: PendingStore,
    notice: (value: TransactionNotice) => void = () => {},
    confirmationTimeoutMs = 45000,
  ) {
    this.environment = environment;
    this.connection = connection;
    this.store = store;
    this.notice = notice;
    this.confirmationTimeoutMs = confirmationTimeoutMs;
    validateWalletEnvironment(environment);
    this.rpc = createSolanaRpc(rpcUrl);
  }
  private key(wallet: string) {
    return `${this.environment.genesis}:${wallet}`;
  }
  private current(expected?: string) {
    const state = this.connection(),
      c = state.connected;
    if (
      state.status !== "connected" ||
      !c?.signer ||
      !c.supportedTransactionVersions.has(0) ||
      !c.account.chains.includes(this.environment.chain) ||
      c.signer.address !== c.account.address ||
      (expected && c.account.address !== expected) ||
      (!("modifyAndSignTransactions" in c.signer) &&
        !("signTransactions" in c.signer))
    )
      throw Error(
        "Connect a signing-capable Solana wallet on the configured test network. Wallet changed or disconnected.",
      );
    return c;
  }
  async network() {
    const genesis = await this.rpc
      .getGenesisHash()
      .send({ abortSignal: AbortSignal.timeout(8000) });
    if (genesis !== this.environment.genesis)
      throw Error("RPC network changed. No transaction was submitted.");
    const program = await this.rpc
      .getAccountInfo(address(this.environment.program), {
        encoding: "base64",
        commitment: "confirmed",
      })
      .send({ abortSignal: AbortSignal.timeout(8000) });
    if (!program.value?.executable)
      throw Error("Expected local JeeT program is unavailable.");
  }
  async reconcile(wallet: string) {
    const key = this.key(wallet);
    const run = async () => {
      if (locks.has(key))
        throw Error("A wallet transaction is already in progress.");
      locks.add(key);
      try {
        return await this.confirmPending(wallet);
      } finally {
        locks.delete(key);
      }
    };
    if (typeof window !== "undefined") {
      if (!navigator.locks)
        throw Error(
          "This browser cannot safely coordinate wallet submissions across tabs.",
        );
      return navigator.locks.request(
        `jeet-wallet:${key}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw Error("Another tab has a wallet transaction in progress.");
          return run();
        },
      );
    }
    return run();
  }
  private clearPending(wallet: string, signature: string) {
    const key = this.key(wallet);
    if (this.store.get(key)?.signature === signature) this.store.remove(key);
  }
  private async confirmPending(
    wallet: string,
    pending = this.store.get(this.key(wallet)),
  ) {
    if (!pending) return null;
    const sig = parseSignature(pending.signature),
      deadline = Date.now() + this.confirmationTimeoutMs;
    this.notice({ phase: "confirming", signature: sig });
    while (Date.now() < deadline) {
      try {
        await this.network();
        const { value } = await this.rpc
          .getSignatureStatuses([sig], { searchTransactionHistory: true })
          .send({ abortSignal: AbortSignal.timeout(8000) });
        const status = value[0];
        if (
          status &&
          (status.confirmationStatus === "confirmed" ||
            status.confirmationStatus === "finalized")
        ) {
          this.clearPending(wallet, sig);
          if (status.err) {
            this.notice({
              phase: "failed",
              signature: sig,
              message: describeRpcError(status.err),
            });
            throw new WalletTransactionError(
              "Transaction failed on-chain; balances must be refreshed.",
              "failed",
              sig,
            );
          }
          this.notice({ phase: "confirmed", signature: sig });
          return sig;
        }
        const height = await this.rpc
          .getBlockHeight({ commitment: "finalized" })
          .send({ abortSignal: AbortSignal.timeout(8000) });
        if (!status && height > BigInt(pending.lastValidBlockHeight)) {
          // A finalized root past validity plus a fresh history lookup is needed:
          // the earlier status read could race an inclusion in the last valid block.
          const final = await this.rpc
            .getSignatureStatuses([sig], { searchTransactionHistory: true })
            .send({ abortSignal: AbortSignal.timeout(8000) });
          if (!final.value[0]) {
            this.clearPending(wallet, sig);
            this.notice({ phase: "expired", signature: sig });
            throw new WalletTransactionError(
              "Transaction expired without confirmation. Review fresh state before retrying.",
              "expired",
              sig,
            );
          }
        }
      } catch (error) {
        if (error instanceof WalletTransactionError) throw error;
        // Bounded HTTP confirmation retry only. Never recreate, re-sign or resend a transaction.
      }
      await sleep(450);
    }
    this.notice({ phase: "unknown", signature: sig });
    throw new WalletTransactionError(
      "Confirmation is unavailable. Saved signature must be reconciled before another submission.",
      "unknown",
      sig,
    );
  }
  async execute(
    instructions: (
      signer: TransactionSigner,
    ) => Promise<readonly Instruction[]>,
    maximumDebitLamports: bigint,
    signal?: AbortSignal,
  ) {
    const wallet = this.current().account.address;
    if (typeof window !== "undefined") {
      if (!navigator.locks)
        throw Error(
          "This browser cannot safely coordinate wallet submissions across tabs.",
        );
      return navigator.locks.request(
        `jeet-wallet:${this.key(wallet)}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock)
            throw Error("Another tab has a wallet transaction in progress.");
          return this.executeLocked(
            instructions,
            maximumDebitLamports,
            signal,
            wallet,
          );
        },
      );
    }
    return this.executeLocked(
      instructions,
      maximumDebitLamports,
      signal,
      wallet,
    );
  }
  private async executeLocked(
    instructions: (
      signer: TransactionSigner,
    ) => Promise<readonly Instruction[]>,
    maximumDebitLamports: bigint,
    signal: AbortSignal | undefined,
    expectedWallet: string,
  ) {
    signal?.throwIfAborted();
    const connected = this.current(expectedWallet),
      wallet = connected.account.address,
      key = this.key(wallet);
    if (locks.has(key))
      throw Error("A wallet transaction is already in progress.");
    if (this.store.get(key))
      throw Error(
        "A previous transaction requires confirmation. Reconcile it before submitting again.",
      );
    if (maximumDebitLamports < 0n || maximumDebitLamports > (1n << 64n) - 1n)
      throw Error("Invalid expenditure bound.");
    locks.add(key);
    let submitted = false;
    try {
      this.notice({ phase: "preparing" });
      await this.network();
      const ix = await instructions(connected.signer!);
      if (!ix.length) throw Error("Transaction contains no instructions.");
      signal?.throwIfAborted();
      this.current(wallet);
      const lifetime = (
        await this.rpc
          .getLatestBlockhash({ commitment: "confirmed" })
          .send({ abortSignal: AbortSignal.timeout(8000) })
      ).value;
      const message = appendTransactionMessageInstructions(
        ix,
        setTransactionMessageLifetimeUsingBlockhash(
          lifetime,
          setTransactionMessageFeePayerSigner(
            connected.signer!,
            createTransactionMessage({ version: 0 }),
          ),
        ),
      );
      const compiled = compileTransaction(message);
      if (getTransactionEncoder().encode(compiled).length > 1232)
        throw Error("Transaction exceeds Solana's 1232-byte limit.");
      this.notice({ phase: "simulating" });
      const simulation = await this.rpc
        .simulateTransaction(getBase64EncodedWireTransaction(compiled), {
          encoding: "base64",
          commitment: "confirmed",
          sigVerify: false,
          replaceRecentBlockhash: false,
        })
        .send({ abortSignal: AbortSignal.timeout(15000) });
      if (simulation.value.err)
        throw Error(
          "Simulation rejected: " + describeRpcError(simulation.value.err),
        );
      const fee = (
        await this.rpc
          .getFeeForMessage(
            getBase64Decoder().decode(
              compiled.messageBytes,
            ) as TransactionMessageBytesBase64,
            { commitment: "confirmed" },
          )
          .send({ abortSignal: AbortSignal.timeout(8000) })
      ).value;
      if (fee === null)
        throw Error("Network fee is unavailable; refresh before signing.");
      const balance = (
        await this.rpc
          .getBalance(address(wallet), { commitment: "confirmed" })
          .send({ abortSignal: AbortSignal.timeout(8000) })
      ).value;
      if (balance < maximumDebitLamports + fee)
        throw Error(
          "Insufficient SOL for the disclosed expenditure and network fee.",
        );
      signal?.throwIfAborted();
      this.current(wallet);
      this.notice({ phase: "awaiting-signature", networkFee: fee });
      const signed = await signTransactionMessageWithSigners(
        message,
        signal ? { abortSignal: signal } : undefined,
      );
      // No wallet modifications are silently accepted after an economic preview.
      if (
        signed.messageBytes.length !== compiled.messageBytes.length ||
        signed.messageBytes.some((b, i) => b !== compiled.messageBytes[i])
      )
        throw Error(
          "Wallet changed the reviewed transaction; nothing submitted.",
        );
      signal?.throwIfAborted();
      this.current(wallet);
      await this.network();
      const height = await this.rpc
        .getBlockHeight({ commitment: "confirmed" })
        .send({ abortSignal: AbortSignal.timeout(8000) });
      if (height > lifetime.lastValidBlockHeight)
        throw new WalletTransactionError(
          "Signing took too long; blockhash expired. Nothing submitted.",
          "expired",
        );
      signal?.throwIfAborted();
      this.current(wallet);
      if (this.store.get(key))
        throw Error(
          "Another transaction is awaiting confirmation. Nothing submitted.",
        );
      const sig = getSignatureFromTransaction(signed);
      // Save before broadcasting. Storage failure must prevent submission.
      this.store.put(key, {
        signature: sig,
        lastValidBlockHeight: lifetime.lastValidBlockHeight.toString(),
      });
      this.notice({ phase: "submitting", signature: sig });
      submitted = true;
      try {
        const returned = await this.rpc
          .sendTransaction(getBase64EncodedWireTransaction(signed), {
            encoding: "base64",
            skipPreflight: false,
            preflightCommitment: "confirmed",
            maxRetries: 3n,
          })
          .send({ abortSignal: AbortSignal.timeout(15000) });
        if (returned !== sig)
          throw Error("RPC returned an inconsistent signature.");
      } catch {
        // The RPC may retransmit this same signed wire up to three times; no new signature is created.
        // Even a transport failure can follow a successful broadcast. Reconcile the known signature.
      }
      return await this.confirmPending(wallet);
    } catch (error) {
      if (!submitted && !(error instanceof WalletTransactionError)) {
        const message = error instanceof Error ? error.message : String(error);
        const rejected =
          /reject|declin|denied|cancel/i.test(message) &&
          !/simulation/i.test(message);
        this.notice({ phase: rejected ? "rejected" : "failed", message });
      } else if (!submitted && error instanceof WalletTransactionError)
        this.notice({ phase: error.phase, message: error.message });
      throw error;
    } finally {
      locks.delete(key);
    }
  }
}
