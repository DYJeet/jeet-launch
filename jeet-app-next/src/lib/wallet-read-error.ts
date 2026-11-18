import { isSolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR } from "@solana/kit";

/** Hide transport diagnostics while retaining actionable account-validation errors. */
export function describeLaunchReadError(error: unknown): string {
  if (isSolanaError(error, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) {
    const status = Number(error.context.statusCode);
    return status === 429 || status >= 500
      ? "Test-network RPC is busy or unavailable. Wait briefly, then refresh on-chain state."
      : "The launch-data request was rejected. Check the configured test network and refresh.";
  }
  return error instanceof Error ? error.message : "Launch data is unavailable. Refresh on-chain state.";
}
