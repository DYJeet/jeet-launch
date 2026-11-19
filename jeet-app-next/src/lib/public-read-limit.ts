import { createHmac } from 'node:crypto';
import { SharedBackendClient, sharedBackendConfiguration } from './shared-backend-client.ts';
// Local fallback is only for read-only/local verification. Public writes require shared enforcement.
export function createPublicReadLimiter() {
  const clients = new Map<string, { until: number; count: number }>();
  let window = { until: 0, count: 0 };
  return (client: string, now = Date.now()) => {
    if (now >= window.until) window = { until: now + 60000, count: 0 };
    if (window.count >= 240) return false;
    const key = client.slice(0, 100);
    let state = clients.get(key);
    if (!state || now >= state.until) {
      if (clients.size >= 512) clients.delete(clients.keys().next().value!);
      state = { until: now + 60000, count: 0 };
      clients.set(key, state);
    }
    if (state.count >= 60) return false;
    state.count++; window.count++; return true;
  };
}
export const admitPublicRead = createPublicReadLimiter();
export async function admitPublicRequest(request: Request, scope: 'read' | 'write' | 'upload' = 'read') {
  try {
    const shared = sharedBackendConfiguration();
    const client = request.headers.get('x-real-ip') ?? 'unknown';
    if (shared) {
      // The hosting edge must overwrite this header. Raw client IPs are never stored by the backend.
      const identity = createHmac('sha256', shared.token).update(client.slice(0, 100)).digest('hex');
      return await new SharedBackendClient(shared).call<boolean>('admit', [identity, scope]);
    }
    if (scope !== 'read' && process.env.VERCEL === '1') return false;
    // Preserve the existing private local-validator / Codespace test throughput.
    if (process.env.VERCEL !== '1' && process.env.NEXT_PUBLIC_JEET_PUBLIC_BETA !== '1') return true;
    return admitPublicRead(client);
  } catch { return false; } // No fail-open fallback when a configured shared backend is unavailable.
}
