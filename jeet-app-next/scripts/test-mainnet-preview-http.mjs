// Built Next.js application and local HTTPS fixtures only. No Solana or hosted deployment traffic.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer as httpsServer } from 'node:https';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, request as httpClient } from 'playwright';

const app = resolve(process.env.JEET_MAINNET_HTTP_APP ?? '.');
const program = process.env.NEXT_PUBLIC_JEET_MAINNET_PROGRAM_ID;
assert(program, 'Provide the public fixture identity used to compile the Mainnet preview.');
const dir = await mkdtemp(join(tmpdir(), 'jeet-mainnet-http-'));
const children = [];
const servers = [];
const rpcCalls = [];
const results = [];
const token = 'local-only-mainnet-http-fixture-credential';
let browser;
let http;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function start(args, cwd, extraEnv) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostics = '';
  child.stdout.on('data', bytes => diagnostics += bytes);
  child.stderr.on('data', bytes => diagnostics += bytes);
  child.diagnostics = () => diagnostics.slice(-2000);
  children.push(child);
  return child;
}
async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return server.address().port;
}
function proxy(req, res, port) {
  const outgoing = httpRequest({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers);
    incoming.pipe(res);
  });
  outgoing.on('error', () => { res.writeHead(503); res.end(); });
  req.pipe(outgoing);
}
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(dir, 'fixture-key.pem'), '-out', join(dir, 'fixture-ca.pem'),
    '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const tls = { key: await readFile(join(dir, 'fixture-key.pem')), cert: await readFile(join(dir, 'fixture-ca.pem')) };
  const rpcPort = await listen(httpsServer(tls, async (req, res) => {
    let text = '';
    for await (const part of req) text += part;
    const body = JSON.parse(text);
    rpcCalls.push(body.method);
    let result;
    switch (body.method) {
      case 'getGenesisHash': result = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'; break;
      case 'getSlot': result = 100; break;
      case 'getFirstAvailableBlock': result = 0; break;
      case 'getSignaturesForAddress': result = []; break;
      case 'getBalance': result = { context: { slot: 100 }, value: 10000000 }; break;
      case 'getAccountInfo': result = { context: { slot: 100 }, value: body.params[0] === program
        ? { executable: true, owner: 'BPFLoaderUpgradeab1e11111111111111111111111', lamports: 10000000, data: ['', 'base64'] }
        : null }; break;
      default: throw Error('Unexpected fixture RPC operation ' + body.method);
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
  }));
  const backend = start(['scripts/shared-index-server.mjs'], process.cwd(), {
    NODE_ENV: 'test', JEET_SHARED_MAINNET_PROGRAM_ID: program, JEET_SHARED_DB: join(dir, 'index.sqlite'),
    JEET_SHARED_BACKEND_TOKEN: token, PORT: '0',
  });
  const backendPort = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(backend.diagnostics())), 8000);
    backend.stdout.on('data', bytes => {
      for (const line of bytes.toString().split('\n')) {
        try { const report = JSON.parse(line); if (report.status === 'ready') { clearTimeout(timer); resolve(report.port); } } catch {}
      }
    });
  });
  const indexPort = await listen(httpsServer(tls, (req, res) => proxy(req, res, backendPort)));
  let nextPort;
  const appPort = await listen(httpsServer(tls, (req, res) => proxy(req, res, nextPort)));
  const origin = 'https://127.0.0.1:' + appPort;
  // Bind a free port before selecting it for the single isolated Next process.
  const { createServer } = await import('node:net');
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  nextPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = start(['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(nextPort)], app, {
    NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: join(dir, 'fixture-ca.pem'),
    VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: '127.0.0.1:' + appPort,
    NEXT_PUBLIC_JEET_WALLET_NETWORK: 'mainnet', NEXT_PUBLIC_JEET_MAINNET_PROGRAM_ID: program,
    NEXT_PUBLIC_JEET_PUBLIC_BETA: '0', JEET_MAINNET_READ_PREVIEW: '1',
    JEET_MAINNET_PROGRAM_ID: program, JEET_MAINNET_PREVIEW_ORIGIN: origin,
    JEET_MAINNET_READ_RPC: 'https://127.0.0.1:' + rpcPort,
    JEET_SHARED_BACKEND_URL: 'https://127.0.0.1:' + indexPort,
    JEET_SHARED_BACKEND_TOKEN: token, JEET_DEVNET_WALLET: '', JEET_LOCAL_WALLET: '',
  });
  for (let n = 0; n < 60; n++) {
    if (server.exitCode !== null) throw Error(server.diagnostics());
    try {
      const response = await fetch('http://127.0.0.1:' + nextPort, { headers: { host: '127.0.0.1:' + appPort } });
      if (response.ok) break;
    } catch {}
    if (n === 59) throw Error('Next startup deadline exceeded. ' + server.diagnostics());
    await pause(250);
  }
  http = await httpClient.newContext({ ignoreHTTPSErrors: true });
  const request = http;
  const env = await request.get(origin + '/api/wallet/environment');
  assert.equal(env.status(), 200, await env.text());
  assert.equal((await env.json()).chain, 'solana:mainnet');
  results.push('built environment endpoint returns the compiled Mainnet program and genesis');
  const post = (path, data) => request.post(origin + path, { data, headers: { 'content-type': 'application/json', origin } });
  for (const method of ['sendTransaction', 'simulateTransaction']) {
    const r = await post('/api/wallet/rpc', { jsonrpc: '2.0', id: 1, method,
      params: ['AQ==', { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 0 }] });
    assert.equal(r.status(), 403, await r.text());
  }
  for (const path of ['/api/local-assets', '/api/local-test/create']) assert.equal((await post(path, {})).status(), 403);
  assert.equal((await request.get(origin + '/api/local-test/health')).status(), 404);
  assert.equal((await request.get(origin + '/api/wallet/environment', { headers: { origin: 'https://foreign.example' } })).status(), 503);
  const balance = await post('/api/wallet/rpc', { jsonrpc: '2.0', id: 2, method: 'getBalance', params: [program] });
  assert.equal(balance.status(), 200, await balance.text());
  results.push('transaction forwarding, simulation and uploads stay closed while read-only RPC works');
  results.push('foreign origins and local diagnostics are rejected');

  const httpOnly = process.env.JEET_MAINNET_HTTP_ONLY === '1';
  if (!httpOnly) {
    browser = await chromium.launch({ executablePath: process.env.JEET_CHROMIUM_BIN ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/create');
    await page.getByRole('heading', { name: 'Mainnet creation preview' }).waitFor();
    await page.getByRole('status').filter({ hasText: 'disabled pending release acceptance' }).waitFor();
    assert.equal(await page.locator('input').count(), 0);
    await page.goto(origin + '/explore');
    await page.getByText('No verified launches match this view.').waitFor({ timeout: 10000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
    results.push('desktop and mobile browser viewports show truthful disabled creation and empty discovery without hydration errors or horizontal overflow');
    await context.close();
  } else {
    for (const path of ['/create', '/explore', '/revenue']) {
      const response = await request.get(origin + path);
      assert.equal(response.status(), 200);
      const html = await response.text();
      assert(html.includes('Private Mainnet release preview'));
      if (path === '/create') assert(html.includes('Mainnet creation preview'));
    }
    results.push('built Create, Explore and Revenue pages serve the Mainnet read-only release notice');
  }
  assert(!rpcCalls.some(method => method === 'sendTransaction' || method === 'simulateTransaction'));
  const report = { status: httpOnly ? 'PASS_HTTP_BROWSER_PENDING' : 'PASS', browserAcceptance: httpOnly ? 'deferred: this run covers HTTP only' : 'desktop and mobile emulation passed', evidence: 'local HTTPS application with synthetic Mainnet RPC and real local SQLite backend',
    realSolanaRequests: 0, transactionsSubmitted: 0, viewportSizes: httpOnly ? [] : ['1365x900', '390x844'], checks: results };
  console.log(JSON.stringify(report, null, 2));
  if (process.env.JEET_MAINNET_HTTP_REPORT)
    await writeFile(process.env.JEET_MAINNET_HTTP_REPORT, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
} finally {
  await browser?.close();
  await http?.dispose();
  for (const server of servers.reverse()) { server.closeAllConnections(); server.close(); }
  for (const child of children.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const finished = once(child, 'exit');
    child.kill('SIGTERM');
    await finished;
  }
}
