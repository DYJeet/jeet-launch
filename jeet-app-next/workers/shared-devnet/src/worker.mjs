import { DurableObject } from 'cloudflare:workers';
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { dedicatedSigner } from '../../../src/lib/mainnet-identity.ts';
import { MAINNET_GENESIS } from '../../../src/lib/wallet-environment.ts';
import { createSharedBackend } from '../../../src/lib/shared-backend.ts';

const OBJECT_NAME = 'jeet-devnet-v1'; // Stable across every deployment; never shard/reset global quotas by request.
function indexNamespace(env) {
  if (env.JEET_SHARED_PROFILE === 'mainnet')
    return MAINNET_GENESIS + ':' + dedicatedSigner(env.JEET_SHARED_MAINNET_PROGRAM_ID);
  if (env.JEET_SHARED_PROFILE !== undefined || env.JEET_SHARED_MAINNET_PROGRAM_ID !== undefined)
    throw Error('Invalid index profile.');
  return undefined;
}
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
    const namespace = indexNamespace(env);
    if (namespace) ctx.storage.transactionSync(() => {
      const tables = sql.exec("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").toArray();
      if (tables.some(table => table.name === 'jeet_index_identity')) {
        if (sql.exec('SELECT namespace FROM jeet_index_identity WHERE id=1').one().namespace !== namespace)
          throw Error('Index is bound to another Mainnet program.');
      } else {
        if (tables.length) throw Error('Mainnet requires a fresh Durable Object database.');
        sql.exec('CREATE TABLE jeet_index_identity (id INTEGER PRIMARY KEY CHECK(id=1), namespace TEXT NOT NULL)');
        sql.exec('INSERT INTO jeet_index_identity (id,namespace) VALUES (1,?)', namespace);
      }
    });
    this.backend = createSharedBackend(':memory:', env.JEET_SHARED_BACKEND_TOKEN, undefined, {
      namespace, database, transaction: run => ctx.storage.transactionSync(run),
    });
  }
  async fetch(request) { return this.backend.handle(request); }
}
const worker = {
  async fetch(request, env) {
    // Reject before allocating/waking an object. No browser CORS or caller-selected object ID.
    if (!authorized(request, env.JEET_SHARED_BACKEND_TOKEN)) return new Response('Unauthorized', { status: 401 });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/index') return new Response('Not found', { status: 404 });
    try {
      const namespace = indexNamespace(env);
      const objectName = namespace ? 'jeet-mainnet-v1' : OBJECT_NAME;
      return await env.JEET_SHARED.get(env.JEET_SHARED.idFromName(objectName)).fetch(request);
    }
    catch { return Response.json({ error: 'Shared backend unavailable.' }, { status: 503 }); }
  },
};
export default worker;
