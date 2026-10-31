import { NextResponse, type NextRequest } from "next/server";
import { findLaunch } from "@/lib/launches";

/** Reject unknown public launches before streaming begins (streamed notFound can carry HTTP 200). */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/local-metadata") {
    return process.env.JEET_LOCAL_METADATA_VERIFY === "1" ? NextResponse.next()
      : new NextResponse("Metadata verification is disabled", {status:404, headers:{"cache-control":"no-store"}});
  }
  const mint = request.nextUrl.pathname.split("/")[2];
  if (process.env.JEET_LOCAL_WALLET !== "1" && !findLaunch(mint)) {
    return new NextResponse("Verified launch not found", {status:404, headers:{"cache-control":"no-store"}});
  }
  return NextResponse.next();
}
export const config = {matcher:["/token/:mint", "/local-metadata"]};
