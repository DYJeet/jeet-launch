import type { Checkpoint, LaunchObservation, MarketEvent, MarketStore } from './market-store.ts';

// Server-only credentials; this module is never imported by a client component.
export function sharedBackendConfiguration() {
  const endpoint = process.env.JEET_SHARED_BACKEND_URL;
  const token = process.env.JEET_SHARED_BACKEND_TOKEN;
  if (!endpoint && !token) return;
  if (!endpoint || !token || token.length < 32 || token.length > 256) throw Error('Shared backend configuration is incomplete.');
  const url = new URL(endpoint);
  const local = process.env.NODE_ENV !== 'production' && process.env.JEET_BACKEND_ALLOW_LOOPBACK === '1' &&
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw Error('Shared backend requires an explicit HTTPS origin.');
  return { url: url.origin, token };
}

export const backendJson = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { __jeet_u64: v.toString() } : v);
export function backendParse(value: string): unknown {
  return JSON.parse(value, (_, v) => {
    if (v && typeof v === 'object' && Object.hasOwn(v, '__jeet_u64')) {
      if (Object.keys(v).length !== 1 || !/^(0|[1-9]\d{0,19})$/.test(v.__jeet_u64) || BigInt(v.__jeet_u64) > (1n << 64n) - 1n)
        throw Error('Invalid backend integer.');
      return BigInt(v.__jeet_u64);
    }
    return v;
  });
}
export class SharedBackendClient {
  readonly configuration: { url: string; token: string };
  readonly request: typeof fetch;
  constructor(configuration: { url: string; token: string }, request: typeof fetch = fetch) { this.configuration = configuration; this.request = request; }
  async call<T>(op: string, args: unknown[]): Promise<T> {
    try {
      const response = await this.request(this.configuration.url + '/v1/index', {
        method: 'POST', headers: { authorization: 'Bearer ' + this.configuration.token, 'content-type': 'application/json', 'user-agent': 'JeeT-Launch-Backend/1.0' },
        body: backendJson({ op, args }), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw Error('Backend unavailable.');
      const reader = response.body?.getReader();
      if (!reader) throw Error('Empty backend response.');
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > 262144) { await reader.cancel(); throw Error('Backend response too large.'); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
      return (backendParse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { result: T }).result;
    } catch { throw Error('Shared index or request quota is temporarily unavailable.'); }
  }
}
export class RemoteMarketStore {
  readonly backend: SharedBackendClient;
  constructor(backend: SharedBackendClient) { this.backend = backend; }
  checkpoint(...args: Parameters<MarketStore['checkpoint']>) { return this.backend.call<Checkpoint>('checkpoint', args); }
  commit(...args: Parameters<MarketStore['commit']>) { return this.backend.call<boolean>('commit', args); }
  commitDiscovery(...args: Parameters<MarketStore['commitDiscovery']>) { return this.backend.call<boolean>('commitDiscovery', args); }
  writeLaunches(...args: Parameters<MarketStore['writeLaunches']>) { return this.backend.call<void>('writeLaunches', args); }
  oldestLaunches(...args: Parameters<MarketStore['oldestLaunches']>) { return this.backend.call<ReturnType<MarketStore['oldestLaunches']>>('oldestLaunches', args); }
  discoveryUpdatedAt(...args: Parameters<MarketStore['discoveryUpdatedAt']>) { return this.backend.call<number | null>('discoveryUpdatedAt', args).then(v => v ?? undefined); }
  launchPage(network: string, params: URLSearchParams) { return this.backend.call<ReturnType<MarketStore['launchPage']>>('launchPage', [network, params.toString()]); }
  marketVolume(...args: Parameters<MarketStore['marketVolume']>) { return this.backend.call<ReturnType<MarketStore['marketVolume']>>('marketVolume', args); }
  history(...args: Parameters<MarketStore['history']>) { return this.backend.call<ReturnType<MarketStore['history']>>('history', args); }
  historySnapshot(...args: Parameters<MarketStore['historySnapshot']>) { return this.backend.call<ReturnType<MarketStore['historySnapshot']>>('historySnapshot', args); }
}
export type SharedIndex = Pick<MarketStore, 'checkpoint' | 'commit' | 'commitDiscovery' | 'writeLaunches' | 'oldestLaunches' | 'discoveryUpdatedAt' | 'launchPage' | 'marketVolume' | 'history'> | RemoteMarketStore;
export type { LaunchObservation, MarketEvent };
