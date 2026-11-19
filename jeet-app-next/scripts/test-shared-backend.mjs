import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {SharedBackendClient,RemoteMarketStore,backendJson,sharedBackendConfiguration} from '../src/lib/shared-backend-client.ts';
import {PersistentRequestLimiter,createSharedBackend,DEVNET_INDEX_NAMESPACE as network} from '../src/lib/shared-backend.ts';
const token='local-test-only-no-production-credential-00000000';
const mint='1'.repeat(32),stream=mint+':curve',sig=n=>'2'.repeat(63)+'3456789ABCDEFGHJKLMNPQRSTUVWXYZ'[n];
const event=n=>({id:sig(n)+':trade:'+n,signature:sig(n),slot:String(100+n),time:null,kind:'buy',lamports:'100',tokens:'5',wallet:mint});
async function start(path, extraEnv = {}){
 const child=spawn(process.execPath,['scripts/shared-index-server.mjs'],{cwd:process.cwd(),env:{...process.env,NODE_ENV:'test',JEET_SHARED_DB:path,JEET_SHARED_BACKEND_TOKEN:token,PORT:'0',JEET_QUOTA_READ_CLIENT:'5',JEET_QUOTA_READ_GLOBAL:'9',JEET_QUOTA_WRITE_CLIENT:'2',JEET_QUOTA_WRITE_GLOBAL:'3',...extraEnv},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',b=>stderr+=b);
 const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Backend startup timeout: '+stderr)),8000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Backend exited: '+stderr));});child.stdout.on('data',b=>{for(const line of b.toString().split('\n'))try{const x=JSON.parse(line);if(x.status==='ready'){clearTimeout(timer);resolve(x.port);}}catch{}});});
 const url='http://127.0.0.1:'+port;
 return {url,client:new SharedBackendClient({url,token}),async stop(crash=false){child.kill(crash?'SIGKILL':'SIGTERM');await once(child,'exit');}};
}
test('durable HTTP index survives backend and application restarts; CAS, replay, snapshot and pagination',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jeet-shared-index-'));let server=await start(join(dir,'index.sqlite'));
 try{
  const a=new RemoteMarketStore(server.client),b=new RemoteMarketStore(new SharedBackendClient({url:server.url,token}));
  const next={anchor:sig(0),backfilled:true};
  const committed=await Promise.all([a.commit(network,stream,{},next,Array.from({length:20},(_,i)=>event(i))),b.commit(network,stream,{},next,[event(0)])]);
  assert.equal(committed.filter(Boolean).length,1);
  // Whichever writer won, bring the canonical history to the same 20 idempotent events.
  assert(await a.commit(network,stream,next,next,Array.from({length:20},(_,i)=>event(i))));
  assert.equal((await b.marketVolume(network,stream)).trades,20);
  const first=await a.historySnapshot(network,stream);assert.equal(first.events.length,16);assert.equal(first.volume.lamports,2000n);assert.deepEqual(first.checkpoint,next);
  const cursor=first.next;
  execFileSync(process.execPath,['scripts/backup-shared-index.mjs',join(dir,'index.sqlite'),join(dir,'backup.sqlite')]);
  await server.stop(true);server=await start(join(dir,'index.sqlite'));
  const restarted=new RemoteMarketStore(server.client),second=await restarted.history(network,stream,cursor);
  assert.equal(second.events.length,4);assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,20);
  assert.equal((await restarted.marketVolume(network,stream)).lamports,2000n);
  const backup=await start(join(dir,'backup.sqlite'));try{assert.equal((await new RemoteMarketStore(backup.client).marketVolume(network,stream)).trades,20);}finally{await backup.stop();}
  assert((await restarted.history(network,stream,'unknown')).cursorExpired);
  const gap={...next,gap:true};assert(await restarted.commit(network,stream,next,gap,[]));
  assert(await restarted.commit(network,stream,gap,{...next,gap:false},[]));assert((await restarted.checkpoint(network,stream)).gap);
  await assert.rejects(restarted.checkpoint('mainnet:'+mint,stream),/unavailable/);
 }finally{await server.stop();}
});
test('shared quotas enforce one atomic ceiling across two actual application processes and restart',async()=>{
 if(Date.now()%60000>55000)await new Promise(r=>setTimeout(r,60010-Date.now()%60000));
 const dir=await mkdtemp(join(tmpdir(),'jeet-shared-quota-'));let server=await start(join(dir,'index.sqlite'));
 try{
  const worker=()=>new Promise((resolve,reject)=>{const code=`import {SharedBackendClient} from './src/lib/shared-backend-client.ts';const c=new SharedBackendClient({url:process.env.TEST_URL,token:process.env.TEST_TOKEN});console.log(JSON.stringify(await Promise.all(Array.from({length:6},()=>c.call('admit',['a'.repeat(64),'read'])))));`;const p=spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,TEST_URL:server.url,TEST_TOKEN:token},stdio:['ignore','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.on('exit',n=>n===0?resolve(JSON.parse(out)):reject(Error('Worker failed')));});
  const results=(await Promise.all([worker(),worker()])).flat();assert.equal(results.filter(Boolean).length,5);
  assert.equal((await Promise.all(Array.from({length:8},(_,i)=>server.client.call('admit',[String(i).repeat(64),'read'])))).filter(Boolean).length,4);
  assert(await server.client.call('admit',['a'.repeat(64),'write']));assert(await server.client.call('admit',['a'.repeat(64),'write']));assert(!await server.client.call('admit',['a'.repeat(64),'write']));
  await server.stop();server=await start(join(dir,'index.sqlite'));assert(!await server.client.call('admit',['b'.repeat(64),'read']));assert(await server.client.call('admit',['b'.repeat(64),'write']));assert(!await server.client.call('admit',['c'.repeat(64),'write']));
 }finally{await server.stop();}
});
test('quota expiry cannot be bypassed by clock rollback; scope and thresholds validated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jeet-shared-clock-')),path=join(dir,'quota.sqlite');let q=new PersistentRequestLimiter(path,{readClient:1,readGlobal:2,writeClient:1,writeGlobal:1});
 assert(q.admit('a'.repeat(64),'read',120000));assert(!q.admit('a'.repeat(64),'read',119000));q.close();q=new PersistentRequestLimiter(path,{readClient:1,readGlobal:2,writeClient:1,writeGlobal:1});assert(!q.admit('a'.repeat(64),'read',120001));assert(q.admit('a'.repeat(64),'read',180000));assert.throws(()=>q.admit('spoof','write'));q.close();
});
test('backend rejects unauthenticated, oversized, unknown, cross-network and malformed operations',async()=>{
 const backend=createSharedBackend(':memory:',token);const send=(value,auth=token)=>backend.handle(new Request('https://backend/v1/index',{method:'POST',headers:{authorization:'Bearer '+auth,'content-type':'application/json'},body:typeof value==='string'?value:backendJson(value)}));
 try{
  assert.equal((await send({op:'checkpoint',args:[network,stream]},'wrong')).status,401);
  for(const value of [{op:'exec',args:['DROP TABLE launches']},{op:'checkpoint',args:['mainnet',stream]},{op:'commit',args:[network,stream,{}, {},[{...event(1),lamports:'-1'}]]},{op:'admit',args:['ip-address','write']},{op:'commit',args:[network,stream,{before:'bad'}, {},[]]}])assert.equal((await send(value)).status,400);
  assert.equal((await send('x'.repeat(131073))).status,413);
 }finally{backend.close();}
});
test('server credentials never permit HTTP outside explicit local tests, redirects, or secret-bearing errors',async()=>{
 const prior={...process.env};try{
  process.env.JEET_SHARED_BACKEND_TOKEN=token;process.env.JEET_SHARED_BACKEND_URL='http://evil.example';assert.throws(sharedBackendConfiguration);
  process.env.JEET_SHARED_BACKEND_URL='https://user:secret@backend.example';assert.throws(sharedBackendConfiguration);
  process.env.JEET_SHARED_BACKEND_URL='https://backend.example?token=secret';assert.throws(sharedBackendConfiguration);
  const c=new SharedBackendClient({url:'https://backend.example',token},async(_url,options)=>{assert.equal(options.redirect,'error');assert.equal(new Headers(options.headers).get('user-agent'),'JeeT-Launch-Backend/1.0');assert(options.signal);throw Error('secret '+token);});
  await assert.rejects(c.call('admit',[]),e=>!e.message.includes(token)&&e.message.includes('unavailable'));
 }finally{for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k];Object.assign(process.env,prior);}
});

test('upload budgets are shared, bounded independently by hour and day, and survive restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jeet-upload-budget-')),path=join(dir,'index.sqlite');let q=new PersistentRequestLimiter(path,{uploadClient:1,uploadGlobal:2,uploadDaily:2});
 assert(q.admit('a'.repeat(64),'upload',1000));assert(!q.admit('a'.repeat(64),'upload',1001));assert(q.admit('b'.repeat(64),'upload',1002));q.close();
 q=new PersistentRequestLimiter(path,{uploadClient:1,uploadGlobal:2,uploadDaily:2});assert(!q.admit('c'.repeat(64),'upload',3600001));assert(q.admit('c'.repeat(64),'upload',86400001));assert(!q.admit('c'.repeat(64),'upload',1000));q.close();
});

test('shared discovery persists New, Trending, Final Stretch, Migrated, search and cursor invalidation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jeet-shared-discovery-'));const server=await start(join(dir,'index.sqlite'));
 try{
  const store=new RemoteMarketStore(server.client),observed=Date.now();
  const row={mint,creator:mint,name:'JeeT fixture',symbol:'JEET',activationSlot:'100',volume:'100',reserve:'0.1',progress:95,migrated:false,eligible:false};
  const migrated={...row,mint:'2'.repeat(32),pool:'3'.repeat(32),migrated:true,name:'Migrated fixture',progress:100,volume:'50'};
  assert(await store.commitDiscovery(network,'launch-activations-v1',{}, {anchor:sig(1),backfilled:true},[{row,slot:120n},{row:migrated,slot:120n}],observed));
  assert.equal(await store.discoveryUpdatedAt(network),observed);assert.equal((await store.oldestLaunches(network,observed+1)).length,2);
  for(const [view,total]of[['New',2],['Trending',2],['Final Stretch',1],['Migrated',1]])assert.equal((await store.launchPage(network,new URLSearchParams({view}))).total,total);
  assert.equal((await store.launchPage(network,new URLSearchParams({q:'2'.repeat(32)}))).total,1);
  const page=await store.launchPage(network,new URLSearchParams({view:'Trending',limit:'1'}));assert(page.next);
  await store.writeLaunches(network,[{row:{...row,volume:'1'},slot:110n}],observed);assert.equal((await store.launchPage(network,new URLSearchParams({q:row.name}))).rows[0].volume,'100');
  await store.writeLaunches(network,[{row:{...row,volume:'300'},slot:121n}],observed);assert((await store.launchPage(network,new URLSearchParams({view:'Trending',after:page.next}))).cursorExpired);
 }finally{await server.stop();}
});

test('the separate Mainnet index restores a backup and rejects Devnet database reuse', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'jeet-mainnet-index-'));
 const devnetPath = join(dir, 'devnet.sqlite');
 const mainnetPath = join(dir, 'mainnet.sqlite');
 const backupPath = join(dir, 'restored.sqlite');
 const program = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
 const env = {JEET_SHARED_MAINNET_PROGRAM_ID: program};
 const mainnet = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d:' + program;
 const devnet = await start(devnetPath);
 await devnet.stop();
 await assert.rejects(start(devnetPath, env), /Existing index or quota data cannot be adopted/);
 let server = await start(mainnetPath, env);
 const head = {head: sig(1)};
 try {
  let store = new RemoteMarketStore(server.client);
  assert(await store.commit(mainnet, stream, {}, head, [event(1)]));
  await assert.rejects(store.checkpoint(network, stream), /unavailable/);
  execFileSync(process.execPath, ['scripts/backup-shared-index.mjs', mainnetPath, backupPath]);
  await server.stop();
  server = undefined;
  await assert.rejects(start(backupPath), /database is bound to Mainnet/);
  await assert.rejects(start(backupPath, {JEET_SHARED_MAINNET_PROGRAM_ID: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'}), /bound to another program/);
  server = await start(backupPath, env);
  store = new RemoteMarketStore(server.client);
  assert.deepEqual(await store.checkpoint(mainnet, stream), head);
  assert.equal((await store.marketVolume(mainnet, stream)).trades, 1);
 } finally {
  await server?.stop();
 }
});
