export const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const FEED_TTL = 30;
export const HISTORY_TTL = 120;
const BASE = 'https://api.geckoterminal.com/api/v2/networks/solana';

function numeric(value, minimum = 0) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= minimum ? result : null;
}

export function markets(payload) {
  if (!Array.isArray(payload?.data) || !Array.isArray(payload?.included)) throw new Error('Invalid feed');
  const included = new Map(payload.included.map(entry => [entry.id, entry.attributes]));
  const seen = new Set();
  const rows = [];
  for (const { attributes: pool, relationships } of payload.data) {
    const token = included.get(relationships?.base_token?.data?.id);
    if (!ADDRESS.test(pool?.address ?? '') || !ADDRESS.test(token?.address ?? '') ||
        typeof token.name !== 'string' || typeof token.symbol !== 'string' || seen.has(token.address)) continue;
    seen.add(token.address);
    rows.push({
      pool: pool.address,
      mint: token.address,
      name: token.name,
      symbol: token.symbol,
      pair: typeof pool.name === 'string' ? pool.name : token.symbol,
      dex: included.get(relationships?.dex?.data?.id)?.name ?? 'Solana DEX',
      price: numeric(pool.base_token_price_usd),
      liquidity: numeric(pool.reserve_in_usd),
      volume: numeric(pool.volume_usd?.h24),
      marketCap: numeric(pool.market_cap_usd),
      change1h: numeric(pool.price_change_percentage?.h1, -Infinity),
      change24h: numeric(pool.price_change_percentage?.h24, -Infinity),
    });
  }
  if (payload.data.length && !rows.length) throw new Error('No valid markets in feed');
  return rows;
}

export function candles(payload) {
  const rows = payload?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(rows)) throw new Error('Invalid history');
  const unique = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 6 || !row.every(Number.isFinite)) continue;
    const [time, open, high, low, close, volume] = row;
    if (!Number.isSafeInteger(time) || time <= 0 || low <= 0 || volume < 0 ||
        low > Math.min(open, close) || high < Math.max(open, close)) continue;
    unique.set(time, row);
  }
  if (rows.length && !unique.size) throw new Error('No valid candles');
  return [...unique.values()].sort((a, b) => a[0] - b[0]);
}

class Unavailable extends Error {
  constructor(seconds) {
    super('Market provider temporarily unavailable');
    this.seconds = Math.max(1, Math.ceil(seconds));
  }
}

export function createMarketService({ request = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  let historyCalls = [];
  let cooldownUntil = 0;
  let failures = 0;

  async function upstream(path, normalize, history = false) {
    const time = now();
    if (time < cooldownUntil) throw new Unavailable((cooldownUntil - time) / 1000);
    if (history) {
      historyCalls = historyCalls.filter(start => start > time - 60_000);
      if (historyCalls.length >= 18) throw new Unavailable((historyCalls[0] + 60_000 - time) / 1000);
      historyCalls.push(time);
    }
    let retryAfter = 0;
    try {
      const response = await request(BASE + path, {
        headers: { Accept: 'application/json;version=20230302' },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        const hint = response.headers.get('retry-after');
        if (hint) {
          const seconds = Number(hint);
          retryAfter = Number.isFinite(seconds) ? seconds : (Date.parse(hint) - now()) / 1000 || 0;
        }
        if (response.status === 429) retryAfter = Math.max(retryAfter, 60);
        throw new Error('Upstream HTTP error');
      }
      const data = normalize(await response.json());
      failures = 0;
      return data;
    } catch {
      failures++;
      const seconds = Math.max(retryAfter, Math.min(300, 15 * 2 ** Math.min(failures - 1, 5)));
      cooldownUntil = Math.max(cooldownUntil, now() + seconds * 1000);
      throw new Unavailable(seconds);
    }
  }

  async function read(key, ttl, load) {
    const prior = cache.get(key);
    const age = prior ? (now() - prior.updatedAt) / 1000 : Infinity;
    if (age < ttl) return prior;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      try {
        const data = await load();
        const result = { data, updatedAt: now(), stale: false };
        cache.delete(key);
        cache.set(key, result);
        if (cache.size > 96) cache.delete(cache.keys().next().value);
        return result;
      } catch (error) {
        const retryAfter = error instanceof Unavailable ? error.seconds : 30;
        if (prior && age < 900) return { ...prior, stale: true, retryAfter };
        throw new Unavailable(retryAfter);
      }
    })();
    pending.set(key, work);
    try {
      return await work;
    } finally {
      pending.delete(key);
    }
  }

  const feed = () => read('trending', FEED_TTL, () =>
    upstream('/trending_pools?include=base_token,quote_token,dex&page=1&duration=24h', markets));

  return {
    feed,
    async history(pool) {
      if (!ADDRESS.test(pool) || !(await feed()).data.some(market => market.pool === pool)) return null;
      return read(pool, HISTORY_TTL, () =>
        upstream(`/pools/${pool}/ohlcv/hour?aggregate=1&limit=48&currency=usd&token=base&include_empty_intervals=false`, candles, true));
    },
  };
}
