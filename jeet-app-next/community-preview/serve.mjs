import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import handler from './api/market.js';
import { readFileSync } from 'node:fs';

const files = {
  '/': ['index.html', 'text/html'],
  '/style.css': ['style.css', 'text/css'],
  '/app.js': ['app.js', 'text/javascript'],
  '/jeet-promo.webp': ['jeet-promo.webp', 'image/webp'],
};
const { headers } = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
createServer(async (req, res) => {
  for (const { key, value } of headers[0].headers) res.setHeader(key, value);
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/market') return handler(req, res);
  const file = Object.hasOwn(files, pathname) && files[pathname];
  if (!file || req.method !== 'GET') {
    res.writeHead(404).end('Not found');
    return;
  }
  const [name, type] = file;
  try {
    const data = await readFile(new URL(`./dist/${name}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': type }).end(data);
  } catch {
    res.writeHead(500).end('Run npm run build first.');
  }
}).listen(Number(process.env.PORT ?? 4173), '127.0.0.1');
