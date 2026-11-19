import { recoverFinalizedTransaction, archivalTransactionReader, verifiedHistoryRpc, historyCoverageGap } from "@/lib/history-recovery";
import { admitPublicRequest } from "@/lib/public-read-limit";
import { address, getBase64Encoder, signature } from "@solana/kit";
import { createServerWalletRpc } from "@/lib/wallet-rpc-server";
import { localReadConfiguration, checkedLocalGenesis } from "@/lib/local-wallet-server";
import { marketStore, type MarketEvent } from "@/lib/market-store";
import { configuredHistoryBatchSize, readHistoryPage } from "@/lib/market-ingest";
import { walletLaunchAddresses } from "@/lib/wallet-launch";
import { decodeGraduation, graduationAddresses } from "@/lib/launch-graduation";
import { ammHistoryPool, ammTradeEvents } from "@/lib/amm-history";
import { curveTradeEvents, feeClaimEvents } from "@/lib/curve-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const inflight = new Map<string, Promise<boolean>>();
const cooldown = new Map<string, number>();
const noCache = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!(await admitPublicRequest(request)))
    return Response.json({ error: "Shared request quota unavailable or exhausted. Retry shortly." }, { status: 429, headers: { "retry-after": "60" } });
  let config;
  try { config = localReadConfiguration(request); }
  catch { return Response.json({ error: "Local history is disabled." }, { status: 404 }); }
  const params = new URL(request.url).searchParams;
  const venue = params.get("venue");
  if (venue && venue !== "amm" && venue !== "curve")
    return Response.json({ error: "Invalid market history venue." }, { status: 400 });
  const amm = venue === "amm";
  let mint;
  let search;
  const before = params.get("before") || undefined;
  try {
    mint = address(params.get("mint") ?? "");
    const query = params.get("signature");
    search = query ? signature(query) : undefined;
    if (before && !/^[1-9A-HJ-NP-Za-km-z]{64,88}:(?:trade|claim|swap):\d{1,20}$/.test(before))
      throw Error("Invalid cursor");
  } catch { return Response.json({ error: "Invalid market history query." }, { status: 400 }); }
  const network = config.environment.genesis + ":" + config.environment.program;
  const stream = mint + (amm ? ":amm" : ":curve");
  const key = network + ":" + stream;
  let store;
  try { store = marketStore(); }
  catch { return Response.json({ error: 'Shared history service unavailable. Retry later.' }, { status: 503 }); }
  let stale = false;
  try {
    const existing = inflight.get(key);
    if (existing) await existing;
    else if (inflight.size >= 4 || (cooldown.get(key) ?? 0) > Date.now()) stale = true;
    else {
      const update = (async () => {
        await checkedLocalGenesis(config.url, config.environment.genesis);
        const rpc = createServerWalletRpc(config.url);
        const historyRpc = await verifiedHistoryRpc(config.url, config.environment.genesis);
        const options = { abortSignal: AbortSignal.timeout(12000) };
        const canonical = await graduationAddresses(mint, 0n);
        const termsAccount = (await rpc.getAccountInfo(canonical.terms,
          { encoding: "base64", commitment: "finalized" }).send(options)).value;
        if (!termsAccount || termsAccount.owner !== config.environment.program || termsAccount.executable)
          throw Error("Finalized launch terms unavailable.");
        const terms = decodeGraduation(new Uint8Array(getBase64Encoder().encode(termsAccount.data[0])));
        const { curve } = await walletLaunchAddresses(mint, mint);
        if (terms.mint !== mint || terms.curve !== curve || (amm && !terms.migrated))
          throw Error("Finalized market is unavailable.");
        const pool = amm ? await ammHistoryPool(mint, terms) : undefined;
        const prior = await store.checkpoint(network, stream);
        const batchSize = configuredHistoryBatchSize();
        const { events, next } = await readHistoryPage<MarketEvent>(prior, {
          async signatures(cursor) {
            return (await historyRpc.getSignaturesForAddress(pool?.pool ?? curve, {
              commitment: "finalized", limit: batchSize, before: cursor ? signature(cursor) : undefined,
            }).send(options)).map(entry => ({ signature: entry.signature, slot: entry.slot, failed: !!entry.err }));
          },
          async events(entry) {
            const read = () => rpc.getTransaction(signature(entry.signature), {
              encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0,
            }).send(options);
            const tx = await recoverFinalizedTransaction(read, archivalTransactionReader(entry.signature, config.environment.genesis));
            if (!tx?.meta) throw Error("Finalized transaction missing; retry page without advancing its cursor.");
            if (tx.slot !== entry.slot || tx.transaction.signatures[0] !== entry.signature)
              throw Error("Finalized transaction identity mismatch.");
            if (tx.meta.err) throw Error("Finalized status changed.");
            const base = { signature: entry.signature, slot: tx.slot.toString(),
              time: tx.blockTime === null || tx.blockTime === undefined ? null : Number(tx.blockTime) };
            const trade = (event: { sell: boolean; raw: bigint; tokens: bigint; wallet: string }, id: string): MarketEvent => ({
              ...base, id: entry.signature + ":" + id, kind: event.sell ? "sell" : "buy",
              wallet: event.wallet, tokens: event.tokens.toString(), lamports: event.raw.toString(),
            });
            if (pool) {
              if (!tx.meta.innerInstructions) throw Error("Finalized AMM data incomplete; retain cursor.");
              return ammTradeEvents(tx, pool).map(event => trade(event, "swap:" + event.index));
            }
            if (!tx.meta.logMessages || tx.meta.logMessages.includes("Log truncated")) throw Error("Finalized event logs incomplete; retain cursor.");
            return [
              ...curveTradeEvents(tx.meta.logMessages, config.environment.program, mint)
                .map(event => trade(event, "trade:" + event.sequence)),
              ...feeClaimEvents(tx.meta.logMessages, config.environment.program, mint)
                .map((event, index): MarketEvent => ({
                  ...base, id: entry.signature + ":claim:" + index,
                  kind: event.platform ? "platform-claim" : "creator-claim",
                  wallet: event.beneficiary, lamports: event.paid.toString(),
                })),
            ];
          },
        }, batchSize);
        const firstAvailable = !prior.backfilled && next.backfilled
          ? await historyRpc.getFirstAvailableBlock().send(options) : 0n;
        if (historyCoverageGap(firstAvailable, terms.createdSlot)) next.gap = true;
        return store.commit(network, stream, prior, next, events);
      })();
      inflight.set(key, update);
      try { await update; }
      catch (error) {
        if (cooldown.size >= 256) cooldown.delete(cooldown.keys().next().value!);
        cooldown.set(key, Date.now() + 5000);
        throw error;
      } finally { inflight.delete(key); }
    }
  } catch { stale = true; }
  let snapshot;
  try { snapshot = await store.historySnapshot(network, stream, before, search); }
  catch { return Response.json({ error: 'Shared history service unavailable. Retry later.' }, { status: 503 }); }
  const volume = snapshot.volume;
  return Response.json({ ...snapshot,
    volume: { ...volume, lamports: String(volume.lamports), tokens: String(volume.tokens) }, stale }, { headers: noCache });
}
