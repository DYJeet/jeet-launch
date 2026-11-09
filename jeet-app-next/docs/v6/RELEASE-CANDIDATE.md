# JeeT Launch V6 local release candidate

This is an internal engineering handoff for an independent Solana security review. The sprint started from `29865503501e67a1fd7f1ce1be26d8a07cb37077`. The V6 branch preserves the frozen Milestone D main baseline `2eb12a91af071ef23f313a28e864c25a49fbe712`. Review the release branch commit and the binary digests in its evidence together.

## Architecture and accounting

The Next.js application exposes read-only discovery and market-history endpoints and a restricted local-wallet RPC endpoint. It is configured for one explicit loopback validator. Wallet Standard holds the wallet signing key. The app builds version-0 transactions, simulates and discloses debit bounds, verifies signed bytes and signatures, persists a pending signature, and submits the same wire. Confirmation and expiry checks reconcile the saved signature. Cross-tab Web Locks and on-chain state and slippage checks constrain concurrent submissions.

Launch creation stages mint setup, supply partition, custody/curve initialization, and immutable Metaplex metadata. Activation registers graduation terms and revokes both mint and freeze authorities atomically. The reference 1% creator allocation issues 1,000 tokens into 10 creator, 594 curve, and 396 migration tokens. Those amounts are a fixture, with allocations and exact quanta validated by the program for each launch.

Curve buys fund redemption backing and separately accrue 75 bps platform and 25 bps creator fees, using program-defined integer rounding. Sells debit curve backing by raw consideration and split it into the user's payout and the two fee accruals. Claims debit their own fee vault and require the immutable beneficiary. Claims, rent, and migration backing are reconciled independently. Creation has no platform charge. Network fees and account funding still apply.

Graduation requires eligible net sales, expiry of protected opening and cap windows, and backed migration balances. One atomic transaction transfers curve reserve and migration inventory to the approved CPMM pool, burns the initial LP position, records terms and closes curve trading. Fees remain separately claimable. Later CPMM liquidity issuance and third-party authority are separate from the initial LP burn.

Discovery indexes finalized program signature pages. It recognizes activation instructions or attributed logs, checks the canonical launch accounts and activation slot, and atomically saves observations with the cursor. SQLite namespaces data by genesis and program, stores one row per mint, and keyset-pages New, Trending, Final Stretch, and Migrated. The browser loads one page. Trending uses exact cumulative curve turnover. Confirmed market snapshots refresh in bounded batches, so large inventories can have older row observations. Finalized curve and CPMM archives page separately, deduplicate transaction receipts, and sum integer turnover. Unsupported swap paths are excluded. Live reserves and pool liquidity come from validated accounts and separate fee liabilities from spendable reserves.

## Program and authority inventory

| Role | Identity or authority |
| --- | --- |
| Standard JeeT program | `7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31`. The standard artifact keeps its existing public V5 gate. |
| Local V5 JeeT fixture | `8zhREvLzbAGnMPrQv9nQ4dzvgmq2unFAsLPaX9ZS3zo`. Local genesis binds this artifact. |
| Approved treasury beneficiary | `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`. The standard artifact retains it. Signer control requires separate confirmation. |
| Local test fee beneficiary | `2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ`. Disposable and reproducible. |
| Raydium CPMM fixture | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`, source `f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5`. Recorded terms select the actual pool. The config is index zero. |
| Metaplex | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`. Metadata authority and immutability are read from accounts. |
| SPL Token and associated token | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` and `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`. |
| Mint, custody and fees | Creator controls setup. Mint/freeze authorities are revoked at activation. Program PDAs control inventory, backing, migration and fee vaults. Creator and platform recipients authorize only their own claims. |
| Devnet and upgrade authority | Devnet requires distinct compiled program and treasury IDs and an approved payer and upgrade authority. The local fixture provides no public deployment or ProgramData authority evidence. |

## Reproduce locally

Use Node 24.22.1, the lockfiles, pinned Agave 2.3.13, Rust 1.99.1, and Chromium Headless Shell 156.0.8078.73. Run from `jeet-app-next`. Recover tools and build fixtures sequentially because the SBF toolchain alias is shared.

```sh
npm ci
bash scripts/recover-solana-tools.sh
source scripts/solana-tools-env.sh
npm run custody:build
npm run fees:build:local
npm run metadata:recover:local
npm run amm:build:local
npm run build
npx tsc --noEmit
npm run lint
npm run test:native
cargo test --locked --manifest-path programs/launch-custody/Cargo.toml --features local-fee-test
npm run test:local
npm run test:v5:local
npm run test:graduation:local
npm run test:amm:cpmm
node --test scripts/test-market-index.mjs scripts/test-release-data.mjs scripts/test-wallet-infrastructure.mjs
node scripts/test-scalable-discovery.mjs
JEET_CHROMIUM_PATH=/path/to/chrome-headless-shell node --test scripts/test-release-browser.mjs
JEET_CHROMIUM_PATH=/path/to/chrome-headless-shell npm run test:wallet:browser
JEET_CHROMIUM_PATH=/path/to/chrome-headless-shell JEET_BROWSER_LOCAL_METADATA=1 \
  JEET_BROWSER_GRADUATION=1 JEET_RELEASE_BROWSER=1 JEET_BROWSER_ARCHIVE=1 npm run test:wallet:creation:browser
```

Keep disposable validator ledgers, fixtures, local assets, and SQLite WAL storage on a persistent writable local volume. Use `JEET_MARKET_DB` for its explicit path. Back up the SQLite database through a checkpointed SQLite backup. Never reuse local program identities or signers on shared networks. Fixture recovery for Metaplex makes a read-only public Devnet RPC call and verifies the recorded digest. The local tests spend only validator test lamports.

## Internal findings and changes

- The prior discovery scan refused inventories above 64 accounts. The release candidate replaces it with finalized transaction backfill, persistent chain-scoped cursors, and bounded keyset results. The local scale run issued 68 genuine mints, restarted at eight saved records, injected an HTTP 429, and recovered all 68 exactly once.
- AMM history assumed the nonce-zero pool even though the program records the actual pool at graduation. The readers now derive pool accounts from program-owned terms and validate the canonical config and migrator. The SDK regression covers an alternate derived pool and rejected config substitution. The browser lifecycle exercised the default local pool.
- Archive totals are exact integer sums of attributable fills, deduplicated in the same transaction as the checkpoint. Missing or pruned records are flagged. Confirmed charts identify the page turnover and execution price range. Creator claims are excluded from trading turnover.
- The local wallet workspace exposes authorized account selection. A browser test changed the active account while a signing request was pending and verified there was no broadcast or balance change. The test signs with disposable keys and also exercises reconnect, rejection, wrong genesis, duplicate clicks, and cross-origin rejection.
- The audit initially reported eight moderate development-only dependency findings from the TypeScript ESLint minimatch chain. A scoped override pins the affected transitive package to 11.0.1 without changing runtime dependencies. A clean npm install, full and production-only npm audits, ESLint, TypeScript, and the production build passed after the override. Both audits reported zero findings.

## Regression evidence

- SDK, SQLite, metadata, wallet, RPC and public gating checks passed, including 107 JavaScript test cases and the public browser smoke script. The expanded browser smoke covered homepage, Explore, creation, revenue and signing gates at 390px, 768px and 1440px.
- The [wallet account evidence](local-wallet-account-evidence.json) records 15 positive and 10 rejection groups across those three widths. Installed Phantom, Solflare, and native mobile results remain unverified.
- The 13 default and 17 local-feature native Rust cases and both locked JeeT SBF builds passed. SHA-256 was `c84288a2c373ed455f694de5ba50ccd636762c46db8403822eac848e90388029` for the standard ELF and `f77d6eac73d0725ee0cb43294e39c6eec4cb5cb51520658e4bcce20db85909f3` for the local fixture. The local fixture digest matches the earlier verified lifecycle.
- The full legacy, V5, graduation, and CPMM standalone validators passed at the [starting checkpoint](DATA-WALLET-VERIFICATION.md). The unchanged financial program and fixtures carry that evidence forward. The integrated browser rerun passed **39 positive and 24 rejection groups** at all three widths. [Market evidence](local-release-candidate-market-evidence.json) records current creation, fee claims, trades, liquidity, migration, initial LP burn and AMM fills. Each width reconciled 1,457 lamports of curve turnover across two trades and 2,157 lamports of Raydium turnover across two swaps. The 3-lamport creator claim is separate.
- The optional Rust formatting check flagged pre-existing line wrapping on the two treasury declarations in `fees.rs`. The verified program source was preserved.

## Threat model and independent audit scope

- **Economic invariants.** Independently replay V4/V5 raw in and out, sell floors, rounding carry, split fees, claimant liabilities, token and reserve conservation, unsolicited transfers, overflow and failed-CPI rollback. Review all instruction/account aliases, owner and discriminator checks and authority transition paths.
- **Opening and migration.** Verify slot boundaries, gross receipts across alternate token accounts, races and duplicate migration, canonical CPMM identities and vaults, exact deposit and initial LP burn, withdrawal and remint behavior, and external configuration or upgrade changes.
- **Wallet and browser.** Threat-model compromised RPC, injected wallets, message substitution, wallet changes during signing, replay, stale quote, pending expiry races and storage failure. Inspect browser persistence, exact host/origin policy and the restricted RPC allowlist. Review server metadata validation, size limits, secret handling, XSS, external gateways and deployment isolation.
- **Index reliability.** Review checkpoint commit atomicity, rank/cursor invalidation, PRAGMA and DB lifecycle, missing and pruned RPC coverage, incomplete log/CPI evidence, account attribution, rate limiting and restart handling. The index is derived public data and has no authority to sign or change financial state.
- **Deployment.** Verify exact ELF and source reproduction, separate program/treasury/payer identities, on-chain ProgramData and Raydium upgrade authorities, configuration, incident response, persistent hosting, backups and public route guards.

## External acceptance

**Blocked** on installed-wallet access and shared-cluster acceptance. On desktop Phantom and Solflare, and separately on their supported mobile wallet browsers, connect a disposable account, switch accounts, reject a signature, change network, reload and reconnect, and verify which account is active. Confirm simulation, quote refresh, duplicate-click protection, a delayed confirmation and reconciliation. Record wallet/version, OS, device, chain, program, signatures and balances. The local chain uses the Wallet Standard Devnet-compatible label and a separately checked genesis. A wallet may decline signing for a loopback blockhash. No mobile deep-link transport has been implemented.

**Not implemented** for public operation: shared-cluster index hosting and continuously scheduled backfill. Local backfill is request-driven and bounded by RPC coverage, with visible incomplete/gap states. The archive charts cover supported fills in each page and keep venues separate. Unsupported routed/CPI-only and exact-output Raydium swaps have no fabricated records. A persisted gap remains visible even after later successful reads. Recovery of historical omissions requires a higher-coverage RPC and a deliberate rebuild. Background production indexing, multi-process load testing and provider sizing are separate release requirements.

No Devnet funding attempt or Mainnet transaction was made in the sprint. Shared-cluster acceptance needs an approved program profile, available test funding, persistent index infrastructure, verified external program/configuration, and genuine wallet/device testing. Public launch requires independent security review and explicit deployment authorization.

See [prior financial verification](DATA-WALLET-VERIFICATION.md), [prior security handoff](LOCAL-AUDIT-HANDOFF.md), [Devnet requirements](DEVNET-ACCEPTANCE.md), and the [scalable discovery evidence](local-scalable-discovery-evidence.json).
