import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "@solana/kit";

/** Reject unknown public launches before streaming begins (streamed notFound can carry HTTP 200). */
export function proxy(request: NextRequest) {
  const previewHost = process.env.JEET_PREVIEW_HOST;
  if (process.env.NODE_ENV === "development" && previewHost && process.env.JEET_LOCAL_WALLET !== "1") {
    const path = request.nextUrl.pathname;
    const allowed = ["/", "/explore", "/api/launches", "/api/market-history"].includes(path) ||
      /^\/token\/[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(path) ||
      path.startsWith("/_next/static/") || path === "/favicon.ico";
    if (!allowed || request.method !== "GET" || request.headers.get("host") !== previewHost ||
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (request.headers.has("origin") && request.headers.get("origin") !== "https://" + previewHost))
      return new NextResponse("Private read-only preview", { status: 404 });
    return NextResponse.next();
  }
  if (request.nextUrl.pathname === "/create") {
    return process.env.JEET_LOCAL_WALLET === "1"
      ? NextResponse.rewrite(new URL("/local-create", request.url))
      : NextResponse.next();
  }
  if (request.nextUrl.pathname === "/local-create") {
    return process.env.JEET_LOCAL_WALLET === "1" ? NextResponse.next()
      : new NextResponse("Local creation is disabled", { status: 404, headers: { "cache-control": "no-store" } });
  }
  if (request.nextUrl.pathname === "/local-metadata") {
    return process.env.JEET_LOCAL_METADATA_VERIFY === "1" ? NextResponse.next()
      : new NextResponse("Metadata verification is disabled", {status:404, headers:{"cache-control":"no-store"}});
  }
  if (!request.nextUrl.pathname.startsWith("/token/")) return NextResponse.next();
  const mint = request.nextUrl.pathname.split("/")[2];
  if (process.env.JEET_LOCAL_WALLET !== "1" || !isAddress(mint)) {
    return new NextResponse("Verified launch not found", {status:404, headers:{"cache-control":"no-store"}});
  }
  return NextResponse.next();
}
export const config = {matcher: ["/:path*"]};
