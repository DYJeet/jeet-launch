// Temporary authenticated recovery acceptance. Never a normal Wrangler entry point.
// No RPC, wallet, transaction, metadata upload, or caller-selected storage operation.
import worker, { JeetSharedIndex as Backend } from '../../workers/shared-devnet/src/worker.mjs';
export default worker;
const KEY = 'jeet-read-preview-recovery-probe-v1';
export class JeetSharedIndex extends Backend {
  constructor(ctx, env) {
    super(ctx, env);
    if (env.JEET_SHARED_PROFILE !== 'mainnet') throw Error('Mainnet acceptance only.');
    this.probeCtx = ctx;
    this.instance = crypto.randomUUID();
  }
  async fetch(request) {
    // The original Worker authenticates before dispatching to this object.
    let body;
    try { body = await request.clone().json(); } catch { return super.fetch(request); }
    const reply = result => Response.json({ result }, { headers: { 'cache-control': 'no-store' } });
    if (body?.op === '__jeet_probe_seed' && body.args?.length === 1 && /^[a-f0-9]{64}$/.test(body.args[0])) {
      await this.probeCtx.storage.put(KEY, body.args[0]);
      return reply(true);
    }
    if (body?.op === '__jeet_probe_state' && body.args?.length === 0)
      return reply({
        instance: this.instance,
        marker: await this.probeCtx.storage.get(KEY) ?? null,
        databaseBytes: this.probeCtx.storage.sql.databaseSize,
        globalRead: this.probeCtx.storage.sql.exec("SELECT window,count FROM request_quotas WHERE scope='read' AND client='*'").toArray(),
      });
    if (body?.op === '__jeet_probe_abort' && body.args?.length === 0) {
      await this.probeCtx.storage.sync();
      this.probeCtx.abort('Authorized isolated Mainnet read-preview recovery acceptance');
    }
    if (body?.op === '__jeet_probe_clear' && body.args?.length === 0) {
      await this.probeCtx.storage.delete(KEY);
      return reply(true);
    }
    return super.fetch(request);
  }
}
