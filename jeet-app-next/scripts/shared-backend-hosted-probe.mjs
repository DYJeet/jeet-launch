// Temporary, authenticated acceptance wrapper. Never the production Wrangler entry point.
import worker, { JeetSharedIndex as Backend } from '../workers/shared-devnet/src/worker.mjs';
export default worker;
export class JeetSharedIndex extends Backend {
  constructor(ctx, env) { super(ctx, env); this.probeCtx = ctx; this.instance = crypto.randomUUID(); }
  async fetch(request) {
    // The original Worker authenticates before dispatching to this object. No public diagnostic route.
    let body; try { body = await request.clone().json(); } catch { return super.fetch(request); }
    if (body?.op === '__acceptance_instance' && body.args?.length === 0)
      return Response.json({ result: { instance: this.instance, databaseBytes: this.probeCtx.storage.sql.databaseSize } });
    if (body?.op === '__acceptance_abort' && body.args?.length === 0) {
      await this.probeCtx.storage.sync(); this.probeCtx.abort('Owner-authorized durable recovery acceptance');
    }
    if (body?.op === '__acceptance_network' && body.args?.length === 0) {
      const read = async (url, options = {}) => {
        try {
          const r = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'JeeT-Launch-Backend/1.0', ...(options.headers ?? {}) } });
          if (!r.ok) {
            const reader = r.body?.getReader(); let detail = '';
            if (reader) { const first = await reader.read(); detail = new TextDecoder().decode(first.value?.slice(0, 1024)); await reader.cancel(); }
            return { status: 'BLOCKED', http: r.status, detail, retryAfter: r.headers.get('retry-after'), server: r.headers.get('server'), ray: r.headers.get('cf-ray') };
          }
          const reader = r.body.getReader(), parts = []; let count = 0;
          for (;;) { const p = await reader.read(); if (p.done) break; count += p.value.length; if (count > 131072) { await reader.cancel(); throw Error('Oversized response'); } parts.push(p.value); }
          const bytes = new Uint8Array(count); let offset = 0; for (const p of parts) { bytes.set(p, offset); offset += p.length; }
          return { status: 'PASS', http: r.status, bytes, json: JSON.parse(new TextDecoder().decode(bytes)) };
        } catch (error) { return { status: 'BLOCKED', reason: String(error?.name) + ': ' + String(error?.message).slice(0,160) }; }
      };
      const rpc = (method, params = []) => read('https://api.devnet.solana.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const [genesis, program, metadata] = await Promise.all([rpc('getGenesisHash'), rpc('getAccountInfo', ['Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D', { encoding: 'base64', commitment: 'finalized', dataSlice: { offset: 0, length: 0 } }]), read('https://gateway.pinata.cloud/ipfs/bafkreicsyxczhcmdur2arx44cthughlu5kttxhb72y7fcgpzsc5kap2gn4')]);
      const hash = metadata.bytes ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', metadata.bytes))].map(b => b.toString(16).padStart(2, '0')).join('') : null;
      return Response.json({ result: { genesis: { status: genesis.status, http: genesis.http, reason: genesis.reason, detail: genesis.detail, retryAfter: genesis.retryAfter, server: genesis.server, ray: genesis.ray, matches: genesis.json?.result === 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' }, program: { status: program.status, http: program.http, reason: program.reason, detail: program.detail, retryAfter: program.retryAfter, server: program.server, ray: program.ray, executable: program.json?.result?.value?.executable === true }, metadata: { status: metadata.status, http: metadata.http, reason: metadata.reason, detail: metadata.detail, retryAfter: metadata.retryAfter, server: metadata.server, ray: metadata.ray, sha256: hash, matches: hash === '52c5c5938983a47408df9c14cf431d74eaa73b9c3fd63e5119f990baa03f466f', name: metadata.json?.name, symbol: metadata.json?.symbol } } });
    }
    return super.fetch(request);
  }
}
