import { admitPublicRequest } from "@/lib/public-read-limit";
import {
  localWalletConfiguration,
  checkedLocalGenesis,
} from "@/lib/local-wallet-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await admitPublicRequest(request))) return Response.json({ error: "Shared request quota unavailable or exhausted." }, { status: 429, headers: { "retry-after": "60" } });
  try {
    const { url, environment } = localWalletConfiguration(request);
    await checkedLocalGenesis(url, environment.genesis);
    return Response.json(environment, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Explicit test-wallet configuration and a matching network are required.",
      },
      { status: 503 },
    );
  }
}
