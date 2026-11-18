/** Server-side pacing shared by wallet forwarding and discovery. No signer or caller-selected endpoint. */
import { createDefaultRpcTransport, createSolanaRpcFromTransport } from "@solana/kit";

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal?.reason); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  signal?.addEventListener("abort", abort, { once: true });
});

export function createWalletRpcScheduler(wait = pause, now = Date.now) {
  const queues = new Map<string, { tail: Promise<void>; count: number; next: number }>();
  return async function schedule<T>(url: string, job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // Local validator tests retain their existing throughput; public endpoints are paced.
    if (new URL(url).protocol === "http:") return job();
    let q = queues.get(url);
    if (!q) { q = { tail: Promise.resolve(), count: 0, next: 0 }; queues.set(url, q); }
    if (q.count >= 12) throw Error("Wallet RPC busy; retry shortly.");
    q.count++;
    const prior = q.tail;
    let release!: () => void;
    q.tail = new Promise<void>(resolve => { release = resolve; });
    try {
      await prior;
      signal?.throwIfAborted();
      await wait(Math.max(0, q.next - now()), signal);
      return await job();
    } finally { q.next = now() + 350; q.count--; release(); }
  };
}

const schedule = createWalletRpcScheduler();
export function createWalletUpstreamFetch(request: typeof fetch = fetch, wait = pause,
  admit = createWalletRpcScheduler()) {
  return (url: string, raw: string, signal?: AbortSignal) => admit(url, async () => {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const response = await request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: raw, cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      // Retry only an explicit rate-limit rejection, always with the identical body/wire.
      // A timeout or ambiguous send response must be reconciled by its saved signature.
      if (response.status !== 429 || attempt === 2) return response;
      const header = response.headers.get("retry-after");
      const retryMs = header ? (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
      const delay = Math.max(500 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0);
      if (delay > 5000) return response; // Do not retry earlier than a longer provider cooldown.
      await response.body?.cancel();
      await wait(delay, signal);
    }
  }, signal);
}
export const walletUpstreamFetch = createWalletUpstreamFetch(fetch, pause, schedule);

export function createServerWalletRpc(url: string) {
  // Preserve Kit's lossless Solana integer parsing and request coalescing.
  const upstream = createDefaultRpcTransport({ url });
  return createSolanaRpcFromTransport(args => schedule(url, () => upstream(args), args.signal));
}
