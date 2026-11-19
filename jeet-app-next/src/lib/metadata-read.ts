// Browser-only immutable asset cache. Callers validate allowed URLs before reading,
// and validate content hashes, schema and image bytes before caching success.
const entries = new Map<string, { bytes: Uint8Array; until: number }>();
let used = 0;
const budget = 4 * 1024 * 1024;
export async function readBoundedMetadata(url: string, maximum: number, signal: AbortSignal, request: typeof fetch = fetch) {
  signal.throwIfAborted();
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 2097152) throw Error('Invalid metadata byte limit.');
  const old = entries.get(url);
  if (old && old.until > Date.now()) {
    if (old.bytes.length > maximum) throw Error('Metadata asset exceeds size limit.');
    return old.bytes.slice();
  }
  const key = url + ':' + maximum;
  let pending = inflight.get(key);
  if (!pending || pending.request !== request) {
    // One caller cancelling must not cancel another component's identical read.
    const promise = load(url, maximum, request);
    pending = { request, promise }; inflight.set(key, pending);
    void promise.finally(() => { if (inflight.get(key)?.promise === promise) inflight.delete(key); }).catch(() => {});
  }
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    pending.promise.then(bytes => { if (!signal.aborted) resolve(bytes.slice()); }, reject)
      .finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
const inflight = new Map<string, { request: typeof fetch; promise: Promise<Uint8Array> }>();
// Provider cooldowns are not cached metadata successes. Share them across assets on a gateway.
const cooldowns = new Map<string, number>();
async function load(url: string, maximum: number, request: typeof fetch) {
  const origin = new URL(url).origin;
  const limited = () => Error('The metadata gateway is rate limited (HTTP 429). Token facts remain available; retry after the provider cooldown.');
  if ((cooldowns.get(origin) ?? 0) > Date.now()) throw limited();
  if (inflight.size >= 32) throw Error('Metadata reader busy; retry later.');
  const timeout = AbortSignal.timeout(15000);
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await request(url, { cache: 'no-store', redirect: 'error', signal: timeout });
    if (response.status !== 429) break;
    const header = response.headers.get('retry-after');
    const parsed = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : NaN;
    const delay = Math.max(500 * 2 ** attempt, Number.isFinite(parsed) ? parsed : 30000);
    cooldowns.set(origin, Date.now() + delay);
    await response.body?.cancel();
    // At most one retry, and never earlier than Retry-After. Long/unknown limits are surfaced.
    if (attempt === 1 || delay > 2000) throw limited();
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(timeout.reason); };
      const timer = setTimeout(() => { timeout.removeEventListener('abort', abort); resolve(); }, delay);
      timeout.addEventListener('abort', abort, { once: true });
    });
    if ((cooldowns.get(origin) ?? 0) > Date.now()) throw limited();
  }
  if (!response.ok) { await response.body?.cancel(); throw Error(response.status === 403
    ? 'The metadata gateway denied this request (HTTP 403). Token facts remain available; off-chain metadata could not be verified.'
    : 'Metadata gateway unavailable. Token facts remain available; retry later.'); }
  const reader = response.body?.getReader(); if (!reader) throw Error('Empty asset response.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > maximum) throw Error('Metadata asset exceeds size limit.'); chunks.push(part.value); }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
// Called only after content hash / image / schema validation succeeds.
export function cacheValidatedMetadata(url: string, bytes: Uint8Array) {
  if (bytes.length > budget) return;
  const prior = entries.get(url); if (prior) { used -= prior.bytes.length; entries.delete(url); }
  while (used + bytes.length > budget || entries.size >= 32) {
    const key = entries.keys().next().value; if (key === undefined) break;
    used -= entries.get(key)!.bytes.length; entries.delete(key);
  }
  entries.set(url, { bytes: bytes.slice(), until: Date.now() + 300000 }); used += bytes.length;
}
