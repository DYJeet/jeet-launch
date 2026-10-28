"use client";
import { useMemo, useRef, useState } from "react";
import { useClient } from "@solana/react";
import {
  useConnectedWallet,
  WalletReadyGate,
} from "@solana/kit-plugin-wallet/react";
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  AuthorityType,
  tokenProgram,
  associatedTokenProgram,
} from "@solana-program/token";
import {
  rpcTransactionPlanner,
  rpcTransactionPlanSendingExecutor,
} from "@solana/kit-plugin-rpc";
import { type AppClient } from "@/app/providers";
import { SOLANA_RPC_URL } from "@/lib/solana-rpc";
import {
  CUSTODY_PROGRAM_ADDRESS,
  findBuyerReceiptPda,
  findCurvePda,
  findLaunchCustodyPda,
  findOpeningPda,
  initializeCustodyInstruction,
  initializeOpeningInstruction,
} from "@/lib/launch-custody";
import {
  PLATFORM_TREASURY,
  claimFeeInstruction,
  decodeFeeQuote,
  decodeFeeState,
  decodeFeeEvents,
  describeFeeError,
  feeBuyInstruction,
  feeQuoteInstruction,
  findFeePda,
  initializeFeeCurveInstruction,
} from "@/lib/launch-fees";
type Revenue = ReturnType<typeof decodeFeeState> & { vault: Address };
type Quote = ReturnType<typeof decodeFeeQuote> & {
  mint: Address;
  custody: Address;
  curve: Address;
  opening: Address;
  vault: Address;
  platformVault: Address;
  creatorVault: Address;
  networkFee: bigint | null;
  wallet: Address;
};
type History = {
  signature: string;
  mint: Address;
  kind: number;
  amount: bigint;
  slot: number;
};
const from64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function sol(n: bigint) {
  return `${n / 1000000000n}.${(n % 1000000000n).toString().padStart(9, "0")} SOL (${n} lamports)`;
}
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(SOLANA_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000),
  });
  const b = await r.json();
  if (!r.ok || b.error)
    throw new Error(b.error?.message ?? `RPC HTTP ${r.status}`);
  return b.result;
}
const errorText = describeFeeError;
const button =
  "rounded-lg border border-[#9cff43]/30 bg-[#9cff43]/10 px-4 py-2 font-bold text-[#9cff43] disabled:opacity-30";
const field = "rounded-lg border border-white/15 bg-black/30 p-2 text-white";
function Console({
  client: walletClient,
  initialMint,
}: {
  client: AppClient;
  initialMint: string;
}) {
  const client = useMemo(
    () =>
      pipe(
        walletClient,
        rpcTransactionPlanner({ version: 0 }),
        rpcTransactionPlanSendingExecutor(),
        tokenProgram(),
        associatedTokenProgram(),
      ),
    [walletClient],
  );
  const connected = useConnectedWallet(walletClient),
    wallet = connected ? address(connected.account.address) : undefined;
  const confirmedSignature = useRef<string | null>(null);
  const [rows, setRows] = useState<Revenue[] | null>(null),
    [history, setHistory] = useState<History[]>([]),
    [status, setStatus] = useState("Ready · Devnet only"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [signature, setSignature] = useState<string | null>(null);
  const [confirmedTrade, setConfirmedTrade] = useState<string | null>(null);
  const [mintText, setMint] = useState(initialMint),
    [amount, setAmount] = useState("1"),
    [maxSpend, setMaxSpend] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [claimAmounts, setClaimAmounts] = useState<Record<string, string>>({}),
    [historyTruncated, setHistoryTruncated] = useState(false);
  async function network() {
    if (
      (await rpc<string>("getGenesisHash", [])) !==
      "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG"
    )
      throw new Error("Unexpected RPC network. Only Devnet is authorized.");
    // Wallet plugin is explicitly bound to solana:devnet. Fail closed if the program
    // has not been deployed; this UI neither deploys nor activates mainnet.
    if (
      !(
        await rpc<{ value: { executable: boolean } | null }>("getAccountInfo", [
          CUSTODY_PROGRAM_ADDRESS,
          { encoding: "base64", commitment: "confirmed" },
        ])
      ).value?.executable
    )
      throw new Error(
        "JeeT custody program is not deployed on Devnet. No transaction was requested. Deployment requires separate approval.",
      );
    if (wallet && !connected?.account.chains.includes("solana:devnet"))
      throw new Error("Wallet must support Solana Devnet.");
  }
  async function readRevenue() {
    await network();
    const rent = BigInt(
      await rpc<number>("getMinimumBalanceForRentExemption", [153]),
    );
    const accounts = await rpc<
      {
        pubkey: Address;
        account: { data: [string, string]; owner: string; lamports: number };
      }[]
    >("getProgramAccounts", [
      CUSTODY_PROGRAM_ADDRESS,
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [{ dataSize: 153 }],
      },
    ]);
    const next: Revenue[] = [];
    for (const a of accounts) {
      const bytes = from64(a.account.data[0]);
      if (new TextDecoder().decode(bytes.slice(0, 8)) !== "JEETFEE1") continue;
      const f = decodeFeeState(bytes),
        [key, bump] = await findFeePda(f.mint, f.kind),
        [curve] = await findCurvePda(f.mint);
      if (
        key !== a.pubkey ||
        bump !== f.bump ||
        f.curve !== curve ||
        a.account.owner !== CUSTODY_PROGRAM_ADDRESS ||
        (f.kind === 0 && f.beneficiary !== PLATFORM_TREASURY)
      )
        throw new Error("Unexpected on-chain fee identity. Display stopped.");
      if (
        !Number.isSafeInteger(a.account.lamports) ||
        BigInt(a.account.lamports) < rent + f.claimable
      )
        throw new Error(
          "Fee vault is below its recorded liability and rent; display stopped.",
        );
      next.push({ ...f, vault: key });
    }
    setRows(next);
    const entries: History[] = [];
    let truncated = false;
    for (const row of next) {
      const refs = await rpc<
        { signature: string; err: unknown; slot: number }[]
      >("getSignaturesForAddress", [
        row.vault,
        { limit: 50, commitment: "confirmed" },
      ]);
      truncated ||= refs.length === 50;
      for (const ref of refs) {
        if (ref.err) continue;
        const tx = await rpc<{
          meta: { err: unknown; logMessages: string[] } | null;
        } | null>("getTransaction", [
          ref.signature,
          {
            encoding: "json",
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          },
        ]);
        if (!tx?.meta || tx.meta.err) continue;
        for (const event of decodeFeeEvents(tx.meta.logMessages)) {
          if (
            event.type !== "claim" ||
            event.mint !== row.mint ||
            event.kind !== row.kind ||
            event.beneficiary !== row.beneficiary
          )
            continue;
          entries.push({
            signature: ref.signature,
            mint: row.mint,
            kind: row.kind,
            amount: event.amount,
            slot: ref.slot,
          });
        }
      }
    }
    setHistory(entries);
    setHistoryTruncated(truncated);
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSignature(null);
    confirmedSignature.current = null;
    try {
      await fn();
    } catch (e) {
      const text = errorText(e);
      setStatus(
        confirmedSignature.current
          ? "Transaction confirmed · reporting check failed; inspect its signature before retrying"
          : /reject|declin|cancel/i.test(text)
            ? "Rejected by wallet"
            : "Failed · refresh on-chain data before retrying",
      );
      setError(text);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    await action(async () => {
      setStatus("Loading confirmed on-chain revenue…");
      await readRevenue();
      setStatus("Confirmed on-chain revenue loaded");
    });
  }
  async function claim(row: Revenue) {
    await action(async () => {
      if (
        !wallet ||
        wallet !== row.beneficiary ||
        client.payer.address !== wallet
      )
        throw new Error("Only the on-chain beneficiary may sign this claim.");
      await network();
      const value = BigInt(claimAmounts[row.vault] ?? row.claimable.toString());
      if (value <= 0n || value > row.claimable)
        throw new Error(
          "Claim must be positive and within displayed liability; the program checks the live liability again.",
        );
      const [custody] = await findLaunchCustodyPda(row.mint);
      setStatus("Pending · approve beneficiary claim in wallet");
      const sent = await client.sendTransaction([
        claimFeeInstruction({
          beneficiary: client.payer,
          mint: row.mint,
          custody,
          curve: row.curve,
          feeVault: row.vault,
          kind: row.kind,
          amount: value,
        }),
      ]);
      setSignature(String(sent.context.signature));
      confirmedSignature.current = String(sent.context.signature);
      setStatus("Confirmed · claim verified on-chain");
      await readRevenue();
    });
  }
  async function requestQuote() {
    await action(async () => {
      setQuote(null);
      if (!wallet || client.payer.address !== wallet)
        throw new Error("Connect a Devnet wallet first.");
      await network();
      const mint = address(mintText.trim()),
        n = BigInt(amount),
        [custody] = await findLaunchCustodyPda(mint),
        [opening] = await findOpeningPda(mint),
        [curve] = await findCurvePda(mint),
        [vault] = await findAssociatedTokenPda({
          mint,
          owner: custody,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        }),
        [platformVault] = await findFeePda(mint, 0),
        [creatorVault] = await findFeePda(mint, 1);
      const input = {
        mint,
        custody,
        opening,
        curve,
        vault,
        platformVault,
        creatorVault,
        amount: n,
      };
      const latest = (
        await rpc<{
          value: { blockhash: Blockhash; lastValidBlockHeight: number };
        }>("getLatestBlockhash", [{ commitment: "confirmed" }])
      ).value;
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(wallet, m),
        (m) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              ...latest,
              lastValidBlockHeight: BigInt(latest.lastValidBlockHeight),
            },
            m,
          ),
        (m) =>
          appendTransactionMessageInstruction(feeQuoteInstruction(input), m),
      );
      const simulated = await rpc<{
        value: {
          err: unknown;
          returnData?: { programId: string; data: [string, string] };
        };
      }>("simulateTransaction", [
        getBase64EncodedWireTransaction(compileTransaction(message)),
        { encoding: "base64", sigVerify: false, commitment: "confirmed" },
      ]);
      if (
        simulated.value.err ||
        simulated.value.returnData?.programId !== CUSTODY_PROGRAM_ADDRESS
      )
        throw new Error(
          "On-chain fee quote rejected: " + JSON.stringify(simulated.value.err),
        );
      const q = decodeFeeQuote(from64(simulated.value.returnData.data[0]));
      const [receipt] = await findBuyerReceiptPda(mint, wallet),
        [destination] = await findAssociatedTokenPda({
          mint,
          owner: wallet,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });
      const buyMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (m) => setTransactionMessageFeePayer(wallet, m),
        (m) =>
          setTransactionMessageLifetimeUsingBlockhash(
            {
              ...latest,
              lastValidBlockHeight: BigInt(latest.lastValidBlockHeight),
            },
            m,
          ),
        (m) =>
          appendTransactionMessageInstruction(
            feeBuyInstruction({
              ...input,
              buyer: client.payer,
              receipt,
              destination,
              expectedSold: q.sold,
              quotedCost: q.raw,
              maxCost: q.total,
            }),
            m,
          ),
      );
      const estimate = await rpc<{ value: number | null }>("getFeeForMessage", [
        getBase64Decoder().decode(compileTransaction(buyMessage).messageBytes),
        { commitment: "confirmed" },
      ]);
      setQuote({
        ...input,
        ...q,
        wallet,
        networkFee: estimate.value === null ? null : BigInt(estimate.value),
      });
      setMaxSpend(q.total.toString());
      setStatus(
        "Quote simulated by the on-chain program · no transaction sent",
      );
    });
  }
  async function buy() {
    await action(async () => {
      if (!quote || wallet !== quote.wallet || client.payer.address !== wallet)
        throw new Error("Wallet or quote changed. Request a fresh quote.");
      await network();
      if (mintText.trim() !== quote.mint || BigInt(amount) !== quote.amount)
        throw new Error("Inputs changed. Request a fresh quote.");
      const max = BigInt(maxSpend);
      if (max < quote.total)
        throw new Error("Maximum expenditure is below quoted total.");
      const [receipt] = await findBuyerReceiptPda(quote.mint, wallet),
        [destination] = await findAssociatedTokenPda({
          mint: quote.mint,
          owner: wallet,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });
      setStatus("Pending · approve fee-inclusive buy");
      const sent = await client.sendTransaction([
        await client.associatedToken.instructions.createAssociatedTokenIdempotent(
          { mint: quote.mint, owner: wallet },
        ),
        feeBuyInstruction({
          ...quote,
          buyer: client.payer,
          receipt,
          destination,
          amount: quote.amount,
          expectedSold: quote.sold,
          quotedCost: quote.raw,
          maxCost: max,
        }),
      ]);
      setSignature(String(sent.context.signature));
      confirmedSignature.current = String(sent.context.signature);
      const tx = await rpc<{
        meta: { err: unknown; logMessages: string[] } | null;
      } | null>("getTransaction", [
        String(sent.context.signature),
        {
          encoding: "json",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        },
      ]);
      const event =
        tx?.meta && !tx.meta.err
          ? decodeFeeEvents(tx.meta.logMessages).find(
              (e) =>
                e.type === "trade" &&
                e.mint === quote.mint &&
                e.buyer === wallet,
            )
          : undefined;
      if (
        !event ||
        event.type !== "trade" ||
        event.raw !== quote.raw ||
        event.platform !== quote.platform ||
        event.creator !== quote.creator ||
        event.total !== quote.total
      )
        throw new Error(
          "Transaction submitted; confirmed fee event is unavailable or inconsistent. Inspect its signature before retrying.",
        );
      setConfirmedTrade(
        `Confirmed consideration ${sol(event.total)} = curve ${sol(event.raw)} + platform ${sol(event.platform)} + creator ${sol(event.creator)}. Network fees and account rent are separate.`,
      );
      setQuote(null);
      setStatus(
        "Confirmed · buy, curve payment and both fee entitlements committed atomically",
      );
      await readRevenue();
    });
  }
  async function createLaunch() {
    await action(async () => {
      if (!wallet || client.payer.address !== wallet)
        throw new Error("Connect the creator's Devnet wallet.");
      await network();
      const mint = await generateKeyPairSigner();
      setMint(mint.address);
      setStatus(
        "Pending · creating fee-enabled mint " +
          mint.address +
          ". If interrupted, inspect this mint before retrying.",
      );
      await client.token.instructions
        .createMint({
          newMint: mint,
          decimals: 0,
          mintAuthority: wallet,
          freezeAuthority: wallet,
        })
        .sendTransaction();
      const [custody] = await findLaunchCustodyPda(mint.address),
        [opening] = await findOpeningPda(mint.address),
        [curve] = await findCurvePda(mint.address),
        [platformVault] = await findFeePda(mint.address, 0),
        [creatorVault] = await findFeePda(mint.address, 1);
      await client.token.instructions
        .mintToATA({
          mint: mint.address,
          owner: wallet,
          mintAuthority: client.payer,
          amount: 20n,
          decimals: 0,
        })
        .sendTransaction();
      await client.token.instructions
        .mintToATA({
          mint: mint.address,
          owner: custody,
          mintAuthority: client.payer,
          amount: 980n,
          decimals: 0,
        })
        .sendTransaction();
      const [creatorTokenAccount] = await findAssociatedTokenPda({
          mint: mint.address,
          owner: wallet,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        }),
        [vault] = await findAssociatedTokenPda({
          mint: mint.address,
          owner: custody,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });
      const sent = await client.sendTransaction([
        initializeCustodyInstruction({
          payer: client.payer,
          mint: mint.address,
          creator: wallet,
          creatorTokenAccount,
          custody,
          vault,
          creatorAmount: 20n,
          inventoryAmount: 980n,
        }),
        initializeOpeningInstruction({
          payer: client.payer,
          mint: mint.address,
          custody,
          opening,
          capBps: 200,
          enabled: true,
          durationSlots: 1000000n,
        }),
        initializeFeeCurveInstruction({
          payer: client.payer,
          creator: client.payer,
          mint: mint.address,
          custody,
          opening,
          curve,
          vault,
          platformVault,
          creatorVault,
          basePrice: 10000n,
          slope: 10n,
          protection: { delaySlots: 0n, durationSlots: 100000n, limitBps: 100 },
        }),
        client.token.instructions.setAuthority({
          owned: mint.address,
          owner: client.payer,
          authorityType: AuthorityType.MintTokens,
          newAuthority: null,
        }),
        client.token.instructions.setAuthority({
          owned: mint.address,
          owner: client.payer,
          authorityType: AuthorityType.FreezeAccount,
          newAuthority: null,
        }),
      ]);
      setSignature(String(sent.context.signature));
      confirmedSignature.current = String(sent.context.signature);
      setStatus(
        "Confirmed · fee launch initialized with your immutable creator entitlement",
      );
      await readRevenue();
    });
  }
  const platform = rows?.filter((r) => r.kind === 0) ?? [],
    creator =
      rows?.filter((r) => r.kind === 1 && r.beneficiary === wallet) ?? [];
  function table(title: string, list: Revenue[]) {
    const total = (key: "accrued" | "withdrawn" | "claimable") =>
      list.reduce((n, r) => n + r[key], 0n);
    return (
      <section className="space-y-3 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-black">{title}</h2>
        {rows === null ? (
          <p>Load confirmed chain data to view earnings.</p>
        ) : (
          <>
            <p>
              Lifetime: {sol(total("accrued"))} · Claimable:{" "}
              {sol(total("claimable"))} · Withdrawn: {sol(total("withdrawn"))}
            </p>
            {list.length === 0 ? (
              <p>
                No fee-enabled launches found
                {title.startsWith("Creator")
                  ? " for this connected wallet"
                  : ""}
                .
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th>Mint</th>
                      <th>Earned / Claimable / Withdrawn (lamports)</th>
                      <th>Claim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.vault}>
                        <td className="max-w-60 break-all py-3">{r.mint}</td>
                        <td>
                          {r.accrued.toString()} / {r.claimable.toString()} /{" "}
                          {r.withdrawn.toString()}
                        </td>
                        <td>
                          {wallet === r.beneficiary ? (
                            <div className="flex gap-2">
                              <input
                                aria-label="Claim lamports"
                                className={field + " w-32"}
                                value={
                                  claimAmounts[r.vault] ??
                                  r.claimable.toString()
                                }
                                onChange={(e) =>
                                  setClaimAmounts({
                                    ...claimAmounts,
                                    [r.vault]: e.target.value,
                                  })
                                }
                              />
                              <button
                                disabled={busy || r.claimable === 0n}
                                className={button}
                                onClick={() => claim(r)}
                              >
                                Claim
                              </button>
                            </div>
                          ) : (
                            "Beneficiary signature required"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    );
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">JeeT Launch revenue</h1>
      <p className="break-all">
        Intended platform beneficiary: {PLATFORM_TREASURY}
      </p>
      <p>
        Platform 0.75% · Creator 0.25% · Total nominal trading fee 1.00%.
        Creation platform fee: 0 SOL. No fees on ordinary SPL transfers. No
        migration or post-migration DEX fee is implemented.
      </p>
      <p className="text-white/50">
        Devnet only. This page uses real confirmed program accounts and
        wallet-signed transactions. It does not deploy the program. Local proof
        launches with discarded creator keys remain unchanged and cannot be
        claimed by your connected wallet.
      </p>
      <button disabled={busy} className={button} onClick={refresh}>
        Refresh on-chain revenue
      </button>
      <p role="status">{status}</p>
      {confirmedTrade ? (
        <p className="text-[#9cff43]">{confirmedTrade}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      ) : null}
      {signature ? (
        <a
          className="break-all text-[#9cff43]"
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          Transaction: {signature}
        </a>
      ) : null}
      {table("Platform treasury · 75 bps", platform)}
      {table("Creator rewards · 25 bps", creator)}
      <section className="space-y-3 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-black">Verified claim history</h2>
        <p>
          Recent confirmed claims, up to 50 account transactions per vault. RPC
          retention may limit historical coverage.
          {historyTruncated
            ? " Some vaults reached the query limit; this is not complete lifetime history."
            : ""}
        </p>
        {history.length ? (
          history.map((h, i) => (
            <p key={h.signature + i}>
              <a
                className="text-[#9cff43]"
                href={`https://explorer.solana.com/tx/${h.signature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
              >
                {h.kind === 0 ? "Platform" : "Creator"} · {sol(h.amount)} · slot{" "}
                {h.slot} · {h.mint}
              </a>
            </p>
          ))
        ) : (
          <p>No verified claims loaded.</p>
        )}
      </section>
      <section className="space-y-3 rounded-2xl border border-[#9cff43]/20 p-5">
        <h2 className="text-xl font-black">Fee-enabled bonding-curve buy</h2>
        <label className="block">
          Mint{" "}
          <input
            className={field + " w-full"}
            value={mintText}
            onChange={(e) => {
              setMint(e.target.value);
              setQuote(null);
            }}
          />
        </label>
        <label className="block">
          Token base units{" "}
          <input
            className={field}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setQuote(null);
            }}
          />
        </label>
        <button
          disabled={busy || !wallet}
          className={button}
          onClick={requestQuote}
        >
          Get on-chain quote
        </button>
        {quote ? (
          <div className="space-y-2">
            <p>Raw curve: {sol(quote.raw)}</p>
            <p>JeeT 0.75%: {sol(quote.platform)}</p>
            <p>Creator 0.25%: {sol(quote.creator)}</p>
            <p>
              Total trading fee: {sol(quote.platform + quote.creator)}. Each
              component rounds up to one lamport; effective dust-trade
              percentages can exceed 1%.
            </p>
            <p>Total consideration: {sol(quote.total)}</p>
            <p>
              Estimated network fee:{" "}
              {quote.networkFee === null
                ? "Unavailable"
                : sol(quote.networkFee)}
              . Wallet submission may add network fees. ATA creation and first
              receipt rent are separate, recoverable only under their applicable
              account rules.
            </p>
            <p>
              State bound: sold={quote.sold.toString()}. Any intervening
              purchase invalidates this quote. Requote after a stale-state
              rejection.
            </p>
            <label>
              Maximum fee-inclusive consideration (lamports){" "}
              <input
                className={field}
                value={maxSpend}
                onChange={(e) => setMaxSpend(e.target.value)}
              />
            </label>
            <button
              disabled={busy || wallet !== quote.wallet}
              className={button}
              onClick={buy}
            >
              Sign fee-inclusive buy
            </button>
          </div>
        ) : null}
      </section>
      <section className="space-y-3 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-black">
          New signer-owned Devnet fee launch
        </h2>
        <p>
          Explicit test configuration: 1,000 whole tokens; 20 creator / 980
          custody; cumulative wallet cap 20 for 1,000,000 slots; stricter
          opening limit 10 for 100,000 slots; start at initialization slot.
          Curve base 10,000 lamports, slope 10. Both mint authorities revoked.
          Fees fixed at 75 / 25 bps. Your signing wallet is the immutable
          creator and reward beneficiary. Creation requires several transactions
          and rent; partial failures must be inspected before retrying.
        </p>
        <button
          disabled={busy || !wallet}
          className={button}
          onClick={createLaunch}
        >
          Create signer-owned fee test launch
        </button>
      </section>
    </div>
  );
}
export default function FeeConsole({
  initialMint = "",
}: {
  initialMint?: string;
}) {
  const client = useClient<AppClient>();
  return (
    <WalletReadyGate client={client} fallback={<p>Loading wallet support…</p>}>
      <Console client={client} initialMint={initialMint} />
    </WalletReadyGate>
  );
}
