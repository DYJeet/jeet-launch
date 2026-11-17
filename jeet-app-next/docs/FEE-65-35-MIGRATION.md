# JeeT Launch 65/35 migration

Prepared 2026-11-17. Branch: `repair/fees-65-35`, based on `7781489fc3811fcc06a0552be8c5dded22937826`. Prior repair branch and checkpoint branch `checkpoint/fee-75-25-7781489` remain at the verified 75/25 checkpoint. Main, detached release at 712f5b93e77f243ff8d0c35b98694abab56214c8, recovery archive, and prior compiled artifact are untouched. All migration files are inside jeet-app-next.

## Result and scope

Platform: 65 bps. Immutable token creator: 35 bps. Total: 100 bps. Creation remains free apart from network costs. Updated Rust fee engines, TypeScript quote/verification math, wallet trade fixtures, revenue/creation/trading labels, tests, and developer references. Historical receipts retain their original amounts and are explicitly marked superseded. No unrelated features, program deployment, Devnet funding, trading, token creation, or claims were submitted. Test-only transactions ran exclusively on an isolated loopback validator.

## Rounding, accounts, and security

Round the total once: ceil(raw/100). V3 divides that rounded total per transaction, with platform ceil(total*65/100) and creator the exact remainder. This corrects the legacy independent-component rounding that could charge an extra lamport. V4/V5 preserve shared buy/sell lifetime carry: platform target ceil(totalAccrued*13/20), creator remainder; trade fees are target deltas. Every charged lamport is allocated exactly once. Fee custody remains separate from redeemable reserves. Treasury and immutable creator authorization are unchanged. No account sizes, PDA seeds, discriminators, instruction opcodes, account metas, or instruction payload formats changed.

Nonzero legacy V4/V5 accruals can fail the new carry invariant. This release does not rewrite or redistribute those claims. A finalized Devnet scan found zero program-owned accounts and zero fee accounts, so this target has no accrued accounts requiring conversion. Repeat that scan immediately before upgrade; stop if any have appeared. This is not a general migration for live accounts on another deployment.

## Artifact and target verification

Artifact: `artifacts/devnet/fee-65-35/jeet_launch_custody.so`

SHA-256: `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa`

Size: 261840 bytes. Two Devnet-feature builds produced identical bytes. Build with `bash scripts/build-fee-65-35-devnet.sh` using the existing Solana tools on PATH; locked offline dependencies, no installation. The build needs at least 512 MiB free. The exact public program ID and approved beneficiary are asserted by build.rs and recorded in its generated identity source. The compiled binary contains the treasury public-key bytes exactly once. A declared program ID may be optimized out of the executable; target identity is also enforced by transaction construction and on-chain account verification.

Program: `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D`

Treasury: `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`

Upgrade authority: `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW` (unchanged).

Existing ProgramData capacity: 617552 bytes; no extension required. Existing executable still matches the prior approved 75/25 artifact. Old upload buffer is closed. Payer balance: 1.606113880 SOL.

## Validation

- 86 Node tests/module checks passed, zero failures in the final combined run. Includes dedicated 65/35 boundary/large-amount, lifetime carry, conservation, immutable treasury, and incompatible old-state checks.
- 13 native Rust tests passed.
- TypeScript noEmit passed. ESLint passed with zero errors; two warnings are confined to untracked local helper scripts.
- Local SBF V5 suite passed: 25 positive checks and 42 rejection/rollback checks. Covers allocation/partition, custody, exact buy/sell pricing and fees, reserve and supply conservation, protected opening, gross wallet caps, revoked authorities, substituted accounts, missing signer, stale sequence, and rollback.
- The separate legacy fee-claim/reserve suite did NOT complete: restarting the local validator timed out under severe disk pressure. Actual creator/platform claim execution and browser claim flows remain unverified for this artifact.
- Production browser tests did NOT pass: next start had no .next production build. Browser creation tests also lacked their expected fixture log. A production build and browser/claim regression run are deferred until disk space is recovered. Early local tests used an incorrect harness fixture; the final corrected V5 run passed. No product guard was weakened to make a test pass.

## Metadata

Existing project Pinata account and gateway work with the normal application HTTP client. The earlier Python-client 403 was client-specific; an additional invalid-CID result came from a trailing Markdown backtick included in URL extraction. Correct exact-CID retrieval returned HTTP 200. One disposable JEETTEST metadata JSON was published through existing infrastructure; no paid service was added. Existing project image is reused and publicly retrievable.

Public metadata: https://gateway.pinata.cloud/ipfs/bafkreicsyxczhcmdur2arx44cthughlu5kttxhb72y7fcgpzsc5kap2gn4

IPFS URI: ipfs://bafkreicsyxczhcmdur2arx44cthughlu5kttxhb72y7fcgpzsc5kap2gn4

Metadata SHA-256: `52c5c5938983a47408df9c14cf431d74eaa73b9c3fd63e5119f990baa03f466f`. Three separate unauthenticated HTTPS GETs returned 200 and identical 413-byte JSON. Prepared name JeeT Devnet Test, symbol JEETTEST, no monetary value. Public metadata files and lifecycle plan are checkpointed alongside the artifact; no credentials are included.

## Deployment estimate (read-only quote)

273 writes at 960 bytes; full write transaction is 1232 bytes. Create requires 2 signatures/10,000 lamports, each write 1 signature/5,000, handoff 1 signature/5,000, upgrade 2 signatures/10,000. Expected 276 transactions. Zero priority fee.

Refundable buffer rent: 1.330985400 SOL.
Expected new nonrefundable transaction fees: 0.001390000 SOL.
Prior cumulative deployment fees: 0.001545000 SOL.
Expected combined deployment fees: 0.002935000 SOL, leaving 0.000065 SOL under the previous cumulative 0.003 SOL cap. These are current RPC quotes, not guarantees or deployment authorization. Requote immediately before any approved submission and reserve enough budget for safe buffer recovery.

Use the successful uploader procedure: one buffer, payer temporary authority, serialized rate-limited writes, fresh blockhashes, confirmation and on-chain byte comparison before retries, bounded retries, budget reservation, full uploaded hash comparison before authority handoff, then simulate the final in-place upgrade. Verify finalized ProgramData hash, beneficiary, authority and rent recovery. Do not reuse an executing uploader or repeat confirmed writes. No upload code was executed for this migration.

## Lifecycle plan (not executed)

Existing disposable creator/trader public identities are recorded in `artifacts/devnet/fee-65-35/lifecycle-plan.json`. No funding occurred. The separate 0.05 SOL authorization is unused. Proposed single two-transfer funding message: 0.035 creator + 0.004 trader + 0.000005 network fee = maximum funding debit 0.039005 SOL, leaving 0.010995 SOL uncommitted. Internal wallet transfers must not be added again as external expenditures.

Known account rent estimate: creation 0.014605 SOL, metadata 0.004099560 SOL, trader ATA/receipt 0.002550160 SOL. Small buy fee-inclusive budget 0.000101 SOL; reserve 0.000100 SOL for lifecycle transaction fees. Metadata protocol fees, account sizes and all actual transaction messages must be simulated/requoted after upgrade before funding. The funding ceilings are not instructions to spend or a claim that every protocol fee is already quoted.

One token only, 1% creator allocation, 1% wallet cap, protected opening enabled (512-slot delay, 512-slot duration, 50-bps protected purchase limit), supported V5 supply/partition. Verify negative cases by simulation rather than paying for rejected Devnet transactions. Record mint, signatures, reserves, balances and exact 65/35 rounding. Creator claim only with the existing disposable signer. Platform claim remains unsigned until separate explicit owner signing approval; beneficiary is never substituted.

## Remaining blockers and owner action

Not yet fully validated for deployment: remaining fee-claim and production browser checks require disk recovery. No deployment approval is requested until those checks pass. No files were deleted.

Approval requested only for these newly generated, regenerable directories within this repair worktree (preserve all source, logs outside ledgers, manifests, binaries in artifacts/, existing recovery archive and old artifact):

| Directory relative to jeet-app-next | Allocated bytes |
|---|---:|
| .fee-migration/local-ledger | 107708416 |
| .fee-migration/local-ledger2 | 108437504 |
| .fee-migration/local-ledger3 | 243355648 |
| programs/launch-custody/target/debug | 289275904 |
| programs/launch-custody/target/sbpfv3-solana-solana | 96419840 |

Total candidate allocation: 845197312 bytes. Sizes are a stopped-process snapshot and must be rechecked before deletion. This should provide about 1 GiB free for remaining checks; no deletion or additional spending has been authorized or performed. A fresh disk check must gate subsequent build/validator work.

After remaining validations pass, request separate approval for one in-place Devnet upgrade of the exact checkpointed artifact and fresh quoted limits. The owner has not authorized any upgrade or lifecycle transaction for this migration.

## Changed files

- `jeet-app-next/.gitignore`
- `jeet-app-next/artifacts/devnet/fee-65-35/jeet_launch_custody.so`
- `jeet-app-next/artifacts/devnet/fee-65-35/lifecycle-plan.json`
- `jeet-app-next/artifacts/devnet/fee-65-35/manifest.json`
- `jeet-app-next/artifacts/devnet/fee-65-35/test-token-metadata.json`
- `jeet-app-next/docs/FEE-65-35-MIGRATION.md`
- `jeet-app-next/docs/fee-engine.md`
- `jeet-app-next/docs/master/financial-checkpoint.md`
- `jeet-app-next/docs/master/financial-v4.md`
- `jeet-app-next/docs/master/v5-design.md`
- `jeet-app-next/docs/master/v5-economics/OWNER-DECISION.md`
- `jeet-app-next/docs/master/v5-rising/AMM-READINESS.md`
- `jeet-app-next/docs/master/v5-rising/EXECUTION.md`
- `jeet-app-next/docs/master/v5-rising/GRADUATION-EXECUTION.md`
- `jeet-app-next/docs/master/v5-rising/OWNER-DECISION.md`
- `jeet-app-next/docs/master/v5-rising/UX-SPEC.md`
- `jeet-app-next/docs/v6/RELEASE-CANDIDATE.md`
- `jeet-app-next/package.json`
- `jeet-app-next/programs/launch-custody/src/fees.rs`
- `jeet-app-next/programs/launch-custody/src/market.rs`
- `jeet-app-next/scripts/build-fee-65-35-devnet.sh`
- `jeet-app-next/scripts/test-fee-65-35.mjs`
- `jeet-app-next/scripts/test-fee-client.mjs`
- `jeet-app-next/scripts/test-fee-dashboard.mjs`
- `jeet-app-next/scripts/test-market-math.mjs`
- `jeet-app-next/scripts/test-market.mjs`
- `jeet-app-next/scripts/test-public-gating.mjs`
- `jeet-app-next/scripts/test-release-browser.mjs`
- `jeet-app-next/scripts/test-v5-rising.mjs`
- `jeet-app-next/scripts/test-wallet-v5-trade.mjs`
- `jeet-app-next/src/app/create/page.tsx`
- `jeet-app-next/src/app/page.tsx`
- `jeet-app-next/src/components/FeeConsole.tsx`
- `jeet-app-next/src/components/WalletLaunchCreator.tsx`
- `jeet-app-next/src/components/WalletLaunchReader.tsx`
- `jeet-app-next/src/lib/launch-fees.ts`
- `jeet-app-next/src/lib/launch-market.ts`
- `jeet-app-next/src/lib/v5-pricing.ts`
