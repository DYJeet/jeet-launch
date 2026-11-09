import { ADDRESS, createMarketService, FEED_TTL, HISTORY_TTL } from '../lib/gecko.mjs';

const service = createMarketService();

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(405, { error: 'Read-only endpoint' });
  }
  const query = new URL(req.url, 'https://preview.invalid').searchParams;
  const pool = query.get('pool');
  if ([...query].length !== (pool === null ? 0 : 1) || (pool !== null && !ADDRESS.test(pool))) {
    return send(400, { error: 'Invalid market request' });
  }
  try {
    const result = pool ? await service.history(pool) : await service.feed();
    if (!result) return send(404, { error: 'This pool is no longer in the trending snapshot.' });
    if (result.stale) {
      res.setHeader('Vercel-CDN-Cache-Control', `public, s-maxage=${Math.min(result.retryAfter, 30)}`);
    } else {
      const ttl = pool ? HISTORY_TTL : FEED_TTL;
      const remaining = Math.max(1, ttl - Math.floor((Date.now() - result.updatedAt) / 1000));
      res.setHeader('Vercel-CDN-Cache-Control', `public, s-maxage=${remaining}`);
    }
    return send(200, result);
  } catch (error) {
    const seconds = error.seconds ?? 30;
    res.setHeader('Retry-After', String(seconds));
    res.setHeader('Vercel-CDN-Cache-Control', `public, s-maxage=${Math.min(seconds, 30)}`);
    return send(503, { error: 'Market data temporarily unavailable.', retryAfter: seconds });
  }
}
