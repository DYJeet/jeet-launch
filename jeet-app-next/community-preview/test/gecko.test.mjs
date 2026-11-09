import assert from 'node:assert/strict';
import test from 'node:test';
import { candles, createMarketService, markets } from '../lib/gecko.mjs';

const mint = 'So11111111111111111111111111111111111111112';
const pool = 'Fe7bpDYCs74GqiCUF14HwgUMToPKV1d9mDYVX5BTohFr';
const tokenId = 'solana_' + mint;
const entry = {
  attributes: { address: pool, base_token_price_usd: '0.000001', fdv_usd: '9999',
    reserve_in_usd: '100', price_change_percentage: { h24: '-1.5' } },
  relationships: { base_token: { data: { id: tokenId } } },
};
const fixture = {
  data: [entry, entry],
  included: [{ id: tokenId, attributes: { address: mint, name: 'Fixture', symbol: 'FIX' } }],
};

test('preserves provider order and null fields while deduplicating by mint', () => {
  const [market, duplicate] = markets(fixture);
  assert.equal(duplicate, undefined);
  assert.equal(market.pool, pool);
  assert.equal(market.price, .000001);
  assert.equal(market.marketCap, null);
  assert.equal(market.volume, null);
  assert.equal(market.change24h, -1.5);
});

test('keeps valid candle rows in chronological order without filling gaps', () => {
  const before = [3600, 3, 6, 2, 4, 100];
  const after = [10800, 5, 8, 3, 6, 50];
  const invalid = [7200, 5, 1, 2, 4, 0];
  assert.deepEqual(candles({ data: { attributes: { ohlcv_list: [after, invalid, before, after] } } }), [before, after]);
});

test('coalesces requests and serves explicitly stale data during 429 backoff', async () => {
  let time = 0;
  let calls = 0;
  const service = createMarketService({
    now: () => time,
    request: async () => {
      calls++;
      return calls === 2
        ? new Response(null, { status: 429, headers: { 'Retry-After': '75' } })
        : Response.json(fixture);
    },
  });

  const [first, parallel] = await Promise.all([service.feed(), service.feed()]);
  assert.equal(first, parallel);
  assert.equal(calls, 1);
  time = 29_999;
  assert.equal(await service.feed(), first);
  time = 30_000;
  const stale = await service.feed();
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.equal(stale.retryAfter, 75);
  time = 104_999;
  assert.equal((await service.feed()).stale, true);
  assert.equal(calls, 2);
  time = 105_000;
  assert.equal((await service.feed()).stale, false);
  assert.equal(calls, 3);
});

test('restricts history to current snapshot pools and caches successful OHLCV', async () => {
  let calls = 0;
  const service = createMarketService({
    request: async url => {
      calls++;
      return Response.json(url.includes('trending_pools') ? fixture
        : { data: { attributes: { ohlcv_list: [[3600, 3, 6, 2, 4, 100]] } } });
    },
  });
  assert.equal(await service.history('https://private.invalid'), null);
  assert.equal(calls, 0);
  assert.equal(await service.history(mint), null);
  assert.equal(calls, 1);
  assert.equal((await service.history(pool)).data.length, 1);
  await service.history(pool);
  assert.equal(calls, 2);
});
