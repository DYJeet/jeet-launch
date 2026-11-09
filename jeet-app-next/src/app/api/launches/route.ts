import { address, getAddressDecoder, getBase64Encoder, signature } from "@solana/kit";
import { localReadConfiguration } from "@/lib/local-wallet-server";
import { walletLaunchAddresses } from "@/lib/wallet-launch";
import { readWalletLaunch } from "@/lib/wallet-launch-flow";
import { WalletTransactionExecutor } from "@/lib/wallet-transactions";
import { formatUnits } from "@/lib/wallet-environment";
import { marketStore, type LaunchObservation } from "@/lib/market-store";
import { historyBatchSize, readHistoryPage } from "@/lib/market-ingest";
import { activationMints } from "@/lib/launch-discovery-source";
import { ammHistoryPool } from "@/lib/amm-history";

export const dynamic = "force-dynamic";

const stream = "launch-activations-v1";
const noCache = { "Cache-Control": "no-store" };
const sync = new Map<string, { pending: Promise<void>; until: number; failures: number }>();

async function observe(executor: WalletTransactionExecutor, mint: ReturnType<typeof address>, creator?: ReturnType<typeof address>) {
  if (!creator) {
    const { custody } = await walletLaunchAddresses(mint, mint);
    const { value } = await executor.rpc.getAccountInfo(custody, { encoding: "base64", commitment: "confirmed" })
      .send({ abortSignal: AbortSignal.timeout(8000) });
    if (!value || value.owner !== executor.environment.program || value.executable) return;
    const bytes = getBase64Encoder().encode(value.data[0]);
    if (bytes.length !== 89 || new TextDecoder().decode(bytes.subarray(0, 8)) !== "JEETCST1") return;
    creator = getAddressDecoder().decode(bytes.subarray(40, 72));
  }
  const launch = await readWalletLaunch(executor, mint, creator);
  const { state, terms, metadata } = launch;
  if (!state || !terms || !metadata || !launch.custodyData || !launch.openingData || !launch.mint ||
      launch.mint.mintAuthority || launch.mint.freezeAuthority || state.migrated !== terms.migrated || !state.inventory) return;
  if (terms.migrated) await ammHistoryPool(mint, terms);
  return {
    slot: launch.slot,
    row: { mint, creator, pool: terms.migrated ? terms.pool : undefined, name: metadata.name, symbol: metadata.symbol,
      progress: Number(state.sold * 100n / state.inventory), migrated: state.migrated, activationSlot: terms.createdSlot.toString(),
      volume: (state.rawIn + state.rawOut).toString(), reserve: formatUnits(state.reserve), eligible: state.eligible },
  } satisfies LaunchObservation;
}

async function update(config: ReturnType<typeof localReadConfiguration>, network: string) {
  const store = marketStore();
  const executor = new WalletTransactionExecutor(config.environment, config.url,
    () => ({ status: "disconnected", connected: null }),
    { get: () => null, put: () => { throw Error("Read-only index"); }, remove: () => {} });
  await executor.network();
  const prior = store.checkpoint(network, stream);
  const options = { abortSignal: AbortSignal.timeout(12000) };
  let missing = false;
  const { next, events } = await readHistoryPage(prior, {
    async signatures(before) {
      const rows = await executor.rpc.getSignaturesForAddress(address(config.environment.program), {
        limit: historyBatchSize, before: before ? signature(before) : undefined, commitment: "finalized",
      }).send(options);
      return rows.map(row => ({ signature: row.signature, slot: row.slot, failed: !!row.err }));
    },
    async events(entry) {
      const read = () => executor.rpc.getTransaction(signature(entry.signature), {
        encoding: "json", commitment: "finalized", maxSupportedTransactionVersion: 0,
      }).send(options);
      const tx = await read() ?? await read();
      if (!tx?.meta) {
        missing = true;
        return [];
      }
      if (tx.meta.err || tx.slot !== entry.slot || tx.transaction.signatures[0] !== entry.signature)
        throw Error("Finalized launch transaction identity mismatch.");
      if (!tx.meta.innerInstructions && !tx.meta.logMessages) missing = true;
      return activationMints({ ...tx, meta: tx.meta }, config.environment.program)
        .map(mint => ({ signature: entry.signature, slot: String(entry.slot), mint }));
    },
  });
  const observed = Date.now();
  const launches = [];
  for (const event of events) {
    const observation = await observe(executor, address(event.mint));
    if (observation?.row.activationSlot === event.slot) launches.push(observation);
  }
  const firstAvailable = !prior.backfilled && next.backfilled
    ? await executor.rpc.getFirstAvailableBlock().send(options)
    : 0n;
  if (missing || firstAvailable > 0n) next.gap = true;
  store.commitDiscovery(network, stream, prior, next, launches, observed);

  // Refresh old rows in bounded batches so even confirmed state changes and migrations
  // whose activation pages were already consumed are reflected without a full scan.
  const refresh = await Promise.all(store.oldestLaunches(network, observed - 3000)
    .map(row => observe(executor, address(row.mint), address(row.creator))));
  store.writeLaunches(network, refresh.filter(row => row !== undefined), observed);
}

export async function GET(request: Request) {
  let config;
  try { config = localReadConfiguration(request); }
  catch { return Response.json({ error: "Verified index is unavailable outside the configured local validator." }, { status: 404 }); }
  const network = config.environment.genesis + ":" + config.environment.program;
  try {
    const store = marketStore();
    let job = sync.get(network);
    if (!job || job.until < Date.now()) {
      const state = { pending: Promise.resolve(), until: Infinity, failures: job?.failures ?? 0 };
      state.pending = update(config, network).then(() => {
        state.failures = 0;
        state.until = Date.now() + 1500;
      }, () => {
        state.failures++;
        state.until = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(5, state.failures));
      });
      sync.set(network, state);
      job = state;
    }
    // Existing pages remain responsive while an RPC batch is being fetched.
    const params = new URL(request.url).searchParams;
    if (store.discoveryUpdatedAt(network) === undefined || Number(params.get("retry")) > 0) await job.pending;
    const indexedAt = store.discoveryUpdatedAt(network);
    if (indexedAt === undefined) return Response.json({ error: "Launch index is temporarily unavailable. Retry shortly." }, { status: 503 });
    const checkpoint = store.checkpoint(network, stream);
    return Response.json({ ...store.launchPage(network, params), indexedAt,
      stale: job.failures > 0, backfilling: !!checkpoint.before || !checkpoint.backfilled, gap: !!checkpoint.gap,
    }, { headers: noCache });
  } catch {
    return Response.json({ error: "Launch index is temporarily unavailable. Retry shortly." }, { status: 503 });
  }
}
