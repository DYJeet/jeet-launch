/** Server-side pacing shared by wallet forwarding and discovery. No signer or caller-selected endpoint. */
import { createDefaultRpcTransport, createSolanaRpcFromTransport, isSolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR } from "@solana/kit";

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

function retryAfterMs(headers: Headers, now: number) {
  const value = headers.get("retry-after");
  if (!value) return 0;
  const ms = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 0;
}

function createRpcCooldown(now: () => number) {
  const until = new Map<string, { status: number; expires: number }>();
  return {
    active(url: string) {
      const state = until.get(url);
      if (!state) return;
      const seconds = Math.ceil((state.expires - now()) / 1000);
      if (seconds > 0) return { status: state.status, seconds };
      until.delete(url);
    },
    record(url: string, status: number, headers: Headers) {
      if (status !== 403 && status !== 429) return;
      const delay = Math.max(status === 403 ? 60000 : 5000, retryAfterMs(headers, now()));
      until.set(url, { status, expires: now() + delay });
    },
  };
}

export function createWalletUpstreamFetch(request: typeof fetch = fetch, wait = pause,
  admit = createWalletRpcScheduler(), now = Date.now, cooldown = createRpcCooldown(now)) {
  return (url: string, raw: string, signal?: AbortSignal) => admit(url, async () => {
    const blocked = cooldown.active(url);
    if (blocked) return new Response(null, { status: blocked.status, headers: { "retry-after": String(blocked.seconds) } });
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      const response = await request(url, { method: "POST", headers: { "content-type": "application/json" },
        body: raw, cache: "no-store", redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      // Retry only explicit rate-limit rejections with the identical wire body.
      const delay = Math.max(500 * 2 ** attempt, retryAfterMs(response.headers, now()));
      if (response.status !== 429 || attempt === 2 || delay > 5000) {
        cooldown.record(url, response.status, response.headers);
        return response;
      }
      await response.body?.cancel();
      await wait(delay, signal);
    }
  }, signal);
}

const rpcCooldown = createRpcCooldown(Date.now);
export const walletUpstreamFetch = createWalletUpstreamFetch(fetch, pause, schedule, Date.now, rpcCooldown);

export function createServerWalletRpc(url: string) {
  // Preserve Kit's lossless Solana integer parsing and request coalescing.
  const upstream = createDefaultRpcTransport({ url });
  return createSolanaRpcFromTransport(args => schedule(url, async () => {
    if (rpcCooldown.active(url)) throw Error("Devnet RPC is in provider cooldown.");
    try {
      return await upstream(args);
    } catch (error) {
      if (isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR))
        rpcCooldown.record(url, error.context.statusCode, error.context.headers);
      throw error;
    }
  }, args.signal));
}
