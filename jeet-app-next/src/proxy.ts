import { NextResponse, type NextRequest } from "next/server";
import { isAddress } from "@solana/kit";
import { walletModeEnabled, localWalletConfiguration } from "./lib/local-wallet-server";
import { WALLET_NETWORK } from "./lib/wallet-program";

/** Reject unknown public launches before streaming begins (streamed notFound can carry HTTP 200). */
export function proxy(request: NextRequest) {
  const previewHost = process.env.JEET_PREVIEW_HOST;
  if (process.env.NODE_ENV === "development" && previewHost && !walletModeEnabled()) {
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
  const enabled = walletModeEnabled();
  if (enabled && (["/create", "/local-create"].includes(request.nextUrl.pathname) || request.nextUrl.pathname.startsWith("/token/"))) {
    try { localWalletConfiguration(request, { pageNavigation: true }); }
    catch { return new NextResponse("Configured test-wallet origin required", { status: 404 }); }
  }
  if (request.nextUrl.pathname === "/create") {
    // Devnet renders the wallet form directly. Rewriting behind an HTTPS
    // reverse proxy can replace Host and invalidate the exact-origin check.
    return enabled && WALLET_NETWORK === "local"
      ? NextResponse.rewrite(new URL("/local-create", request.url))
      : NextResponse.next();
  }
  if (request.nextUrl.pathname === "/local-create") {
    return enabled ? NextResponse.next()
      : new NextResponse("Local creation is disabled", { status: 404, headers: { "cache-control": "no-store" } });
  }
  if (request.nextUrl.pathname === "/local-metadata") {
    return process.env.JEET_LOCAL_METADATA_VERIFY === "1" ? NextResponse.next()
      : new NextResponse("Metadata verification is disabled", {status:404, headers:{"cache-control":"no-store"}});
  }
  if (!request.nextUrl.pathname.startsWith("/token/")) return NextResponse.next();
  const mint = request.nextUrl.pathname.split("/")[2];
  if (!enabled || !isAddress(mint)) {
    return new NextResponse("Verified launch not found", {status:404, headers:{"cache-control":"no-store"}});
  }
  return NextResponse.next();
}
export const config = {matcher: ["/:path*"]};
