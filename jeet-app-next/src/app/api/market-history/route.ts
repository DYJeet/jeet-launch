import { address, createSolanaRpc, getBase64Encoder, signature } from "@solana/kit";
import { localWalletConfiguration, checkedLocalGenesis } from "@/lib/local-wallet-server";
import { marketStore, type MarketEvent } from "@/lib/market-store";
import { historyBatchSize, readHistoryPage } from "@/lib/market-ingest";
import { walletLaunchAddresses } from "@/lib/wallet-launch";
import { decodeGraduation, graduationAddresses } from "@/lib/launch-graduation";
import { ammHistoryPool, ammTradeEvents } from "@/lib/amm-history";
import { curveTradeEvents, feeClaimEvents } from "@/lib/curve-history";

export const dynamic = "force-dynamic";
const inflight = new Map<string, Promise<boolean>>();
const cooldown = new Map<string, number>();
const noCache = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  let config;
  try { config = localWalletConfiguration(request); }
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
  const store = marketStore();
  let stale = false;
  try {
    const existing = inflight.get(key);
    if (existing) await existing;
    else if (inflight.size >= 4 || (cooldown.get(key) ?? 0) > Date.now()) stale = true;
    else {
      const update = (async () => {
        await checkedLocalGenesis(config.url, config.environment.genesis);
        const rpc = createSolanaRpc(config.url);
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
        const prior = store.checkpoint(network, stream);
        let missing = false;
        const { events, next } = await readHistoryPage<MarketEvent>(prior, {
          async signatures(cursor) {
            return (await rpc.getSignaturesForAddress(pool?.pool ?? curve, {
              commitment: "finalized", limit: historyBatchSize, before: cursor ? signature(cursor) : undefined,
            }).send(options)).map(entry => ({ signature: entry.signature, slot: entry.slot, failed: !!entry.err }));
          },
          async events(entry) {
            const read = () => rpc.getTransaction(signature(entry.signature), {
              encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0,
            }).send(options);
            const tx = await read() ?? await read();
            if (!tx?.meta) { missing = true; return []; }
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
              if (!tx.meta.innerInstructions) { missing = true; return []; }
              return ammTradeEvents(tx, pool).map(event => trade(event, "swap:" + event.index));
            }
            if (!tx.meta.logMessages || tx.meta.logMessages.includes("Log truncated")) { missing = true; return []; }
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
        });
        const firstAvailable = !prior.backfilled && next.backfilled
          ? await rpc.getFirstAvailableBlock().send(options) : 0n;
        if (missing || firstAvailable > 0n) next.gap = true;
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
  const volume = store.marketVolume(network, stream);
  return Response.json({ ...store.history(network, stream, before, search),
    checkpoint: store.checkpoint(network, stream), volume: { ...volume, lamports: String(volume.lamports), tokens: String(volume.tokens) }, stale }, { headers: noCache });
}
