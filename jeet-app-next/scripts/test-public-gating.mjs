import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { once } from 'node:events';
let server;
const origin='http://127.0.0.1:3003';
before(async()=>{
 const log=await open('programs/launch-custody/target/master-verification/public-gating-server.log','w');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3003'],{stdio:['ignore',log.fd,log.fd]});await log.close();
 for(let n=0;n<60;n++){if(server.exitCode!==null)throw Error('App exited');try{if((await fetch(origin,{signal:AbortSignal.timeout(1000)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}
 throw Error('App startup timeout');
});
after(async()=>{if(server&&server.exitCode===null){const done=once(server,'exit');server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),5000);await done;clearTimeout(timer);}});
test('homepage excludes fabricated activity and exposes supported revenue navigation',async()=>{
 const response=await fetch(origin);assert.equal(response.status,200);const body=await response.text();
 assert.ok(body.includes('Verified launch listings are not connected yet'));
 assert.ok(body.includes('href="/revenue"'));assert.ok(body.includes('VIEW REVENUE'));
 for(const text of ['2,483+','$12.4M+','186K+','EXPOSE MY PAPER HANDS','PLACEHOLDER_MINT_'])assert.equal(body.includes(text),false,text);
});
test('Explore truthfully reports index unavailability and accessible search',async()=>{
 const response=await fetch(origin+'/explore');assert.equal(response.status,200);const body=await response.text();
 assert.ok(body.includes('aria-label="Search verified launches"'));assert.ok(body.includes('Verified index not connected'));
 assert.equal(body.includes('PLACEHOLDER_MINT_'),false);assert.ok(body.includes('aria-pressed='));
});
test('demo token cannot appear as a live launch page',async()=>{
 assert.equal((await fetch(origin+'/token/PLACEHOLDER_MINT_1')).status,404);
});
test('existing creation and revenue routes remain reachable',async()=>{
 for(const path of ['/create','/revenue'])assert.equal((await fetch(origin+path)).status,200);
});

test('creation discloses zero platform creation fee and disabled public V5',async()=>{
 const body=await(await fetch(origin+'/create')).text();
 for(const text of ['Platform fee disclosure','Token creation platform fee: 0 SOL','0.75% to JeeT Launch','0.25% to the creator','Public V5 launches and graduation are disabled'])assert.ok(body.includes(text),text);
});

test("read-only metadata verification is disabled unless explicitly enabled",async()=>{
 assert.equal((await fetch(origin+"/local-metadata")).status,404);
});
