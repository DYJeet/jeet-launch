// Local workerd / SQLite validation only. Does not authenticate to or create any Cloudflare resource.
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const require=createRequire(join(process.env.JEET_WORKER_TOOLS_ROOT??resolve('workers/shared-devnet'),'package.json'));
const {build}=require('esbuild'),{Miniflare}=require('miniflare');
const dir=await mkdtemp(join(tmpdir(),'jeet-durable-object-')),bundle=join(dir,'worker.mjs');
await build({entryPoints:['workers/shared-devnet/src/worker.mjs'],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'es2022',external:['cloudflare:workers'],alias:{'node:sqlite':resolve('workers/shared-devnet/src/sqlite-unavailable.ts')}});
const script=await readFile(bundle,'utf8'),token='local-workerd-test-only-not-a-production-secret';
const network='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG:Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D',stream='1'.repeat(32)+':curve';
const sig=n=>'2'.repeat(63)+'3456789ABCDEFGHJKLMNPQRSTUVWXYZ'[n];
const event=n=>({id:sig(n)+':trade:'+n,signature:sig(n),slot:String(100+n),time:null,kind:'buy',lamports:'100',tokens:'5',wallet:'1'.repeat(32)});
const config={modules:true,script,compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],durableObjects:{JEET_SHARED:{className:'JeetSharedIndex',useSQLite:true}},durableObjectsPersist:join(dir,'persist'),bindings:{JEET_SHARED_BACKEND_TOKEN:token}};
let mf=new Miniflare(config);const checks=[];
async function call(op,args,auth=token){const r=await mf.dispatchFetch('https://worker.test/v1/index',{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:JSON.stringify({op,args},(_,v)=>typeof v==='bigint'?{__jeet_u64:String(v)}:v)});const text=await r.text();return {status:r.status,body:JSON.parse(text,(_,v)=>v&&typeof v==='object'&&Object.keys(v).length===1&&'__jeet_u64'in v?BigInt(v.__jeet_u64):v)};}
const expect=async(op,args)=>{const r=await call(op,args);assert.equal(r.status,200,JSON.stringify(r,(_,v)=>typeof v==='bigint'?String(v):v));return r.body.result;};
try{
 let unauthorized=await mf.dispatchFetch('https://worker.test/v1/index',{method:'POST',body:'{}'});assert.equal(unauthorized.status,401);checks.push('rejects unauthorized requests before object allocation');
 const cp={anchor:sig(0),backfilled:true};const winners=await Promise.all([expect('commit',[network,stream,{},cp,Array.from({length:20},(_,i)=>event(i))]),expect('commit',[network,stream,{},cp,[event(0)]])]);assert.equal(winners.filter(Boolean).length,1);await expect('commit',[network,stream,cp,cp,Array.from({length:20},(_,i)=>event(i))]);
 assert.equal((await expect('marketVolume',[network,stream])).trades,20);checks.push('concurrent checkpoint CAS and idempotent replay conserve volume');
 assert.equal((await call('commit',[network,stream,cp,{anchor:sig(1)},[event(20),{...event(0),lamports:'999'}]])).status,400);assert.deepEqual(await expect('checkpoint',[network,stream]),cp);assert.equal((await expect('marketVolume',[network,stream])).lamports,2000n);checks.push('conflicting replay rolls back data and cursor together');
 const first=await expect('historySnapshot',[network,stream]);assert.equal(first.events.length,16);assert.equal(first.volume.trades,20);
 const admission=await Promise.all(Array.from({length:75},()=>expect('admit',['a'.repeat(64),'read'])));assert.equal(admission.filter(Boolean).length,60);checks.push('one atomic client quota across concurrent Worker requests');
 await mf.dispose();mf=new Miniflare(config);
 const second=await expect('history',[network,stream,first.next]);assert.equal(second.events.length,4);assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,20);assert(!await expect('admit',['a'.repeat(64),'read']));checks.push('runtime restart preserves history, pagination, volume and quotas');
 assert.equal((await call('checkpoint',['mainnet',stream])).status,400);assert.equal((await call('exec',['DROP TABLE launches'])).status,400);checks.push('rejects Mainnet namespace and arbitrary database operations');
 const observed=Date.now(),row={mint:'1'.repeat(32),creator:'1'.repeat(32),name:'Worker fixture',symbol:'WORK',progress:95,migrated:false,eligible:false,activationSlot:'100',volume:'200',reserve:'0.1'};
 await expect('commitDiscovery',[network,'launch-activations-v1',{},cp,[{row,slot:123n}],observed]);assert.equal((await expect('launchPage',[network,'view=Final+Stretch'])).total,1);checks.push('existing discovery SQL and ranked views work on Durable Object SQLite');
 const report={status:'PASS',localOnly:true,cloudflareResourcesCreated:0,solanaRequests:0,checks,toolVersions:{miniflare:require('miniflare/package.json').version,esbuild:require('esbuild/package.json').version},runtimeCompatibilityDate:config.compatibilityDate};
 await mkdir('artifacts/hosting-unblock',{recursive:true});await writeFile('artifacts/hosting-unblock/durable-object-local.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await mf.dispose();console.log('Worker state and bundle preserved at '+dir);}
