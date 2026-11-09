const byId = id => document.getElementById(id);
const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 });
const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 6 });
const localTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
let snapshot;
let feedMessage = 'Loading Solana markets…';
let feedTimer;
let feedRequest;
let suspended = false;
let activePool;
let chartState;
let chartRequest;

function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}

function external(label, url) {
  const anchor = node('a', label);
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  return anchor;
}

const format = (value, formatter) => value == null ? '—' : formatter.format(value);
const change = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

function stats(market) {
  const list = node('dl', undefined, 'stats');
  for (const [label, value, color] of [
    ['Price', format(market.price, price)],
    ['1h change', change(market.change1h), market.change1h > 0 ? 'up' : market.change1h < 0 ? 'down' : ''],
    ['24h change', change(market.change24h), market.change24h > 0 ? 'up' : market.change24h < 0 ? 'down' : ''],
    ['Pool liquidity', format(market.liquidity, money)],
    ['24h pool volume', format(market.volume, money)],
    ['Market cap', format(market.marketCap, money)],
  ]) {
    const item = node('div');
    item.append(node('dt', label), node('dd', value, color));
    list.append(item);
  }
  return list;
}

function renderMarkets() {
  const holder = byId('markets');
  const focused = holder.contains(document.activeElement) ? document.activeElement.hash : null;
  const query = byId('search').value.toLowerCase().trim();
  const min = Number(byId('liquidity').value);
  const sort = byId('sort').value;
  const filtered = (snapshot?.data ?? []).filter(market =>
    (!min || market.liquidity >= min) &&
    [market.name, market.symbol, market.mint].some(value => value.toLowerCase().includes(query)));
  if (sort) filtered.sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity) || 0);

  const cards = filtered.map(market => {
    const card = node('a', undefined, 'market-card');
    card.href = `#market/${market.pool}`;
    card.append(node('h3', `${market.name} · ${market.symbol}`), node('span', market.pair, 'pair'),
      node('span', `Mint ${market.mint}`, 'mint'), stats(market));
    return card;
  });
  if (snapshot && !filtered.length) cards.push(node('p', 'No pools match these filters.', 'panel'));
  holder.replaceChildren(...cards);
  if (focused) cards.find(card => card.hash === focused)?.focus({ preventScroll: true });
  const count = snapshot ? ` · ${filtered.length} of ${snapshot.data.length} tokens` : '';
  byId('feed-status').textContent = feedMessage + count;
}

function snapshotStatus(result) {
  return `${result.stale ? 'Cached snapshot' : 'Last updated'} · ${localTime.format(result.updatedAt)}`;
}

async function getMarket(path, controller = new AbortController()) {
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, { signal: controller.signal, credentials: 'omit' });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error), { retryAfter: result.retryAfter });
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshFeed() {
  if (suspended || feedRequest) return;
  const request = getMarket('/api/market');
  feedRequest = request;
  let wait = 30;
  try {
    const next = await request;
    if (next.updatedAt !== snapshot?.updatedAt || next.stale !== snapshot?.stale) {
      snapshot = next;
      feedMessage = snapshotStatus(next);
      renderMarkets();
      renderDetail();
    } else {
      feedMessage = snapshotStatus(next);
      byId('feed-status').textContent = feedMessage + ` · ${byId('markets').querySelectorAll('a').length} of ${next.data.length} tokens`;
    }
    wait = Math.max(wait, next.retryAfter ?? 0);
  } catch (error) {
    wait = Math.max(wait, error.retryAfter ?? 0);
    feedMessage = snapshot
      ? `Refresh unavailable · cached snapshot from ${localTime.format(snapshot.updatedAt)}`
      : 'Solana markets are temporarily unavailable. Retrying automatically.';
    renderMarkets();
    renderDetail();
  }
  feedRequest = undefined;
  if (!suspended) {
    loadChart();
    feedTimer = setTimeout(refreshFeed, wait * 1000);
  }
}

function renderDetail() {
  if (!activePool) return;
  const market = snapshot?.data.find(entry => entry.pool === activePool);
  const holder = byId('detail-market');
  if (!market) {
    byId('detail-title').textContent = 'Market detail';
    holder.replaceChildren(node('p', snapshot
      ? 'This market has rotated out of the current trending snapshot.'
      : feedMessage, 'muted'));
    byId('detail').querySelector('.chart').hidden = true;
    return;
  }
  byId('detail-title').textContent = `${market.name} · ${market.symbol}`;
  const panel = node('article', undefined, 'panel');
  panel.append(node('p', `${market.pair} · ${market.dex}`, 'muted'),
    node('p', `Token mint ${market.mint}`, 'mint'),
    node('p', `Pool ${market.pool}`, 'mint'),
    node('p', feedMessage, 'status'), stats(market));
  const links = node('div', undefined, 'actions');
  links.append(external('GeckoTerminal pool ↗', `https://www.geckoterminal.com/solana/pools/${market.pool}`),
    external('DEX Screener market ↗', `https://dexscreener.com/solana/${market.pool}`),
    external('Solscan mint ↗', `https://solscan.io/token/${market.mint}`));
  panel.append(links);
  holder.replaceChildren(panel);
  byId('detail').querySelector('.chart').hidden = false;
}

function svgNode(tag, attributes, label) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (label) element.textContent = label;
  return element;
}

function showChart(rows) {
  const target = byId('chart');
  if (!rows.length) {
    target.replaceChildren(node('p', 'GeckoTerminal has no hourly candles for this pool yet.', 'muted'));
    return;
  }

  const high = Math.max(...rows.map(row => row[2]));
  const low = Math.min(...rows.map(row => row[3]));
  const spread = high - low || high * .02;
  const first = rows[0][0];
  const last = rows.at(-1)[0];
  const y = value => 18 + 162 * (high + spread * .04 - value) / (spread * 1.08);
  const x = timestamp => last === first ? 135 : 10 + 250 * (timestamp - first) / (last - first);
  const width = Math.max(1, Math.min(12, 115 / Math.max(1, (last - first) / 3600)));
  const svg = svgNode('svg', { viewBox: '0 0 360 200', role: 'img', 'aria-label': 'Hourly USD price candlesticks. Exact values are available below.' });
  for (const value of [...new Set([high, (low + high) / 2, low])]) {
    const tick = y(value);
    svg.append(svgNode('line', { x1: 5, x2: 265, y1: tick, y2: tick, stroke: '#354032' }),
      svgNode('text', { x: 271, y: tick + 3, fill: '#a6b2a4', 'font-size': 8 }, price.format(value)));
  }
  for (const [time, open, hi, lo, close] of rows) {
    const center = x(time);
    const color = close >= open ? '#9cff43' : '#ff9d9d';
    svg.append(svgNode('line', { x1: center, x2: center, y1: y(hi), y2: y(lo), stroke: color }),
      svgNode('rect', { x: center - width / 2, y: Math.min(y(open), y(close)), width, height: Math.max(1, Math.abs(y(open) - y(close))), fill: color }));
  }

  const details = node('details');
  details.open = target.querySelector('details')?.open ?? false;
  const wrapper = node('div', undefined, 'table-wrap');
  const table = node('table');
  const header = table.createTHead().insertRow();
  for (const label of ['Local time', 'Open', 'High', 'Low', 'Close', 'Volume (USD)']) {
    const cell = node('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const [time, open, hi, lo, close, volume] of [...rows].reverse()) {
    const row = body.insertRow();
    row.insertCell().textContent = localTime.format(time * 1000);
    for (const value of [open, hi, lo, close]) row.insertCell().textContent = String(value);
    row.insertCell().textContent = String(volume);
  }
  wrapper.append(table);
  details.append(node('summary', 'View exact hourly OHLCV values'), wrapper);
  const range = node('p', `${localTime.format(first * 1000)} to ${localTime.format(last * 1000)} · Local time`, 'status');
  target.replaceChildren(svg, range, details);
}

async function loadChart() {
  if (!activePool || chartRequest || !snapshot?.data.some(entry => entry.pool === activePool) ||
      Date.now() < (chartState?.nextAttempt ?? 0)) return;
  const controller = new AbortController();
  chartRequest = controller;
  const pool = activePool;
  try {
    const result = await getMarket(`/api/market?pool=${pool}`, controller);
    if (chartRequest !== controller) return;
    if (result.updatedAt !== chartState?.updatedAt) showChart(result.data);
    chartState = { updatedAt: result.updatedAt, nextAttempt: Date.now() + (result.retryAfter ?? 120) * 1000 };
    byId('chart-status').textContent = snapshotStatus(result) + ' · GeckoTerminal OHLCV';
  } catch (error) {
    if (chartRequest !== controller) return;
    const message = chartState?.updatedAt
      ? `Chart refresh unavailable · cached candles from ${localTime.format(chartState.updatedAt)}`
      : error.message || 'Chart history temporarily unavailable.';
    byId('chart-status').textContent = message;
    chartState = { ...chartState, nextAttempt: Date.now() + (error.retryAfter ?? 30) * 1000 };
  } finally {
    if (chartRequest === controller) chartRequest = undefined;
  }
}

function navigate() {
  const hash = location.hash.slice(1);
  if (hash === 'main') return;
  const [route, pool] = hash.split('/');
  activePool = route === 'market' && address.test(pool ?? '') ? pool : undefined;
  chartRequest?.abort();
  chartRequest = undefined;
  chartState = undefined;
  byId('chart').replaceChildren();
  byId('chart-status').textContent = 'Loading hourly OHLCV…';
  const view = activePool ? 'detail' : ['create', 'launches', 'trending'].includes(route) ? route : 'home';
  for (const id of ['home', 'trending', 'launches', 'create', 'detail']) {
    byId(id).hidden = id !== view && !(view === 'home' && id === 'trending');
  }
  for (const link of document.querySelectorAll('nav a')) {
    if (link.hash === `#${view === 'detail' ? 'trending' : view}`) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (activePool) {
    renderDetail();
    loadChart();
  }
  window.scrollTo(0, 0);
  if (hash) {
    const heading = byId(view).querySelector('h1, h2');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

for (const id of ['search', 'sort', 'liquidity']) byId(id).addEventListener('input', renderMarkets);
for (const [id, target, placeholder] of [
  ['draft-name', 'preview-name', 'Your token name'],
  ['draft-ticker', 'preview-ticker', 'TICKER'],
  ['draft-desc', 'preview-desc', 'Your description appears here.'],
]) {
  byId(id).addEventListener('input', event => {
    byId(target).textContent = event.target.value.trim() || placeholder;
  });
}
let draftImage;
byId('draft-image').addEventListener('change', event => {
  if (draftImage) URL.revokeObjectURL(draftImage);
  draftImage = undefined;
  const [file] = event.target.files;
  const image = byId('draft-art');
  image.hidden = true;
  image.removeAttribute('src');
  if (file && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size <= 5 * 1024 * 1024) {
    draftImage = URL.createObjectURL(file);
    image.src = draftImage;
    image.hidden = false;
    byId('image-status').textContent = 'Image loaded locally.';
  } else {
    byId('image-status').textContent = 'Choose a PNG, JPEG or WebP up to 5 MB.';
  }
});

window.addEventListener('hashchange', navigate);
window.addEventListener('pagehide', () => {
  suspended = true;
  clearTimeout(feedTimer);
});
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  suspended = false;
  refreshFeed();
});
navigate();
refreshFeed();
