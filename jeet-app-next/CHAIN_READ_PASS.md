# JeeT Launch — Live chain read pass

This pass adds read-only Solana Devnet data on top of the reviewed wallet foundation.

## Added
- Live connected-wallet SOL balance (read-only, 20s refresh)
- Shared JSON-RPC helper using `NEXT_PUBLIC_SOLANA_RPC_URL` with Devnet fallback
- SPL mint account parser for standard mint state
- Live mint authority / freeze authority state
- Live supply, decimals, initialization state, and token-program owner
- Graceful placeholder / missing-account / RPC-error states
- No signing, no token creation, no buy/sell, and no SOL movement

## Safety / architecture notes
- Devnet remains the default cluster.
- Wallet keys never leave the wallet; this pass only reads public chain state.
- Current demo launch cards still use placeholder mint addresses, so the live mint panel intentionally explains that live data is unavailable until a real Devnet mint exists.
- The existing launch-integrity card remains demo/config data for now. Live chain state is displayed separately so mock values are not misrepresented as verified on-chain facts.

## Next production gate
1. Copy this source over the existing `jeet-app` without replacing the working package-lock unless needed.
2. Run `npm run build` in Codespaces.
3. Connect a Devnet wallet and confirm balance read.
4. Add a real Devnet mint to one launch and verify mint/freeze authority + supply reads.
