import {
  localWalletConfiguration,
  checkedLocalGenesis,
} from "@/lib/local-wallet-server";
import { createLocalLaunchAssets } from "@/lib/local-launch-assets";
import { createLocalUploadLimiter } from "@/lib/local-upload-limit";
const admit = createLocalUploadLimiter();
export const dynamic = "force-dynamic";
let active = 0;
export async function POST(request: Request) {
  try {
    const config = localWalletConfiguration(request);
    if (active >= 2) return Response.json({error:"Upload busy; retry after the current operation finishes."}, { status: 429 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({error:"JSON required"}, { status: 415 });
    if (!admit()) return Response.json({error:"Local upload quota exhausted; retry later."}, {status:429, headers:{"retry-after":"3600"}});
    active++;
    try {
      await checkedLocalGenesis(config.url, config.environment.genesis);
      const reader = request.body?.getReader();
      if (!reader) throw Error("Missing upload");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 2900000) {
          await reader.cancel();
          throw Error("Upload exceeds limit");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      const host = request.headers.get("host") ?? new URL(request.url).host;
      const origin = `http://${host}`;
      const result = await createLocalLaunchAssets(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
        origin,
      );
      return Response.json(result, {
        headers: { "cache-control": "no-store" },
      });
    } finally {
      active--;
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Local upload failed" },
      { status: 400 },
    );
  }
}
