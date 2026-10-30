/** Local/test metadata extension. Metaplex protocol fees are separate from JeeT's zero creation fee. */
import {
  AccountRole,
  address,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { V5_PREVIEW_PROGRAM } from "./launch-v5-preview.ts";
export const METADATA_PROGRAM = address(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const encoder = new TextEncoder();
export function validateMetadataFields(
  name: string,
  symbol: string,
  uri: string,
  allowLocal = false,
) {
  if (!name.trim() || encoder.encode(name).length > 32 || /\p{Cc}/u.test(name))
    throw Error(
      "Name must contain 1–32 UTF-8 bytes without control characters.",
    );
  if (!/^[A-Za-z0-9_]{1,10}$/.test(symbol))
    throw Error("Ticker must contain 1–10 letters, numbers or underscores.");
  if (!uri || encoder.encode(uri).length > 200 || /\s|\p{Cc}/u.test(uri))
    throw Error("Metadata URI must contain 1–200 bytes without whitespace.");
  const u = new URL(uri);
  if (u.username || u.password) throw Error("URI credentials are prohibited.");
  if (u.protocol === "https:" && u.hostname) return;
  if (u.protocol === "ipfs:" && /^[a-zA-Z0-9]{46,100}$/.test(u.hostname))
    return;
  if (u.protocol === "ar:" && /^[a-zA-Z0-9_-]{43}$/.test(u.hostname)) return;
  if (allowLocal && u.protocol === "http:" && u.hostname === "127.0.0.1")
    return;
  throw Error(
    "Use HTTPS, IPFS or Arweave. Loopback HTTP is for local tests only.",
  );
}
export function findMetadataPda(mint: Address) {
  return getProgramDerivedAddress({
    programAddress: METADATA_PROGRAM,
    seeds: [
      encoder.encode("metadata"),
      new Uint8Array(getAddressEncoder().encode(METADATA_PROGRAM)),
      new Uint8Array(getAddressEncoder().encode(mint)),
    ],
  });
}
export async function initializeLaunchMetadataInstruction(p: {
  creator: TransactionSigner;
  mint: Address;
  custody: Address;
  name: string;
  symbol: string;
  uri: string;
  mutable: boolean;
  maxCostLamports: bigint;
  allowLocalUri?: boolean;
}) {
  validateMetadataFields(p.name, p.symbol, p.uri, p.allowLocalUri);
  if (
    typeof p.mutable !== "boolean" ||
    typeof p.maxCostLamports !== "bigint" ||
    p.maxCostLamports < 0n ||
    p.maxCostLamports > (1n << 64n) - 1n
  )
    throw Error("Invalid metadata budget/mutability");
  const strings = [p.name, p.symbol, p.uri].map((s) => encoder.encode(s)),
    data = new Uint8Array(13 + strings.reduce((n, b) => n + b.length, 0));
  data[0] = 23;
  new DataView(data.buffer).setBigUint64(1, p.maxCostLamports, true);
  data[9] = p.mutable ? 1 : 0;
  let at = 10;
  for (const s of strings) {
    data[at++] = s.length;
    data.set(s, at);
    at += s.length;
  }
  const [metadata] = await findMetadataPda(p.mint),
    meta = (a: Address, w = false) => ({
      address: a,
      role: w ? AccountRole.WRITABLE : AccountRole.READONLY,
    });
  return {
    programAddress: V5_PREVIEW_PROGRAM,
    data,
    accounts: [
      {
        address: p.creator.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: p.creator,
      },
      meta(p.mint),
      meta(p.custody),
      meta(metadata, true),
      meta(address("11111111111111111111111111111111")),
      meta(address("SysvarRent111111111111111111111111111111111")),
      meta(METADATA_PROGRAM),
    ],
  };
}
/** Owner and canonical PDA must be checked by the caller before trusting these fields. */
export function decodeLaunchMetadata(d: Uint8Array) {
  if (d.length < 65 || d[0] !== 4) throw Error("Not MetadataV1");
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  let at = 65;
  const text = (max: number) => {
    if (at + 4 > d.length) throw Error("Truncated metadata");
    const n = v.getUint32(at, true);
    at += 4;
    if (n > max || at + n > d.length) throw Error("Metadata field range");
    const s = new TextDecoder("utf-8", { fatal: true })
      .decode(d.subarray(at, at + n))
      .replace(/\0+$/, "");
    at += n;
    return s;
  };
  const name = text(32),
    symbol = text(10),
    uri = text(200);
  if (at + 3 > d.length) throw Error("Truncated metadata");
  const sellerFeeBasisPoints = v.getUint16(at, true);
  at += 2;
  const creators = d[at++];
  if (creators > 1) throw Error("Invalid creators option");
  if (creators) {
    if (at + 4 > d.length) throw Error("Truncated creators");
    const n = v.getUint32(at, true);
    at += 4;
    if (n > 5 || at + 34 * n > d.length) throw Error("Creator range");
    at += 34 * n;
  }
  if (at + 2 > d.length || d[at] > 1 || d[at + 1] > 1)
    throw Error("Metadata flag range");
  return {
    updateAuthority: getAddressDecoder().decode(d.subarray(1, 33)),
    mint: getAddressDecoder().decode(d.subarray(33, 65)),
    name,
    symbol,
    uri,
    sellerFeeBasisPoints,
    primarySaleHappened: d[at] === 1,
    mutable: d[at + 1] === 1,
  };
}
