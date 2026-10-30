/** Server-only Pinata public-IPFS adapter. Never imported by browser components. */
import { createHash } from "node:crypto";
const UPLOAD = "https://uploads.pinata.cloud/v3/files";
const GATEWAY = "https://gateway.pinata.cloud/ipfs/";
const cidPattern = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{45,99})$/;
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export async function pinMetadataFile(bytes: Uint8Array, name: string, mime: string,
  jwt: string, request: typeof fetch = fetch) {
  if (!jwt || /\s/.test(jwt)) throw Error("Server PINATA_JWT is missing or malformed.");
  if (!bytes.length || bytes.length > 2097152 || !/^[a-zA-Z0-9._-]{1,100}$/.test(name)) throw Error("Invalid pinning input.");
  const body = new FormData();
  body.set("network","public"); body.set("file", new File([new Uint8Array(bytes)],name,{type:mime}));
  const response = await request(UPLOAD,{method:"POST",headers:{authorization:`Bearer ${jwt}`},body,redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Error(`Metadata pinning failed (HTTP ${response.status}); no launch activated.`);
  // Do not include provider error bodies or credentials in user-visible errors.
  const text = await response.text();
  if(text.length>16000) throw Error("Invalid pinning response.");
  const result = JSON.parse(text);
  const cid = result?.data?.cid;
  if(typeof cid!=="string" || !cidPattern.test(cid) || result.data.size !== bytes.length) throw Error("Invalid pinned file identity/size.");
  const uri = GATEWAY+cid;
  const retrieved = await request(uri,{redirect:"error",signal:AbortSignal.timeout(30000)});
  if(!retrieved.ok || !retrieved.body) throw Error("Pinned file is not retrievable; retry storage before creating a mint.");
  const reader = retrieved.body.getReader(); const chunks: Uint8Array[]=[]; let size=0;
  for(;;) {const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>bytes.length){await reader.cancel();throw Error("Pinned bytes mismatch.");}chunks.push(value);}
  const actual = new Uint8Array(size); let offset=0; for(const chunk of chunks){actual.set(chunk,offset);offset+=chunk.length;}
  if(size!==bytes.length || digest(actual)!==digest(bytes)) throw Error("Pinned bytes mismatch.");
  return {uri,cid,sha256:digest(bytes)};
}
