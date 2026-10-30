"use client";
import { useEffect, useState } from "react";

/** Never fetch arbitrary metadata URLs: this local reader only trusts its hash-checked asset route. */
export default function LocalLaunchMetadata({ uri }: { uri: string }) {
  const [data, setData] = useState<{description: string; image: string; links: [string,string][]} | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let imageUrl: string | undefined;
    const read = async (uri: string, extension: string, max: number) => {
      const url = new URL(uri);
      if (url.origin !== window.location.origin || url.search || url.hash ||
          !new RegExp("^/api/local-assets/[a-f0-9]{64}\\.("+extension+")$").test(url.pathname))
        throw Error("External metadata is not fetched by this local reader.");
      const response = await fetch(url, {cache:"no-store", signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
      if (!response.ok) throw Error("Local metadata asset is unavailable; workspace storage is not permanent.");
      const reader = response.body?.getReader();
      if (!reader) throw Error("Empty asset response.");
      const parts: Uint8Array[] = []; let size = 0;
      for (;;) { const {value,done} = await reader.read(); if(done) break;
        size += value.length; if(size>max) { await reader.cancel(); throw Error("Metadata asset exceeds size limit."); } parts.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for(const part of parts) { bytes.set(part,offset); offset += part.length; }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
      if (!url.pathname.endsWith("/"+digest+"."+url.pathname.split(".").at(-1))) throw Error("Asset content hash mismatch.");
      return bytes;
    };
    void (async () => {
      try {
        const json = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await read(uri,"json",32000)));
        if(typeof json.description !== "string" || new TextEncoder().encode(json.description).length>1000 || typeof json.image !== "string") throw Error("Malformed off-chain metadata.");
        const bytes = await read(json.image,"png|jpg|webp",2097152);
        const extension = new URL(json.image).pathname.split(".").at(-1);
        imageUrl = URL.createObjectURL(new Blob([bytes],{type:extension==="jpg"?"image/jpeg":`image/${extension}`}));
        const links: [string,string][] = [];
        for(const key of ["website","twitter","telegram"]) {
          const value = json.extensions?.[key]; if(value === undefined) continue;
          if(typeof value !== "string" || value.length>2000) throw Error("Invalid metadata link.");
          const link = new URL(value); if(link.protocol!=="https:" || link.username || link.password) throw Error("Unsafe metadata link.");
          links.push([key,link.href]);
        }
        if(active) { setData({description:json.description,image:imageUrl,links}); setError(""); }
      } catch(e) { if(active) {setData(null); setError(e instanceof Error?e.message:String(e));} }
      finally { if(!active && imageUrl) URL.revokeObjectURL(imageUrl); }
    })();
    return () => { active=false; controller.abort(); if(imageUrl) URL.revokeObjectURL(imageUrl); };
  },[uri]);
  return <section className="space-y-3 rounded-xl border border-white/10 p-4">
    <h2 className="font-bold">Off-chain metadata · creator supplied</h2>
    <p className="text-xs text-white/50">Content hash checked; descriptions and links are not endorsements. Local assets can disappear if this workspace is removed.</p>
    {error && <p role="status">{error}</p>}
    {!data && !error && <p>Loading metadata…</p>}
    {data && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.image} alt="Creator-supplied token image" className="h-28 w-28 rounded-xl object-cover" />
      <p className="break-words whitespace-pre-wrap">{data.description}</p>
      <div className="flex flex-wrap gap-4">{data.links.map(([name,url])=><a key={name} href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-[#9cff43] underline">{name}</a>)}</div>
    </>}
  </section>;
}
