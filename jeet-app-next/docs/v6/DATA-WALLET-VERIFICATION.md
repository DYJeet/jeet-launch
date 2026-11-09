# V6 market data and wallet verification

The branch resumed from `6c01bb58272f2f0089cc58ba1c9df4d6765d54a8`. The four market data and wallet checkpoints above `4bfbcd6` were preserved. The earlier local financial and browser evidence remains in [the local audit handoff](LOCAL-AUDIT-HANDOFF.md). This continuation changes the acceptance harness and records fresh evidence for the newer branch.

## Fresh checks

- Node 24.22.1. Locked npm install, TypeScript, ESLint and the production build passed.
- 107 JavaScript checks passed, including six public gating tests, persistent SQLite ingestion, event parsing, discovery pagination, wallet signatures and receipt reconciliation. The public gating suite was rerun with an explicit check that the archive endpoint is closed outside local mode.
- Production Chromium smoke passed at 390px, 768px and 1440px using Chromium Headless Shell 156.0.8078.73.
- Locked native Rust tests passed with both default (13) and local fee-test (17) features. The production npm dependency audit reported zero vulnerabilities.
- The read-only Metaplex fixture recovery matched the pinned digest in the repository. The validator harness uses a disposable ledger, test programs, local metadata, and a disposable Wallet Standard signer.

## Local archive result

The combined browser lifecycle exited 0 with **39 positive and 24 rejection groups** at 390px, 768px and 1440px. The [browser evidence](local-finalized-archive-evidence.json) includes the exact transaction signatures, quotes, and account balances.

For each launch, the finalized curve archive stored the 22-token buy at 966 lamports and the 11-token sell at 491 lamports before fees. The creator withdrew 3 lamports. The Raydium archive reconciled a 1,000-lamport buy for 7 tokens and a 10-token sell for 1,157 lamports. The browser exercised the creator and Raydium sell signature searches and verified the migrated route after reload.

The locked standard and local custody SBF builds and the pinned Raydium build completed. The local custody digest is recorded in the browser evidence. The Raydium digest was `a33db1186011da4b21a09c240116a49066cc35baaa7b546cc93a42922c53f614`.

## Reproduce the archive acceptance

From `jeet-app-next`, use Node 24, the production build, pinned Agave 2.3.13 and the local custody, metadata and Raydium fixtures described in [the local audit handoff](LOCAL-AUDIT-HANDOFF.md). Set `JEET_VALIDATOR_BIN` and `JEET_CHROMIUM_PATH` to the recovered executables.

```sh
JEET_RELEASE_BROWSER=1 JEET_BROWSER_ARCHIVE=1 JEET_BROWSER_GRADUATION=1 \
  JEET_BROWSER_LOCAL_METADATA=1 npm run test:wallet:creation:browser
```

Archive mode checks persisted discovery and compares the curve buy, sell and creator fee claim to a separate connection to the app’s SQLite database. It also reconciles finalized Raydium buy and sell amounts through the history API and verifies exact-signature search in the browser. Completion evidence is written to `programs/launch-custody/target/v6-wallet/creation-browser-evidence.json`.

## Release boundaries

The verified data path uses a configured loopback validator and a writable SQLite volume. Discovery still scans at most 64 custody and 64 graduation terms accounts. The chart reflects supported executions in each history window, with curve and Raydium tracked separately. Backfill is bounded by available finalized RPC transaction data. Shared-cluster scaling and persistent production hosting remain open. Installed Phantom, Solflare and native mobile acceptance require those wallets and devices. A disposable local signer provides evidence for the Wallet Standard flow and signed transaction verification.
