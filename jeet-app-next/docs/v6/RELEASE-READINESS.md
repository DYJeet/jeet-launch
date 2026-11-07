# JeeT Launch release readiness

Baseline: Milestone D main commit `2eb12a91af071ef23f313a28e864c25a49fbe712`.
Release work is on `development/v6-release`. All changes are under `jeet-app-next`.

## Application changes

- Home, Explore and local Revenue use a confirmed, genesis-checked local launch index. The index requires canonical custody, metadata, graduation terms, a V5 curve, and revoked mint and freeze authorities. It excludes staged launches. New sorts by activation slot. Trending ranks cumulative curve turnover and excludes Raydium swaps. Final Stretch begins at 90% and excludes migrated launches. Migrated requires matching curve and graduation states.
- Search is case-insensitive across name, ticker and mint. Requests are debounced and canceled when superseded. Lists paginate at 12 results. The local index has a five-second cache and rejects inventories above 64 custody or terms accounts. This is a disposable validator index. A production index requires an indexed and paginated data source.
- The token detail page renders verified account data and recent curve trades from the last 16 confirmed curve transactions. It attributes trade logs to the configured program and validates the mint and integer fee identities. The chart shows execution prices before fees. It excludes AMM trades. A complete AMM history and chart require an additional source.
- Fee balances come from existing fee custody accounts. Local claims use the existing instruction and signer checks, require a fresh on-chain quote, and use the wallet executor for simulation, confirmation, and pending signature reconciliation.
- Public launch routes remain closed. The existing Devnet revenue view and legacy mint test remain gated by their original conditions. No email authentication flow or provider configuration was present in the reviewed baseline.

## Verification commands

Run from `jeet-app-next` with a supported Node version.

```sh
npm ci
npx tsc --noEmit
npm run lint
npm run build
npm run test:public:gating
node --test scripts/test-release-data.mjs scripts/test-wallet-infrastructure.mjs scripts/test-wallet-v5-trade.mjs scripts/test-wallet-amm.mjs
npm audit
```

For the local browser regression, use the Milestone D instructions and pinned test programs. The existing browser harness can exercise discovery, curve charts and the creator claim after trading.

```sh
JEET_BROWSER_TRADE=1 JEET_RELEASE_BROWSER=1 npm run test:wallet:creation:browser
```

The harness accepts `JEET_VALIDATOR_BIN` and `JEET_CHROMIUM_PATH` for pinned executables. It starts a fresh test ledger and loopback Next server. Local workspace metadata is the default. The separate live Pinata path requires its operator-provided server credential and explicit `JEET_CREATION_STORAGE=pinata`. Preserve the harness evidence file and its temporary ledger logs when comparing results.

## Release gates and operations

- Devnet RPC returned absent accounts for both the default JeeT ID and the local V5 test ID at confirmed context slot 519680247. A disposable address's RPC airdrop request returned HTTP 410, indicating the RPC faucet is closed. The RPC directed users to the separate interactive faucet.
- The V5 instruction set and test Raydium integration currently compile behind `local-fee-test`, which selects a publicly reproducible test treasury and a local program ID. The default program rejects these instructions. Treat that fixture as local only. A separate reviewed Devnet build, distinct program and authority, and funded disposable Devnet wallet are prerequisites for the requested Devnet lifecycle. Enabling public operation also requires replacing the loopback-only browser environment with an explicit, validated network configuration.
- Installed Phantom, Solflare, and native mobile wallet compatibility require hands-on testing on a supported desktop and mobile device. Local Wallet Standard harness transactions do not count as installed-wallet evidence.
- Production discovery scale, end-to-end public rollout, external security review, and operational approvals remain open. Follow the authority, deploy and recovery gates in [operations](../master/operations.md) and the [audit package](../master/audit-package.md).
- The verified V5 program, fee arithmetic, migration, fee custody and D browser AMM path are inherited from [Milestone D](MILESTONE-D-LOCAL-GRADUATION.md). No Rust sources, pinned dependencies, or approved economics changed in this checkpoint. Mainnet deployment is outside this work.
