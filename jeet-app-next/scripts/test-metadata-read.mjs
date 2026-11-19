// Synthetic provider responses only; no public gateway traffic.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedMetadata,cacheValidatedMetadata} from '../src/lib/metadata-read.ts';
const signal=()=>new AbortController().signal;
test('concurrent readers deduplicate; cancellation and byte buffers stay isolated',async()=>{
 let calls=0,release;const gate=new Promise(r=>release=r);
 const request=async()=>{calls++;await gate;return new Response('valid');};
 const cancelled=new AbortController();
 const a=readBoundedMetadata('https://dedup.example/a',20,cancelled.signal,request);
 const b=readBoundedMetadata('https://dedup.example/a',20,signal(),request);
 cancelled.abort();await assert.rejects(a);release();assert.equal(new TextDecoder().decode(await b),'valid');assert.equal(calls,1);
 const [x,y]=await Promise.all([readBoundedMetadata('https://dedup.example/b',20,signal(),request),readBoundedMetadata('https://dedup.example/b',20,signal(),request)]);x[0]=0;assert.equal(y[0],118);
});
test('long Retry-After is respected across gateway assets, not retried or cached as content',async()=>{
 let calls=0;const request=async()=>{calls++;return new Response('limit',{status:429,headers:{'retry-after':'60'}});};
 for(const path of ['a','b'])await assert.rejects(readBoundedMetadata('https://limited.example/'+path,20,signal(),request),/HTTP 429/);
 assert.equal(calls,1);
});
test('unknown provider cooldown fails gracefully without repeated requests',async()=>{
 let calls=0;const request=async()=>{calls++;return new Response('',{status:429});};
 for(let i=0;i<2;i++)await assert.rejects(readBoundedMetadata('https://unknown-limit.example/a',20,signal(),request),/HTTP 429/);
 assert.equal(calls,1);
});
test('short provider cooldown permits one bounded retry and preserves validated success caching',async()=>{
 let calls=0;const request=async()=>++calls===1?new Response('',{status:429,headers:{'retry-after':'0'}}):new Response('valid');
 const url='https://short-limit.example/a',bytes=await readBoundedMetadata(url,20,signal(),request);assert.equal(calls,2);cacheValidatedMetadata(url,bytes);
 assert.equal(new TextDecoder().decode(await readBoundedMetadata(url,20,signal(),request)),'valid');assert.equal(calls,2);
});
test('persistent 429 stops after two attempts, and denied/error/oversized responses never become success',async()=>{
 let calls=0;const request=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'0'}});};
 await assert.rejects(readBoundedMetadata('https://persistent-limit.example/a',20,signal(),request),/HTTP 429/);assert.equal(calls,2);
 for(const status of [403,503])await assert.rejects(readBoundedMetadata('https://error.example/'+status,20,signal(),async()=>new Response('error',{status})));
 await assert.rejects(readBoundedMetadata('https://error.example/big',2,signal(),async()=>new Response('long')),/size limit/);
});
