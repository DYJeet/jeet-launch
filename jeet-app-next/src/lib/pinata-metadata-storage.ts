/** Server-only Pinata adapter. No credential is returned, logged or sent to a gateway. */
import { createHash } from "node:crypto";
import { PINATA_GATEWAY, validMetadataCid } from "./metadata-storage-uri.ts";
const UPLOAD = "https://uploads.pinata.cloud/v3/files";
const API = "https://api.pinata.cloud/v3/files/public";
const digest = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export type PinnedMetadataFile = { uri: string; gatewayUri: string; cid: string; id: string; sha256: string; accountStatus: "public-file-record-confirmed" };
const receipts = new Map<string, {id:string;cid:string;size:number}>();
const pending = new Map<string, Promise<PinnedMetadataFile>>();
export function pinataCredentialAvailable(value: string | undefined) {
  return !!value && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}
async function bounded(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Missing provider response.");
  const chunks: Uint8Array[]=[]; let size=0;
  for (;;) {const {value,done}=await reader.read();if(done)break;size+=value.length;
    if(size>max){await reader.cancel();throw Error("Provider response exceeds limit.");}chunks.push(value);}
  const out=new Uint8Array(size);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
}
async function json(response: Response) {
  if(!response.ok) throw Error(`Pinata request failed (HTTP ${response.status}); launch blocked.`);
  const b=await bounded(response,16000);
  try {return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(b));}
  catch {throw Error("Invalid Pinata response.");}
}
function record(value: unknown, size: number) {
  const v=value as {id?:unknown;cid?:unknown;size?:unknown};
  if(!v || typeof v.id!=="string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v.id) || !validMetadataCid(v.cid) || v.size!==size)
    throw Error("Invalid pinned file identity/size.");
  return {id:v.id,cid:v.cid,size};
}
export async function pinMetadataFile(bytes: Uint8Array, name: string, mime: string,
  jwt: string, request: typeof fetch = fetch): Promise<PinnedMetadataFile> {
  if(!pinataCredentialAvailable(jwt)) throw Error("Server PINATA_JWT is missing or malformed; use the JWT, not the API key/secret pair.");
  if(!bytes.length || bytes.length>2097152 || !/^[a-zA-Z0-9._-]{1,100}$/.test(name) || !["image/png","image/jpeg","image/webp","application/json"].includes(mime))
    throw Error("Invalid pinning input.");
  const hash=digest(bytes), key=digest(Buffer.from(jwt))+":"+hash;
  // Requests for the same account/content coalesce. No automatic POST retry after uncertain failure.
  const existing=pending.get(key);if(existing)return existing;
  const run=async()=>{
    const auth={authorization:`Bearer ${jwt}`};
    let saved=receipts.get(key);
    if(!saved){
      const body=new FormData();body.set("network","public");body.set("file",new File([new Uint8Array(bytes)],name,{type:mime}));
      const result=await json(await request(UPLOAD,{method:"POST",headers:auth,body,redirect:"error",signal:AbortSignal.timeout(30000)}));
      saved=record(result?.data,bytes.length);
      if(receipts.size>=128)receipts.delete(receipts.keys().next().value!);
      receipts.set(key,saved); // Retain a returned receipt even if subsequent verification fails.
    }
    const status=record((await json(await request(API+"/"+saved.id,{headers:auth,redirect:"error",signal:AbortSignal.timeout(15000)})))?.data,bytes.length);
    if(status.id!==saved.id || status.cid!==saved.cid)throw Error("Pinata account record substitution.");
    const gatewayUri=PINATA_GATEWAY+saved.cid;
    const response=await request(gatewayUri,{redirect:"error",signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error("Pinned file is not retrievable; launch blocked.");
    const actual=await bounded(response,bytes.length);
    if(actual.length!==bytes.length || digest(actual)!==hash)throw Error("Pinned bytes mismatch.");
    return {uri:"ipfs://"+saved.cid,gatewayUri,cid:saved.cid,id:saved.id,sha256:hash,accountStatus:"public-file-record-confirmed" as const};
  };
  const task=run().catch(()=>{ // Never expose transport exceptions that may include headers/credentials.
    throw Error("Pinata upload or verification failed; launch blocked. Check server credential permissions and provider availability.");
  });
  pending.set(key,task);
  try{return await task;}finally{pending.delete(key);}
}
