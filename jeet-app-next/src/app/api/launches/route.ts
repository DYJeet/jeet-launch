import { address, getAddressDecoder, getBase64Encoder } from "@solana/kit";
import { localWalletConfiguration } from "@/lib/local-wallet-server";
import { walletLaunchAddresses } from "@/lib/wallet-launch";
import { readWalletLaunch } from "@/lib/wallet-launch-flow";
import { WalletTransactionExecutor } from "@/lib/wallet-transactions";
import { formatUnits } from "@/lib/wallet-environment";
import { decodeGraduation, GRADUATION_SIZE } from "@/lib/launch-graduation";
import { marketStore } from "@/lib/market-store";
import { indexPage } from "@/lib/launch-index";

export const dynamic = "force-dynamic";

type Configuration = ReturnType<typeof localWalletConfiguration>;
type Row = Awaited<ReturnType<typeof readIndex>>[number];
let cache: { key: string; until: number; indexedAt: number; pending: Promise<Row[]> } | undefined;

async function readIndex({ url, environment }: Configuration) {
  const executor = new WalletTransactionExecutor(environment, url,
    () => ({ status: "disconnected", connected: null }),
    { get: () => null, put: () => { throw Error("Read-only index"); }, remove: () => {} });
  await executor.network();
  const scan = (size: bigint) => executor.rpc.getProgramAccounts(address(environment.program), {
    encoding: "base64", commitment: "confirmed", filters: [{ dataSize: size }],
  }).send({ abortSignal: AbortSignal.timeout(8000) });
  const [accounts, termsAccounts] = await Promise.all([scan(89n), scan(BigInt(GRADUATION_SIZE))]);
  if (accounts.length > 64 || termsAccounts.length > 64) throw Error("Local index capacity exceeded.");
  const activeMints = new Set(termsAccounts.flatMap(entry => {
    if (entry.account.owner !== environment.program || entry.account.executable) return [];
    try {
      return [decodeGraduation(new Uint8Array(getBase64Encoder().encode(entry.account.data[0]))).mint];
    } catch {
      return [];
    }
  }));
  const rows = [];
  for (let offset = 0; offset < accounts.length; offset += 4) {
    const batch = await Promise.all(accounts.slice(offset, offset + 4).map(async entry => {
      if (entry.account.owner !== environment.program || entry.account.executable) return null;
      const bytes = getBase64Encoder().encode(entry.account.data[0]);
      if (bytes.length !== 89 || new TextDecoder().decode(bytes.subarray(0, 8)) !== "JEETCST1") return null;
      const mint = getAddressDecoder().decode(bytes.subarray(8, 40));
      if (!activeMints.has(mint)) return null;
      const creator = getAddressDecoder().decode(bytes.subarray(40, 72));
      if ((await walletLaunchAddresses(mint, creator)).custody !== entry.pubkey) return null;
      const launch = await readWalletLaunch(executor, mint, creator);
      const { state, terms, metadata } = launch;
      if (!state || !terms || !metadata || !launch.mint || launch.mint.mintAuthority ||
          launch.mint.freezeAuthority || state.migrated !== terms.migrated || !state.inventory) return null;
      const progress = Number(state.sold * 100n / state.inventory);
      return {
        mint, creator, pool: terms.migrated ? terms.pool : undefined, name: metadata.name, symbol: metadata.symbol, progress, migrated: state.migrated,
        activationSlot: terms.createdSlot.toString(), volume: (state.rawIn + state.rawOut).toString(),
        reserve: formatUnits(state.reserve), eligible: state.eligible,
      };
    }));
    rows.push(...batch.filter(row => row !== null));
  }
  return rows;
}

export async function GET(request: Request) {
  let config;
  try {
    config = localWalletConfiguration(request);
  } catch {
    return Response.json({ error: "Verified index is unavailable outside the configured local validator." }, { status: 404 });
  }
  const key = config.url + "|" + config.environment.genesis + "|" + config.environment.program;
  const network = config.environment.genesis + ":" + config.environment.program;
  const params = new URL(request.url).searchParams;
  try {
    if (!cache || cache.key !== key || cache.until < Date.now()) {
      const pending = readIndex(config).then(rows => {
        marketStore().writeDiscovery(network, { rows, indexedAt: Date.now() });
        return rows;
      });
      const entry = { key, pending, indexedAt: 0, until: Infinity };
      cache = entry;
      void pending.then(() => { entry.indexedAt = Date.now(); entry.until = entry.indexedAt + 5000; }, () => {
        if (cache === entry) cache = undefined;
      });
    }
    const entry = cache;
    const result = indexPage(await entry.pending, params);
    return Response.json({ ...result, indexedAt: entry.indexedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    try {
      const saved = marketStore().readDiscovery(network);
      if (saved) return Response.json({ ...indexPage(saved.rows, params), indexedAt: saved.indexedAt, stale: true },
        { headers: { "Cache-Control": "no-store" } });
    } catch { /* Storage can be unavailable alongside RPC. */ }
    return Response.json({ error: "Launch index is temporarily unavailable. Retry shortly." }, { status: 503 });
  }
}
