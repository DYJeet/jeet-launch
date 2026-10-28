import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_RPC_URL = "http://127.0.0.1:8899";

export async function GET() {
  try {
    const response = await fetch(LOCAL_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });

    const payload = (await response.json()) as {
      result?: string;
      error?: { message?: string };
    };

    if (!response.ok || payload.result !== "ok") {
      return NextResponse.json(
        {
          ok: false,
          message: payload.error?.message ?? "Local validator is not healthy yet.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true, rpc: LOCAL_RPC_URL });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Local validator is not running. Start it with: npm run validator",
      },
      { status: 503 },
    );
  }
}
