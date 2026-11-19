// Deploy behind HTTPS on a host with a persistent local volume. Not a Vercel Function.
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {dedicatedSigner} from '../src/lib/mainnet-identity.ts';
import {MAINNET_GENESIS} from '../src/lib/wallet-environment.ts';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {resolve,sep} from 'node:path';
import {createSharedBackend,DEFAULT_QUOTAS,DEVNET_INDEX_NAMESPACE} from '../src/lib/shared-backend.ts';
const path=process.env.JEET_SHARED_DB, token=process.env.JEET_SHARED_BACKEND_TOKEN;
if(!path || !token)throw Error('Persistent database path and private backend token are required.');
if(process.env.NODE_ENV==='production' && (resolve(path).startsWith('/tmp'+sep) || path===':memory:'))throw Error('Production requires a persistent mounted volume, not temporary storage.');
const quotas=Object.fromEntries(Object.entries(DEFAULT_QUOTAS).map(([key,value])=>[key,Number(process.env['JEET_QUOTA_'+key.replace(/[A-Z]/g,c=>'_'+c).toUpperCase()]??value)]));
const mainnetProgram = process.env.JEET_SHARED_MAINNET_PROGRAM_ID;
let namespace = DEVNET_INDEX_NAMESPACE;
if (mainnetProgram !== undefined) {
 const program = dedicatedSigner(mainnetProgram);
 if (path === ':memory:') throw Error('Mainnet indexing requires a persistent database.');
 namespace = MAINNET_GENESIS + ':' + program;
 bindMainnetDatabase(path, namespace);
} else if (path !== ':memory:' && existsSync(path)) {
 const database = new DatabaseSync(path, { readOnly: true });
 try {
  if (database.prepare("SELECT name FROM sqlite_schema WHERE name='jeet_index_identity'").get())
   throw Error('The configured database is bound to Mainnet.');
 } finally { database.close(); }
}
const backend = createSharedBackend(path, token, quotas, { namespace });

function bindMainnetDatabase(path, namespace) {
 const database = new DatabaseSync(path);
 try {
  database.exec('PRAGMA busy_timeout=3000; BEGIN IMMEDIATE;');
  try {
   const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
   if (tables.some(table => table.name === 'jeet_index_identity')) {
    const binding = database.prepare('SELECT namespace FROM jeet_index_identity WHERE id=1').get();
    if (binding?.namespace !== namespace) throw Error('Database is bound to another program or network.');
   } else {
    if (tables.length) throw Error('Use a new database for Mainnet. Existing index or quota data cannot be adopted.');
    database.exec('CREATE TABLE jeet_index_identity (id INTEGER PRIMARY KEY CHECK(id=1), namespace TEXT NOT NULL);');
    database.prepare('INSERT INTO jeet_index_identity (id, namespace) VALUES (1, ?)').run(namespace);
   }
   database.exec('COMMIT;');
  } catch (error) { database.exec('ROLLBACK;'); throw error; }
 } finally { database.close(); }
}
const server=createServer(async(req,res)=>{
 try{
  const request=new Request('http://backend'+req.url,{method:req.method,headers:req.headers,body:Readable.toWeb(req),duplex:'half',signal:AbortSignal.timeout(8000)});
  const response=await backend.handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"Shared service unavailable."}');}
});
server.requestTimeout=8000;server.headersTimeout=5000;server.maxHeadersCount=32;
server.listen(Number(process.env.PORT??3040),process.env.JEET_BACKEND_LISTEN_HOST??'127.0.0.1',()=>console.log(JSON.stringify({status:'ready',port:server.address().port})));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{backend.close();process.exit(0);}));
