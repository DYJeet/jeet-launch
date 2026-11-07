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

## Executed release checks

- Node 24.22.1, Agave 2.3.13, native Rust 1.99.1, and Chromium 156.0.8078.73. Production build, TypeScript, ESLint, 89 targeted JavaScript/SDK cases and six public gating cases passed. The public Chromium smoke passed at 390px and 1440px. Reproduce it after the production build with `JEET_CHROMIUM_PATH=/path/to/chrome-headless-shell node --test scripts/test-release-browser.mjs`.
- All 17 native Rust cases passed. Fresh default and local fee-test SBF builds passed with platform tools v1.48. The local binary matched Milestone D SHA-256 `de162b056a588d075d186833f6e8ad2e355d7c8638ec9fbce8d2976414e11ebe`. An earlier run rejected custody initialization with a stale cached binary. The rebuilt binary resolved it.
- The local release browser suite passed 10 positive and 11 rejection groups across both viewports, using local workspace metadata and a disposable Wallet Standard signer. It covered creation, safe activation, refresh/reconnect, a real buy and sell, verified discovery, curve history and an authorized creator claim. It did not repeat the live Pinata or Raydium path. Those results are recorded at the unchanged Milestone D baseline.
- Both launches started with 1,000 base units (10 creator, 594 curve and 396 migration). Each buy delivered 22 units for 976 lamports (966 reserve, 8 platform, 2 creator). Each sell returned 11 units and paid 486 lamports (491 reserve debit, 4 platform, 1 creator). The wallet held 21 units, the curve held 583, and migration custody held 396. The reserve rose by 475 lamports and fee liabilities rose by 12 platform and 3 creator lamports. Creator claims withdrew 3 lamports per launch. Each buy debited the wallet 1,460,616 lamports including 1,454,640 in account funding and a 5,000 network fee. Each sell paid 486 lamports before a 5,000 network fee.
- The fresh V5 validator suite passed 25 positive and 42 rejection/rollback checks.
- npm production audit reported zero advisories. The full audit reported eight moderate advisories and zero high or critical advisories. This is dependency scan evidence, with independent review still outstanding.

| Chromium width | Curve buy signature | Curve sell signature | Creator claim signature |
| --- | --- | --- | --- |
| 390px | `3iQm4RrCiBAQFJfgnrWyPYJ6pubuSeA6t3MNMrQtQ7AcTyfz2HpKZNPz22wngoGDVLe39VRuV7wMBK14kzTUF3Hy` | `56pJM2zct4PDFHe13N3JA8WTJ4EjfLHGk6WC2BSsKkouTbtBPj14oLQ82mwZF3umc2AwUtat3uKCkJ9qTowRukzp` | `5bNGFAGBriLDJEJWPuwYG4oZkUcfcjVPSMrRrs9HQFVXkTt9n72stQLALv5kjdActobhcqjkxfwDF6FKET6KaMX1` |
| 1440px | `22qm5g399P3We3YXJBstsmVio7DZCJTWP2XcXJbVrYkUVrTsLMgtjCqyhQLAmvZHBSAi1srFuDTriwNi7iPpkw4N` | `cCPkbvHETfanxz86hxUWaaZzotSQxj5KfNp4iMHssXHQxYdZG9Gx79uc7TSGV6BeK4rrAQGfHNxRfF5w1EdFwDk` | `594zmpE7nPaDiM5MEZzz4anzVwbcCEjbnkiPJZuzLG41KmxC4movCtH3NmPNvm5LNHfHrZxZtimUGwU8RoujUHc1` |

## Release gates and operations

- Devnet RPC returned absent accounts for both the default JeeT ID and the local V5 test ID at confirmed context slot 519680247. A disposable address's RPC airdrop request returned HTTP 410, indicating the RPC faucet is closed. The RPC directed users to the separate interactive faucet.
- The V5 instruction set and test Raydium integration currently compile behind `local-fee-test`, which selects a publicly reproducible test treasury and a local program ID. The default program rejects these instructions. Treat that fixture as local only. A separate reviewed Devnet build, distinct program and authority, and funded disposable Devnet wallet are prerequisites for the requested Devnet lifecycle. Enabling public operation also requires replacing the loopback-only browser environment with an explicit, validated network configuration.
- Installed Phantom, Solflare, and native mobile wallet compatibility require hands-on testing on a supported desktop and mobile device. Local Wallet Standard harness transactions do not count as installed-wallet evidence.
- Production discovery scale, end-to-end public rollout, external security review, and operational approvals remain open. Follow the authority, deploy and recovery gates in [operations](../master/operations.md) and the [audit package](../master/audit-package.md).
- The verified V5 program, fee arithmetic, migration, fee custody and D browser AMM path are inherited from [Milestone D](MILESTONE-D-LOCAL-GRADUATION.md). No Rust sources, pinned dependencies, or approved economics changed in this checkpoint. Mainnet deployment is outside this work.
