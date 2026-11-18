import { admitPublicRead } from "@/lib/public-read-limit";
import {
  checkedLocalGenesis,
  localWalletConfiguration,
  validateWalletRpc,
} from "@/lib/local-wallet-server";
import { publicBetaServerReadOnly } from "@/lib/public-beta";
import { walletUpstreamFetch } from "@/lib/wallet-rpc-server";
export const dynamic = "force-dynamic";
let active = 0;
export async function POST(request: Request) {
  if (publicBetaServerReadOnly() && !admitPublicRead(request.headers.get("x-real-ip") ?? "unknown"))
    return Response.json({ error: "Beta request limit reached. Retry shortly." }, { status: 429, headers: { "retry-after": "60" } });
  try {
    const { url, environment } = localWalletConfiguration(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return new Response("JSON required", { status: 415 });
    if (active >= 12)
      return new Response("RPC busy; try again shortly", { status: 429 });
    active++;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw Error("Missing request");
      let size = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 12000) {
          await reader.cancel();
          throw Error("Request too large");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.length;
      }
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const body = validateWalletRpc(JSON.parse(raw));
      if (publicBetaServerReadOnly() && ["sendTransaction", "simulateTransaction"].includes(String(body.method)))
        return Response.json({ error: "Public beta transaction operations are disabled." }, { status: 403 });
      await checkedLocalGenesis(url, environment.genesis);
      const result = await walletUpstreamFetch(url, raw, request.signal);
      // Preserve raw JSON integer lexemes. Kit's RPC parser handles u64 as bigint.
      return new Response(result.body, {
        status: result.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          ...(result.status === 429 ? { "retry-after": /^\d+$/.test(result.headers.get("retry-after") ?? "") ? result.headers.get("retry-after")! : "2" } : {}),
        },
      });
    } finally {
      active--;
    }
  } catch {
    // Provider errors can contain credential-bearing URLs. Never log their messages/bodies.
    return Response.json(
      {
        error:
          "Wallet RPC rejected or unavailable. Check the configured test network and retry shortly.",
      },
      { status: 503 },
    );
  }
}
