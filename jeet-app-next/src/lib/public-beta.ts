import { publicWriteConfigurationReady } from './public-write-policy.ts';
// Fail closed by default. Live Production remains read-only; no environment changes are made by this candidate.
export const PUBLIC_BETA_READ_ONLY = process.env.NEXT_PUBLIC_JEET_PUBLIC_BETA === "1";
export const PUBLIC_BETA_MESSAGE = "Devnet beta · test tokens have no monetary value. Creation, signing, trading, claims and migration are disabled pending post-upgrade acceptance.";
export function assertTransactionsEnabled() {
  if (PUBLIC_BETA_READ_ONLY || (process.env.VERCEL === '1' && publicBetaServerReadOnly())) throw Error(PUBLIC_BETA_MESSAGE);
}
export function publicBetaServerReadOnly() {
  return PUBLIC_BETA_READ_ONLY || (process.env.VERCEL === '1' && !publicWriteConfigurationReady(process.env));
}
