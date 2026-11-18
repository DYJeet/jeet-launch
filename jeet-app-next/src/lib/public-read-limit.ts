// Per-instance admission only: not a distributed quota or authentication boundary.
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
