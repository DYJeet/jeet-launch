import { localWalletConfiguration } from "@/lib/local-wallet-server";
import { assetName, readLocalAsset } from "@/lib/local-launch-assets";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  try {
    localWalletConfiguration(request);
    const name = assetName((await context.params).name),
      bytes = await readLocalAsset(name);
    const type = name.endsWith(".json")
      ? "application/json; charset=utf-8"
      : name.endsWith(".png")
        ? "image/png"
        : name.endsWith(".jpg")
          ? "image/jpeg"
          : "image/webp";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": type,
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response("Local asset unavailable", { status: 404 });
  }
}
