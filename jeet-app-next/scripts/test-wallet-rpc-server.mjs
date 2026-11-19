// Synthetic transport tests. No public RPC, signer, or transaction submission.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createWalletRpcScheduler, createWalletUpstreamFetch, createServerWalletRpc } from '../src/lib/wallet-rpc-server.ts';
const url='https://devnet.invalid/';
function clock(){let at=0;const waits=[];return {waits,now:()=>at,wait:async ms=>{waits.push(ms);at+=ms;}};}
test('concurrent public RPC calls serialize, pace and do not reorder',async()=>{
 const c=clock(),schedule=createWalletRpcScheduler(c.wait,c.now),order=[];
 const values=await Promise.all([1,2,3].map(n=>schedule(url,async()=>{order.push(n);return n;})));
 assert.deepEqual(values,[1,2,3]);assert.deepEqual(order,[1,2,3]);assert.deepEqual(c.waits,[0,350,350]);
});
test('bounded queue rejects overload and aborted queued work cannot reach the provider',async()=>{
 const c=clock(),schedule=createWalletRpcScheduler(c.wait,c.now);let release;
 const gate=new Promise(r=>release=r),abort=new AbortController();let calls=0;
 const first=schedule(url,()=>gate),cancelled=schedule(url,async()=>{calls++;},abort.signal);cancelled.catch(()=>{});
 const rest=Array.from({length:10},()=>schedule(url,async()=>1));
 await assert.rejects(schedule(url,async()=>1),/busy/);abort.abort();release();
 await first;await assert.rejects(cancelled);await Promise.all(rest);assert.equal(calls,0);
});
test('429 retries have exponential backoff and preserve the identical signed-wire body',async()=>{
 const bodies=[],waits=[];let calls=0;const raw='{"method":"sendTransaction","params":["SAME-WIRE"]}';
 const request=async(_url,init)=>{bodies.push(init.body);return ++calls<3?new Response('',{status:429}):new Response('{"result":"signature"}');};
 const forward=createWalletUpstreamFetch(request,async ms=>waits.push(ms),async(_url,job)=>job());
 assert.equal((await forward(url,raw)).status,200);assert.deepEqual(bodies,[raw,raw,raw]);assert.deepEqual(waits,[500,1000]);
});
test('long Retry-After stops retries rather than violating provider cooldown',async()=>{
 let calls=0;const forward=createWalletUpstreamFetch(async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'30'}});},async()=>{throw Error('must not wait');},async(_url,job)=>job());
 assert.equal((await forward(url,'{}')).status,429);assert.equal(calls,1);
});
test('persistent 429 is bounded and ambiguous send transport failures are never resent',async()=>{
 let calls=0;const forward=createWalletUpstreamFetch(async()=>{calls++;return new Response('',{status:429});},async()=>{},async(_url,job)=>job());
 assert.equal((await forward(url,'{}')).status,429);assert.equal(calls,3);
 calls=0;const broken=createWalletUpstreamFetch(async()=>{calls++;throw Error('unknown submission');},async()=>{},async(_url,job)=>job());
 await assert.rejects(broken(url,'{"method":"sendTransaction"}'));assert.equal(calls,1);
});
test('SDK discovery transport retains exact u64 integers',async()=>{
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);res.setHeader('content-type','application/json');res.end('{"jsonrpc":"2.0","id":'+JSON.stringify(body.id)+',"result":{"context":{"slot":1},"value":18446744073709551615}}');});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{const rpc=createServerWalletRpc('http://127.0.0.1:'+server.address().port);const r=await rpc.getBalance('11111111111111111111111111111111').send();assert.equal(r.value,18446744073709551615n);}finally{server.close();await once(server,'close');}
});
test('provider denial applies to queued calls and recovers after its cooldown', async () => {
 const c = clock();
 let calls = 0;
 const request = async () => ++calls === 1
   ? new Response('private provider details', { status: 403, headers: { 'retry-after': '90' } })
   : new Response('{}');
 const forward = createWalletUpstreamFetch(request, c.wait, createWalletRpcScheduler(c.wait, c.now), c.now);
 const [first, queued] = await Promise.all([forward(url, '{}'), forward(url, '{}')]);
 assert.equal(first.status, 403);
 assert.equal(queued.status, 403);
 assert.equal(queued.headers.get('retry-after'), '90');
 assert.equal(await queued.text(), '');
 assert.equal(calls, 1);
 await c.wait(90000);
 assert.equal((await forward(url, '{}')).status, 200);
 assert.equal(calls, 2);
});
