// Deploy behind HTTPS on a host with a persistent local volume. Not a Vercel Function.
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {resolve,sep} from 'node:path';
import {createSharedBackend,DEFAULT_QUOTAS} from '../src/lib/shared-backend.ts';
const path=process.env.JEET_SHARED_DB, token=process.env.JEET_SHARED_BACKEND_TOKEN;
if(!path || !token)throw Error('Persistent database path and private backend token are required.');
if(process.env.NODE_ENV==='production' && (resolve(path).startsWith('/tmp'+sep) || path===':memory:'))throw Error('Production requires a persistent mounted volume, not temporary storage.');
const quotas=Object.fromEntries(Object.entries(DEFAULT_QUOTAS).map(([key,value])=>[key,Number(process.env['JEET_QUOTA_'+key.replace(/[A-Z]/g,c=>'_'+c).toUpperCase()]??value)]));
const backend=createSharedBackend(path,token,quotas);
const server=createServer(async(req,res)=>{
 try{
  const request=new Request('http://backend'+req.url,{method:req.method,headers:req.headers,body:Readable.toWeb(req),duplex:'half',signal:AbortSignal.timeout(8000)});
  const response=await backend.handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Shared service unavailable."}');}
});
server.requestTimeout=8000;server.headersTimeout=5000;server.maxHeadersCount=32;
server.listen(Number(process.env.PORT??3040),process.env.JEET_BACKEND_LISTEN_HOST??'127.0.0.1',()=>console.log(JSON.stringify({status:'ready',port:server.address().port})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{backend.close();process.exit(0);}));
