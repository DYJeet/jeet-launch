# Frontend validation / read reliability checkpoint

Parent: 120687fe0089428da328368fc9dccb919fe63b80.
This phase changes no Solana program, instruction, authority or launch economics.

- Fix all existing frontend ESLint errors and image warnings with no suppressions.
- Create blob preview URLs in the upload event and revoke them on replacement,
  clearing or unmount; use Next Image for actual local previews and Link for navigation.
- Cancel superseded/unmounted validator health reads and bound their timeout.
- Bind balance display to wallet identity, clear it on identity changes including
  disconnect/reconnect, cancel old reads and prevent overlapping polling requests.
- Require public keys decoding to exactly 32 bytes. Validate the standard SPL
  mint owner, exact 82-byte layout, option flags and actual initialization state.
- Preserve u64 token supply as BigInt; reject unsafe or negative/fractional SOL
  balance responses rather than displaying an invented precise amount.
- Retry only reads, at most three attempts with 250/500 ms backoff for transient
  HTTP/network/node-behind failures. Bound each fetch to eight seconds. Cancellation
  stops retries. Permanent errors, invalid JSON and timeouts are reported.
- No signing/send retry, hidden network switch or mainnet fallback was introduced.

Validation: 11 RPC unit tests passed; full ESLint passed with zero errors/warnings;
production build and TypeScript passed; full local financial regression suite
passed, including all prior tests and V4. Browser fee regression uses real local
SBF transactions, not a public Devnet deployment. Program artifacts remain those
verified at the parent checkpoint. Exact evidence is in frontend-rpc-verification.json.

This phase does not complete wallet-standard verification across real wallets,
WebSocket recovery, configurable/fallback RPC, metadata creation, discovery,
integrity pages or V4 trading UI. The existing mocked Explore/token pages remain
unfinished and must not be treated as real launch activity. Master readiness is
INCOMPLETE. Migration economics and authority constraints remain documented in
remaining-work.md. Frozen baselines remain untouched; source changes are confined
to jeet-app-next. Mainnet deployment is not authorized or performed.
