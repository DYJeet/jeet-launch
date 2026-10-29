# JeeT Launch internal financial review package

Status: **INCOMPLETE** master assignment. This package is a review aid for the
verified financial phase, not a claim that the full platform is audit-ready.
No independent security audit has occurred.

## Latest economic proposal (not activated)

The rising V5 proposal and UX specification are in
[v5-rising/OWNER-DECISION.md](v5-rising/OWNER-DECISION.md) and
[v5-rising/UX-SPEC.md](v5-rising/UX-SPEC.md). The earlier flat-price economic
proposal remains a comparison baseline and is not approved for activation.
V5 on-chain execution, AMM migration and permanent LP disposition remain absent.

## Review map

- [V4 architecture, schema, instruction ABI, fee and redemption proofs](financial-v4.md)
- [Authorities, trust boundaries and threat model](authority-and-threat-model.md)
- [Reproduction harness and verification scope](verification.md)
- [Operations, incident limitations and mainnet deployment hold](operations.md)
- [Remaining implementation, decisions and dependency findings](remaining-work.md)
- [Original custody and PDA layout](../launch-custody.md)
- [Original cumulative wallet caps](../opening-wallet-caps.md)
- [Original integer bonding curve](../bonding-curve.md)
- [Original protected-opening layout and boundaries](../protected-opening.md)
- [Original fee ABI, immutable beneficiaries and claims](../fee-engine.md)

The original documents retain their checkpoint/version context. For newly
initialized V4 markets, financial-v4.md takes precedence only for the explicitly
new market fields, instructions and rounding policy. Existing launches are not
upgraded and keep their verified semantics.

## Source and test inventory

Rust modules: lib.rs (entry dispatch/custody), caps.rs, protected.rs, curve.rs,
fees.rs and market.rs under programs/launch-custody/src. Rust Cargo.lock and npm
package-lock.json pin the existing dependency graph; there is no upgrade in this
financial phase. The default and local-only IDs are declared separately in lib.rs.

SDK: launch-custody.ts, launch-fees.ts and launch-market.ts in src/lib.
Browser fee execution: components/FeeConsole.tsx. The existing browser fee flow
remains V3; a completed V4 trade frontend is not claimed.

Old local suites: test-creator-allocation.mjs, test-wallet-caps.mjs,
test-bonding-curve.mjs, test-protected-opening.mjs, test-fees.mjs,
test-fee-integrity.mjs, test-fee-client.mjs and test-fee-dashboard.mjs.
New: test-market.mjs, test-market-integrity.mjs and test-market-math.mjs.
run-custody-tests.mjs integrates every old local suite and both market variants;
verify-financial.sh orchestrates the complete financial verification sequence.

Local tests use separate transaction-fee sponsors to make rollback assertions
exact for buyer/beneficiary SOL. Rejection tests inspect actual failed transaction
references and compare protected account snapshots. Deliberately inconsistent
accounts are public genesis fixtures, not application admin instructions.

## Required independent review

Review every account alias, CPI, arithmetic boundary, legacy entry point and
financial invariant against the exact candidate commit and reproduced artifact.
Assess upgrade/deployment governance and dependency advisory reachability.
The later metadata, indexer, wallet UX and migration implementation need their own
review; this package must be updated before a complete independent audit handoff.
A local test signature is not a Devnet or mainnet transaction reference.

## V5 local execution preview

[Execution/state/math](v5-rising/EXECUTION.md), [tool recovery](v5-rising/RECOVERY.md),
[AMM readiness and read-only Devnet evidence](v5-rising/AMM-READINESS.md), and
[execution verification](v5-rising/execution-verification.json) supersede earlier
statements that no V5 on-chain code exists **for disposable local builds only**.
Production V5 remains disabled; economics, terminal migration and external LP
permanence remain unapproved/unverified. Legacy financial handlers are preserved.
