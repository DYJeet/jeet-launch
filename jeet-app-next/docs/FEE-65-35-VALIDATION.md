# 65/35 final validation and Devnet upgrade readiness

Validated 2026-11-17 on branch `repair/fees-65-35`. Application/program source is unchanged from ad258113b047cbcaed14d13fce644868849a34c3. The final source delta fixes only the wallet browser test's missing generated report directory, using recursive mkdir before JSON output. That affected suite was rerun and passed; lint and Node syntax checks passed. No program rebuild was needed.

**GO for one separately authorized in-place Devnet upgrade. No deployment is authorized or performed by this report.** This is readiness for Devnet verification, not completion of the genuine Devnet lifecycle or public-release wallet acceptance.

## Final results

| Suite | Positive checks / tests / groups | Expected rejections verified | Unexpected failures |
|---|---:|---:|---:|
| fees-production | 22 | 52 | 0 |
| fees-local | 24 | 52 | 0 |
| market-production | 62 | 37 | 0 |
| market-local | 63 | 37 | 0 |
| v5-local | 25 | 42 | 0 |
| fee-dashboard-browser | 7 | 4 | 0 |
| wallet-connection-browser | 15 | 10 | 0 |
| creation-trade-browser | 15 | 15 | 0 |
| node | 86 | 0 | 0 |
| native-rust | 13 | 0 | 0 |
| production-routes | 6 | 0 | 0 |
| responsive-release-browser | 3 | 0 | 0 |
| creation-input-browser | 4 | 0 | 0 |


The responsive public browser result represents three viewport acceptance groups (390/768/1440 px). Creation-input checks report four acceptance groups. Counts are per suite, not a claim that all suites are independent unit tests. Expected rejection checks pass only when rejection and rollback/unchanged balances are verified. TypeScript and ESLint passed. The production build passed and its existing BUILD_ID is `n5yQtPbX6qoJC6cniKtpc`; it was not rebuilt after the report-only test fix. Public release, wallet-connection and creation/trading browser suites assert zero unexpected page errors. The artifact's prior two-build byte-for-byte reproducibility was rechecked through preserved binaries and source/config/lockfile hashes rather than repeating a build.

Fee claim coverage includes immutable beneficiary and creator entitlement; unauthorized claim, substituted vault and treasury-redirection rejection; local creator and platform positive claims; exact buy/sell accruals and reserve/liability/rent conservation. Production-beneficiary positive platform signing was not attempted: only a separate disposable local-test treasury has its signer available. The approved real treasury is never substituted in the deployable binary.

Browser coverage includes real disposable Wallet Standard Ed25519 signatures against loopback validators: connection, rejection, network mismatch, duplicate-button prevention, account changes during signing, reconnect/disconnect, five-stage mint/metadata/custody/activation, Explore/discovery and curve chart, fee-inclusive buys, sells, balance refresh, creator claims and immutable fee history. Browser negative cases are explicitly injected and checked; successful chain execution and balances are genuine local validator results. No liquidity migration was run.

Installed Phantom/Solflare extensions and native mobile approval UI were not exercised. Those remain manual wallet acceptance checks before public release. The disposable Wallet Standard tests must not be described as an installed Phantom test.

## Exact artifact and policy

Artifact: `artifacts/devnet/fee-65-35/jeet_launch_custody.so`

SHA-256: `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa`

Size: 261840 bytes. The committed artifact is unchanged from the migration build.

Platform 65 bps (0.65%), immutable creator 35 bps (0.35%), nominal total 100 bps (1%). V3 rounds the total once and allocates its platform share upward; V4/V5 share a deterministic lifetime carry with platform target ceil(totalAccrued*13/20), creator remainder. Integer dust rounding is disclosed. Source, executable and quote invariants retain the exact approved treasury `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`; executable treasury bytes occur once. Free token creation excludes network costs and rent. No account layouts, PDA seeds, opcodes or instruction formats were changed. No administrative or withdrawal-authorization control was added.

## Devnet compatibility and limits

Target: `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D`. Finalized read at slot 523416823 confirmed executable status and the still-deployed, preserved **75/25** binary. Upgrade authority remains `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW`. ProgramData capacity 617552 bytes exceeds the new artifact; no extension is required. No program-owned launch or fee accounts exist. Therefore this specific Devnet target needs no accrued-account conversion. Nonzero historical 75/25 carry would not be silently reassigned; repeat account scanning immediately before an approved upgrade and stop if any accounts have appeared.

Payer balance 1.606113880 Devnet SOL. Old deployment buffer remains closed. Read-only quote: 273 writes of up to 960 bytes (1232-byte full transaction), 1.330985400 SOL refundable buffer rent, 0.001390000 SOL expected new nonrefundable fees. Including prior 0.001545000 SOL, expected cumulative fees are 0.002935000 SOL, below the prior 0.003 SOL cap by 0.000065 SOL. Quotes must be refreshed before signing, including recovery headroom; no additional funding is assumed.

An approved future attempt must revalidate hash, identities, executable state, zero affected accounts, balance and fee/rent limits; use one rate-limited uploader with fresh blockhashes and bounded retries; compare on-chain bytes before any retry, verify the complete buffer hash before authority handoff, simulate the final upgrade, and verify finalized ProgramData binary, treasury, authority and rent recovery. Stop on mismatches or exhausted budget.

## Preservation and prior test-environment failures

Exactly the five approved generated directories were removed after exact-path, no-tracked-file and active-process checks. Recovered 840503296 bytes. Temporary ledger credentials/configuration/logs were privately archived outside Git before deletion. No additional directories were deleted. New disposable test ledgers/browser data used the separate /tmp filesystem as appropriate. Workspace space is still limited; new resource-heavy work must check free space and use /tmp for temporary ledgers.

Original main and its uncommitted work, release 712f5b93e77f243ff8d0c35b98694abab56214c8, repair checkpoint 7781489, old 75/25 artifact and recovery archives remain intact. All 145 source files in the recovery archive were byte-compared with the original checkout and match. No private keys, seed phrases or API credential values are included in this checkpoint.

The earlier browser fee suite failed because a concurrent validator already bound gossip port 8000; saved validator logs prove the collision. Running that suite alone passed. The first market run was stopped by disk protection; the /tmp-based production and local market suites both passed. The wallet-connection assertions initially completed but JSON reporting failed with ENOENT; the minimal mkdir fix and complete rerun resolved it. No application defect was inferred from those environment/reporting failures. Original logs are preserved.

## Next owner action

Authorize a separate controlled Devnet-only upgrade of the existing program using the final checkpoint and exact SHA-256 above, within newly confirmed limits. Suggested existing bounds: refundable buffer rent at most 1.34 SOL and cumulative deployment fees at most 0.003 SOL including the prior 0.001545 SOL. Do not begin lifecycle transactions as part of that upgrade.

No Devnet/Mainnet transaction, funding transfer, token creation, trade or fee claim was submitted during this validation. The separate 0.05 Devnet SOL lifecycle authorization remains unused and reserved. After the upgrade is explicitly approved, executed and verified, the prepared single-token 1% allocation / 1% wallet-cap / protected-opening lifecycle plan can be re-simulated under the 65/35 binary. Public metadata was re-fetched without authentication: HTTP 200, 413 bytes, unchanged content hash.

Detailed checks and public local-validator evidence are in `artifacts/devnet/fee-65-35/validation-summary.json` and `validation-checks.json`. Credentials and private ledger archives remain excluded from Git.
