import { signature } from '@solana/kit';
import { createServerWalletRpc } from './wallet-rpc-server.ts';
import { checkedLocalGenesis } from './local-wallet-server.ts';

/** A failed/missing record must keep its page retryable; never replace it with invented events. */
export async function recoverFinalizedTransaction<T>(primary: () => Promise<T | null>, archive?: () => Promise<T | null>): Promise<T> {
  try { const result = await primary(); if (result !== null) return result; } catch { /* Only a separately configured archive may recover this read. */ }
  if (archive) { const result = await archive(); if (result !== null) return result; }
  throw Error('Finalized transaction unavailable; history remains incomplete and its cursor is retained.');
}
export function archiveEndpoint(raw: string | undefined) {
  if (!raw) return;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || /mainnet/i.test(url.href))
    throw Error('An explicit HTTPS Devnet archive endpoint is required.');
  return url.href;
}
export function archivalTransactionReader(value: string, genesis: string) {
  const endpoint = archiveEndpoint(process.env.JEET_DEVNET_ARCHIVE_RPC);
  if (!endpoint) return;
  return async () => {
    // Both the primary reader and archive are pinned to the exact caller-verified Devnet genesis.
    if (genesis !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw Error('Archive is Devnet-only.');
    await checkedLocalGenesis(endpoint, genesis);
    return createServerWalletRpc(endpoint).getTransaction(signature(value), {
      encoding: 'json', commitment: 'finalized', maxSupportedTransactionVersion: 0,
    }).send({ abortSignal: AbortSignal.timeout(12000) });
  };
}
export async function verifiedHistoryRpc(primary: string, genesis: string) {
  const archive = archiveEndpoint(process.env.JEET_DEVNET_ARCHIVE_RPC);
  if (!archive) return createServerWalletRpc(primary);
  if (genesis !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw Error('Archive is Devnet-only.');
  await checkedLocalGenesis(archive, genesis);
  // Use the same archive for signature pagination as for unavailable transaction bodies.
  // A transaction-only fallback cannot recover signatures pruned by the primary provider.
  return createServerWalletRpc(archive);
}
export function historyCoverageGap(firstAvailable: bigint, creationSlot?: bigint) {
  return firstAvailable > 0n && (creationSlot === undefined || firstAvailable > creationSlot);
}
