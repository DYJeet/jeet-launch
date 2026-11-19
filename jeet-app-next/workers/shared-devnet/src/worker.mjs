import { DurableObject } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createSharedBackend } from '../../../src/lib/shared-backend.ts';

const OBJECT_NAME = 'jeet-devnet-v1'; // Stable across every deployment; never shard/reset global quotas by request.
function authorized(request, token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256) return false;
  const actual = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export class JeetSharedIndex extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    const bindings = (values) => values.map(v => typeof v === 'bigint' ? v.toString() : v);
    const database = {
      // transactionSync below encloses the entire synchronous operation, including all legacy SQL calls.
      exec(query) {
        if (/^\s*(BEGIN(?: IMMEDIATE)?|COMMIT|ROLLBACK)\s*;?\s*$/i.test(query)) return;
        const statements = query.replace(/PRAGMA\s+[^;]+;/gi, '');
        if (statements.trim()) sql.exec(statements).toArray();
      },
      prepare(query) {
        const rows = (...values) => sql.exec(query, ...bindings(values)).toArray();
        return {
          all: rows,
          get: (...values) => rows(...values)[0],
          iterate: rows, // Fully consume before any await: no cursor crosses an input gate.
          run(...values) {
            rows(...values);
            return { changes: Number(sql.exec('SELECT changes() AS affected').one().affected), lastInsertRowid: 0 };
          },
        };
      },
      close() {}, // Runtime owns the Durable Object lifecycle.
    };
    this.backend = createSharedBackend(':memory:', env.JEET_SHARED_BACKEND_TOKEN, undefined, {
      database, transaction: run => ctx.storage.transactionSync(run),
    });
  }
  async fetch(request) { return this.backend.handle(request); }
}
const worker = {
  async fetch(request, env) {
    // Reject before allocating/waking an object. No browser CORS or caller-selected object ID.
    if (!authorized(request, env.JEET_SHARED_BACKEND_TOKEN)) return new Response('Unauthorized', { status: 401 });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/index') return new Response('Not found', { status: 404 });
    try { return await env.JEET_SHARED.get(env.JEET_SHARED.idFromName(OBJECT_NAME)).fetch(request); }
    catch { return Response.json({ error: 'Shared backend unavailable.' }, { status: 503 }); }
  },
};
export default worker;
