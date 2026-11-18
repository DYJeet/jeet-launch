// Run after a Devnet production build. Internal HTTP models an HTTPS reverse
// proxy's exact Host/Origin headers; this is not browser or TLS acceptance.
// Only page GETs are made. No RPC, uploads, wallet signing or submission.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
const port=3028,host='jeet-devnet.invalid',origin='https://'+host;
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{
 env:{...Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('JEET_')&&!k.startsWith('NEXT_PUBLIC_JEET_'))),
 NEXT_PUBLIC_JEET_WALLET_NETWORK:'devnet',JEET_DEVNET_WALLET:'1',JEET_DEVNET_WALLET_ORIGIN:origin},stdio:'inherit'});
function get(path,headers={}) {return new Promise((resolve,reject)=>{
 const req=http.get({hostname:'127.0.0.1',port,path,headers:{Host:host,Origin:origin,...headers}},r=>{
 let body='';r.on('data',b=>body+=b);r.on('end',()=>resolve({status:r.statusCode,body}));});
 req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('HTTP test timeout')));
});}
try {
 let ready=false;for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('Server exited');try{if((await get('/')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert(ready);
 for(const path of ['/create','/local-create','/token/7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM']){
  const r=await get(path);assert.equal(r.status,200,path);
  if(path==='/create'){assert.match(r.body,/Verifying configured test network/);}
  for(const headers of [{Host:'attacker.invalid'},{Origin:'https://attacker.invalid'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await get(path,headers)).status,404,path+' rejects mismatched origin');
  console.log('PASS Devnet reverse-proxy page and three origin rejections: '+path);
 }
}finally{
 if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');const t=setTimeout(()=>child.kill('SIGKILL'),5000);await exited;clearTimeout(t);}
}
