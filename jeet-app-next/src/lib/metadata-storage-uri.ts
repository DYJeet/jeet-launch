/** Canonical public IPFS identifiers and the one supported display gateway. */
import { getBase58Encoder } from "@solana/kit";
export const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs/";
export function validMetadataCid(cid: unknown): cid is string {
  if (typeof cid !== "string") return false;
  try {
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
      const b = getBase58Encoder().encode(cid);
      return b.length === 34 && b[0] === 0x12 && b[1] === 32;
    }
    if (!/^b[a-z2-7]{58}$/.test(cid)) return false;
    const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
    const bytes: number[] = []; let bits = 0, accumulator = 0;
    for (const c of cid.slice(1)) {
      accumulator = (accumulator << 5) | alphabet.indexOf(c); bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((accumulator >>> bits) & 255); accumulator &= (1 << bits) - 1; }
    }
    return accumulator === 0 && bytes.length === 36 && bytes[0] === 1 &&
      [0x55, 0x70].includes(bytes[1]) && bytes[2] === 0x12 && bytes[3] === 32;
  } catch { return false; }
}
export function resolveMetadataUri(uri: string, origin: string, extension = "json") {
  const u = new URL(uri);
  if (u.username || u.password || u.search || u.hash) throw Error("Unsupported metadata URI.");
  if (u.protocol === "ipfs:" && validMetadataCid(u.hostname) && (!u.pathname || u.pathname === "/"))
    return { url: PINATA_GATEWAY + u.hostname, sha256: null };
  if (u.origin === "https://gateway.pinata.cloud" && u.pathname.startsWith("/ipfs/") && validMetadataCid(u.pathname.slice(6)))
    return { url: u.href, sha256: null };
  const match = new RegExp("^/api/local-assets/([a-f0-9]{64})\\.(" + extension + ")$").exec(u.pathname);
  if (u.origin === origin && match) return { url: u.href, sha256: match[1] };
  throw Error("This metadata host is unsupported; no arbitrary remote URL is fetched.");
}
