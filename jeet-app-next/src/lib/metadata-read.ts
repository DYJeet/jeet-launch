// Browser-only immutable asset cache; never stores failures, credentials or unvalidated URLs.
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
  const response = await request(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw Error(response.status === 403
    ? 'The metadata gateway denied this request (HTTP 403). Token facts remain available; off-chain metadata could not be verified.'
    : 'Metadata gateway unavailable. Token facts remain available; retry later.');
  const reader = response.body?.getReader(); if (!reader) throw Error('Empty asset response.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const part = await reader.read(); if (part.done) break;
    size += part.value.length; if (size > maximum) { await reader.cancel(); throw Error('Metadata asset exceeds size limit.'); } chunks.push(part.value); }
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
