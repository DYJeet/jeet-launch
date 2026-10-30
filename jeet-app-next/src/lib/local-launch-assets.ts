// Disposable local metadata hosting; no external credentials, remote fetches or public permanence claims.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { pinMetadataFile } from "./pinata-metadata-storage.ts";
import {
  validateImageBytes,
  validateImageDimensions,
  MAX_LOGO_BYTES,
} from "./launch-image.ts";
import { validateMetadataFields } from "./launch-metadata.ts";

export const assetDirectory = () =>
  path.join(process.cwd(), "programs/launch-custody/target/local-assets");
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export function assetName(value: string) {
  if (!/^[a-f0-9]{64}\.(json|png|jpg|webp)$/.test(value))
    throw Error("Invalid asset name.");
  return value;
}
async function put(bytes: Uint8Array, extension: string) {
  await mkdir(assetDirectory(), { recursive: true });
  const name = assetName(`${hash(bytes)}.${extension}`),
    target = path.join(assetDirectory(), name);
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "EEXIST"
      )
    )
      throw error;
    if (hash(await readFile(target)) !== hash(bytes))
      throw Error("Existing asset failed its content hash.");
  }
  return name;
}
export async function readLocalAsset(name: string) {
  const bytes = await readFile(path.join(assetDirectory(), assetName(name)));
  if (hash(bytes) !== name.split(".")[0])
    throw Error("Asset integrity mismatch.");
  return bytes;
}
function link(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2000)
    throw Error("Link is too long.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw Error("Social and website links must use HTTPS without credentials.");
  return url.toString();
}
export async function createLocalLaunchAssets(value: unknown, origin: string) {
  if (!value || typeof value !== "object")
    throw Error("Metadata object required.");
  const v = value as Record<string, unknown>;
  if (
    typeof v.name !== "string" ||
    typeof v.symbol !== "string" ||
    typeof v.description !== "string" ||
    typeof v.imageBase64 !== "string" ||
    typeof v.mime !== "string" ||
    Buffer.byteLength(v.description, "utf8") > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v.description)
  )
    throw Error(
      "Invalid metadata fields; description must be at most 1000 UTF-8 bytes.",
    );
  validateMetadataFields(
    v.name,
    v.symbol,
    "https://example.invalid/metadata.json",
  );
  const parsed = new URL(origin);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.origin !== origin
  )
    throw Error("Local metadata requires a loopback HTTP origin.");
  if (
    v.imageBase64.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v.imageBase64)
  )
    throw Error("Invalid bounded image encoding.");
  const image = Buffer.from(v.imageBase64, "base64");
  if (image.toString("base64") !== v.imageBase64)
    throw Error("Noncanonical image encoding.");
  validateImageBytes(image, v.mime);
  const decoder = sharp(image, {
    limitInputPixels: 4096 * 4096,
    failOn: "warning",
  });
  const info = await decoder.metadata();
  validateImageDimensions(info.width ?? 0, info.height ?? 0);
  if ((info.pages ?? 1) !== 1) throw Error("Use a static token image.");
  await decoder.resize(1, 1).raw().toBuffer(); // Complete a real decode, not a header-only MIME check.
  const ext = (
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<
      string,
      string
    >
  )[v.mime];
  if (!ext) throw Error("Unsupported image type.");
  const website = link(v.website),
    twitter = link(v.twitter),
    telegram = link(v.telegram);
  const provider = process.env.JEET_METADATA_STORAGE ?? "local-workspace";
  if (provider !== "local-workspace" && provider !== "pinata") throw Error("Unknown metadata storage provider.");
  const jwt = process.env.PINATA_JWT ?? "";
  if (provider === "pinata" && !jwt) throw Error("Pinata storage requires server PINATA_JWT; no mint was created.");
  const imageName = await put(image, ext);
  const imageUri = provider === "pinata"
    ? (await pinMetadataFile(image, imageName, v.mime, jwt)).uri
    : `${origin}/api/local-assets/${imageName}`;
  const document = {
    name: v.name,
    symbol: v.symbol,
    description: v.description,
    image: imageUri,
    ...(website ? { external_url: website } : {}),
    extensions: { website, twitter, telegram },
    properties: { category: "image", files: [{ uri: imageUri, type: v.mime }] },
  };
  const bytes = Buffer.from(JSON.stringify(document)),
    metadataName = await put(bytes, "json");
  const uri = provider === "pinata"
    ? (await pinMetadataFile(bytes, metadataName, "application/json", jwt)).uri
    : `${origin}/api/local-assets/${metadataName}`;
  validateMetadataFields(v.name, v.symbol, uri, true);
  return {
    storage: provider,
    sha256: hash(bytes),
    uri,
    imageUri,
    metadataName,
    imageName,
    document,
  };
}
