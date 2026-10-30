"use client";
import { validateImageUpload } from "@/lib/launch-image";
import { useEffect, useState } from "react";

/** Bounded browser-only reads: local content hashes or the explicitly supported public IPFS gateway. */
export default function LocalLaunchMetadata({ uri }: { uri: string }) {
  const [data, setData] = useState<{description: string; image: string; links: [string,string][]} | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let imageUrl: string | undefined;
    const read = async (uri: string, extension: string, max: number) => {
      const url = new URL(uri);
      const local = url.origin === window.location.origin && new RegExp("^/api/local-assets/[a-f0-9]{64}\\.("+extension+")$").test(url.pathname);
      const pinned = url.origin === "https://gateway.pinata.cloud" && /^\/ipfs\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{45,99})$/.test(url.pathname);
      if ((!local && !pinned) || url.search || url.hash || url.username || url.password)
        throw Error("This metadata host is unsupported; no arbitrary remote URL is fetched.");
      const response = await fetch(url, {cache:"no-store", redirect:"error", signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
      if (!response.ok) throw Error("Local metadata asset is unavailable; workspace storage is not permanent.");
      const reader = response.body?.getReader();
      if (!reader) throw Error("Empty asset response.");
      const parts: Uint8Array[] = []; let size = 0;
      for (;;) { const {value,done} = await reader.read(); if(done) break;
        size += value.length; if(size>max) { await reader.cancel(); throw Error("Metadata asset exceeds size limit."); } parts.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for(const part of parts) { bytes.set(part,offset); offset += part.length; }
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
      if (local && !url.pathname.endsWith("/"+digest+"."+url.pathname.split(".").at(-1))) throw Error("Asset content hash mismatch.");
      return bytes;
    };
    void (async () => {
      try {
        const json = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(await read(uri,"json",32000)));
        if(typeof json.description !== "string" || new TextEncoder().encode(json.description).length>1000 || typeof json.image !== "string") throw Error("Malformed off-chain metadata.");
        const bytes = await read(json.image,"png|jpg|webp",2097152);
        const mime = bytes[0] === 137 ? "image/png" : bytes[0] === 255 ? "image/jpeg" : "image/webp";
        const file = new File([bytes], "token-image", {type:mime});
        await validateImageUpload(file);
        imageUrl = URL.createObjectURL(file);
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
    <p className="text-xs text-white/50">Local content hashes are checked. Remote IPFS content relies on the displayed gateway; this reader does not independently validate UnixFS proofs. Descriptions and links are not endorsements. Local assets can disappear if this workspace is removed.</p>
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
