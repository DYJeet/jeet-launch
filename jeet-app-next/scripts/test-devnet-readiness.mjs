// Isolated configuration tests use synthetic HTTPS origins and injected transport only.
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
function run(script,extra={}){const clean=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('JEET_')&&!k.startsWith('NEXT_PUBLIC_JEET_')));const r=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...clean,NEXT_PUBLIC_JEET_WALLET_NETWORK:'devnet',JEET_DEVNET_WALLET:'1',JEET_DEVNET_WALLET_ORIGIN:'https://jeet-devnet.invalid',...extra}});assert.equal(r.status,0,r.stderr);}
test('Devnet requires paired flags, exact HTTPS origin and a server-only HTTPS endpoint',()=>run(`
 import assert from 'node:assert/strict';import {localWalletConfiguration,walletModeEnabled} from './src/lib/local-wallet-server.ts';
 const req=new Request('https://jeet-devnet.invalid/api/wallet/rpc',{headers:{host:'jeet-devnet.invalid',origin:'https://jeet-devnet.invalid'}});
 assert(walletModeEnabled());assert.equal(localWalletConfiguration(req).environment.program,'Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D');
 process.env.JEET_DEVNET_WALLET_RPC='https://devnet.invalid/rpc?fixture=server-only';assert.equal(localWalletConfiguration(req).url,process.env.JEET_DEVNET_WALLET_RPC);
 for(const url of ['http://devnet.invalid','https://api.mainnet-beta.solana.com','https://user:pass@devnet.invalid','https://devnet.invalid/#fragment']){process.env.JEET_DEVNET_WALLET_RPC=url;assert.throws(()=>localWalletConfiguration(req));}
 delete process.env.JEET_DEVNET_WALLET_RPC;
 for(const headers of [{host:'attacker.invalid'},{host:'jeet-devnet.invalid',origin:'https://attacker.invalid'},{host:'jeet-devnet.invalid','sec-fetch-site':'cross-site'}])assert.throws(()=>localWalletConfiguration(new Request(req.url,{headers})));
 delete process.env.JEET_DEVNET_WALLET;assert(!walletModeEnabled());assert.throws(()=>localWalletConfiguration(req));
 `));
test('concurrent genesis checks coalesce; fresh checks fail closed on a changed network',()=>run(`
 import assert from 'node:assert/strict';let calls=0,wrong=false;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,5));return Response.json({result:wrong?'wrong':'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'});};
 const {checkedLocalGenesis}=await import('./src/lib/local-wallet-server.ts');const url='http://127.0.0.1:9907',g='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
 await Promise.all([checkedLocalGenesis(url,g),checkedLocalGenesis(url,g)]);assert.equal(calls,1);wrong=true;await assert.rejects(checkedLocalGenesis(url,g),/genesis/);assert.equal(calls,2);
 `));
test('Devnet graduation planning rejects before any RPC or signing',()=>run(`
 import assert from 'node:assert/strict';import {graduationPreview} from './src/lib/wallet-amm.ts';
 await assert.rejects(graduationPreview({environment:{network:'devnet'},rpc:new Proxy({},{get(){throw Error('must not reach RPC');}})}, {}, '11111111111111111111111111111111'),/Public-network liquidity migration is disabled/);
 `));
test('Devnet metadata refuses temporary workspace storage before uploads',()=>run(`
 import assert from 'node:assert/strict';import {createLocalLaunchAssets} from './src/lib/local-launch-assets.ts';
 globalThis.fetch=async()=>{throw Error('must not upload');};
 await assert.rejects(createLocalLaunchAssets({name:'JeeT',symbol:'JEET',description:'Synthetic validation',imageBase64:'AAAA',mime:'image/png'},'https://jeet-devnet.invalid','devnet'),/requires public IPFS/);
 `));
test('Codespaces forwarding requires the named workspace, exact loopback port and unchanged origin protections',()=>run(`
 import assert from 'node:assert/strict';import {localWalletConfiguration} from './src/lib/local-wallet-server.ts';
 process.env.JEET_DEVNET_WALLET_ORIGIN='https://verified-space-3019.app.github.dev';
 process.env.CODESPACES='true';process.env.CODESPACE_NAME='verified-space';
 const url=process.env.JEET_DEVNET_WALLET_ORIGIN+'/api/wallet/environment';
 const headers={host:'localhost:3019','x-forwarded-host':'verified-space-3019.app.github.dev',origin:process.env.JEET_DEVNET_WALLET_ORIGIN,'sec-fetch-site':'same-origin'};
 assert.equal(localWalletConfiguration(new Request(url,{headers})).environment.network,'devnet');
 for(const change of [{host:'localhost:3020'},{host:'attacker.invalid'},{'x-forwarded-host':'other-space-3019.app.github.dev'},{origin:'https://attacker.invalid'},{'sec-fetch-site':'cross-site'}])assert.throws(()=>localWalletConfiguration(new Request(url,{headers:{...headers,...change}})));
 delete process.env.CODESPACES;assert.throws(()=>localWalletConfiguration(new Request(url,{headers})));
 `));

test('rewritten Codespaces POST origins require exact forwarding and same-origin Fetch Metadata',()=>run(`
 import assert from 'node:assert/strict';import {localWalletConfiguration} from './src/lib/local-wallet-server.ts';
 process.env.JEET_DEVNET_WALLET_ORIGIN='https://verified-space-3019.app.github.dev';
 process.env.CODESPACES='true';process.env.CODESPACE_NAME='verified-space';
 const url=process.env.JEET_DEVNET_WALLET_ORIGIN+'/api/wallet/rpc';
 const headers={host:'localhost:3019','x-forwarded-host':'verified-space-3019.app.github.dev',origin:'https://localhost:3019','sec-fetch-site':'same-origin'};
 const request=h=>new Request(url,{method:'POST',headers:h});
 assert.equal(localWalletConfiguration(request(headers)).environment.network,'devnet');
 assert.equal(localWalletConfiguration(request({...headers,host:'127.0.0.1:3019',origin:'https://127.0.0.1:3019'})).environment.network,'devnet');
 for(const change of [{origin:'http://localhost:3019'},{origin:'https://localhost:3020'},{origin:'https://attacker.invalid'},{host:'localhost:3020'},{'x-forwarded-host':'other-space-3019.app.github.dev'},{'sec-fetch-site':'cross-site'},{'sec-fetch-site':'same-site'},{'sec-fetch-site':''}])assert.throws(()=>localWalletConfiguration(request({...headers,...change})));
 delete process.env.CODESPACES;assert.throws(()=>localWalletConfiguration(request(headers)));
 `));
