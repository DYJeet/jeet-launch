import { checkedLocalGenesis, localWalletConfiguration, validateWalletRpc } from "@/lib/local-wallet-server";
export const dynamic = "force-dynamic";
let active = 0;
export async function POST(request: Request) {
  try {
    const { url, environment } = localWalletConfiguration(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("JSON required", { status: 415 });
    if (active >= 12) return new Response("RPC busy; try again shortly", { status: 429 });
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
        if (size > 12000) { await reader.cancel(); throw Error("Request too large"); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      validateWalletRpc(JSON.parse(raw));
      await checkedLocalGenesis(url, environment.genesis);
      const result = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
        body: raw, signal: AbortSignal.timeout(15000), cache: "no-store" });
      // Preserve raw JSON integer lexemes. Kit's RPC parser handles u64 as bigint.
      return new Response(result.body, { status: result.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } finally { active--; }
  } catch {
    return Response.json({ error: "Wallet RPC rejected or unavailable. Check local network/configuration." }, { status: 503 });
  }
}
