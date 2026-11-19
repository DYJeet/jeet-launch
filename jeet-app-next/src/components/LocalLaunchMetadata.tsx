"use client";
import { readBoundedMetadata, cacheValidatedMetadata } from "@/lib/metadata-read";
import { resolveMetadataUri } from "@/lib/metadata-storage-uri";
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
      const resolved = resolveMetadataUri(uri, window.location.origin, extension);
      const bytes = await readBoundedMetadata(resolved.url, max, controller.signal);
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(n=>n.toString(16).padStart(2,"0")).join("");
      if (resolved.sha256 && resolved.sha256 !== digest) throw Error("Asset content hash mismatch.");
      return { bytes, url: resolved.url };
    };
    void (async () => {
      try {
        const document = await read(uri,"json",32000);
        const json = JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(document.bytes));
        if(typeof json.description !== "string" || new TextEncoder().encode(json.description).length>1000 || typeof json.image !== "string") throw Error("Malformed off-chain metadata.");
        const image = await read(json.image,"png|jpg|webp",2097152);
        const bytes = image.bytes;
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
        cacheValidatedMetadata(document.url, document.bytes);
        cacheValidatedMetadata(image.url, bytes);
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
