// Actual two-application-instance HTTP acceptance. Dummy invalid RPC envelopes only; never touches Solana.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer as httpsServer} from 'node:https';import {request as proxyRequest} from 'node:http';
import {readFileSync} from 'node:fs';import {once} from 'node:events';
import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'jeet-next-shared-')),children=[],evidence=[];
const token='local-test-only-not-a-production-secret-000000000';
const start=(cmd,args,env)=>{const p=spawn(cmd,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});p.stdout.on('data',()=>{});let errors='';p.stderr.on('data',b=>errors+=b);children.push(p);p.errors=()=>errors;return p;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const request=(port,path,options={})=>new Promise((resolve,reject)=>{
 const req=proxyRequest('http://127.0.0.1:'+port+path,{method:options.method??'GET',headers:{host:'candidate.example',...(options.headers??{})}},res=>{const parts=[];res.on('data',b=>parts.push(b));res.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:res.headers})));});
 req.setTimeout(3000,()=>req.destroy(Error('HTTP test deadline')));req.on('error',reject);req.end(options.body);
});
async function ready(port){for(let i=0;i<45;i++){try{if((await request(port,'/')).status===200)return;}catch{}await wait(250);}throw Error('Application startup deadline exceeded');}
let tls;
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'test-key.pem'),'-out',join(dir,'test-ca.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
 tls=httpsServer({key:readFileSync(join(dir,'test-key.pem')),cert:readFileSync(join(dir,'test-ca.pem'))},(req,res)=>{const upstream=proxyRequest('http://127.0.0.1:3043'+req.url,{method:req.method,headers:req.headers,timeout:8000},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(503).end();});req.pipe(upstream);});tls.listen(3044,'127.0.0.1');await once(tls,'listening');
 const backend=start(process.execPath,['scripts/shared-index-server.mjs'],{NODE_ENV:'test',JEET_SHARED_DB:join(dir,'index.sqlite'),JEET_SHARED_BACKEND_TOKEN:token,PORT:'3043',JEET_QUOTA_READ_CLIENT:'5',JEET_QUOTA_READ_GLOBAL:'9'});
 await wait(400);assert.equal(backend.exitCode,null,backend.errors());
 const env={NODE_ENV:'production',NODE_EXTRA_CA_CERTS:join(dir,'test-ca.pem'),VERCEL:'1',NEXT_PUBLIC_JEET_PUBLIC_BETA:'1',NEXT_PUBLIC_JEET_WALLET_NETWORK:'devnet',JEET_DEVNET_WALLET:'1',JEET_DEVNET_WALLET_ORIGIN:'https://candidate.example',JEET_SHARED_BACKEND_URL:'https://127.0.0.1:3044',JEET_SHARED_BACKEND_TOKEN:token,JEET_BACKEND_ALLOW_LOOPBACK:'1'};
 start(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3041'],env);
 start(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3042'],env);await Promise.all([ready(3041),ready(3042)]);
 const statuses=await Promise.all(Array.from({length:12},async(_,i)=>{const r=await request(i%2?3041:3042,'/api/wallet/rpc',{method:'POST',headers:{'content-type':'application/json','x-real-ip':'203.0.113.50'},body:JSON.stringify({jsonrpc:'2.0',id:i,method:'notAllowed',params:[]})});return r.status;}));
 assert.equal(statuses.filter(x=>x===503).length,5);assert.equal(statuses.filter(x=>x===429).length,7);evidence.push({case:'two Next server processes share one global client quota',statuses,passed:true});
 for(const [path,status] of [['/create',200],['/explore',200],['/revenue',200],['/api/local-test/health',404],['/api/local-assets/'+ '0'.repeat(64)+'.json',404]]){const r=await request(3041,path);assert.equal(r.status,status,path+": "+(r.status===status?"":(await r.text()).slice(0,250)));evidence.push({path,status,passed:true});}
 for(const path of ['/api/local-assets','/api/local-test/create']){const r=await request(3041,path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(r.status,403);evidence.push({path,status:403,passed:true});}
 backend.kill('SIGTERM');await once(backend,'exit');
 const stopped=await request(3042,'/api/wallet/rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:['AQ==',{encoding:'base64',maxRetries:0,preflightCommitment:'confirmed'}]})});assert.equal(stopped.status,429);evidence.push({case:'backend unavailable: transaction forwarding fails closed',status:429,passed:true});
 const health=await request(3041,'/api/wallet/environment');assert.equal(health.status,429);evidence.push({case:'environment reads share unavailable backend denial',status:429,passed:true});
 console.log(JSON.stringify({status:'PASS',networkCallsToSolana:0,cases:evidence},null,2));
 await writeFile('artifacts/functional-beta/two-next-instances-http.json',JSON.stringify({status:'PASS',networkCallsToSolana:0,cases:evidence},null,2)+'\n');
}finally{if(tls){tls.closeAllConnections();tls.close();}for(const p of children.reverse()){if(p.exitCode!==null||p.signalCode!==null)continue;p.kill('SIGTERM');await once(p,'exit');}console.log('Local HTTP test logs retained at '+dir);}
