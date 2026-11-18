# Post-upgrade acceptance readiness — 2026-11-18

No signing, submission, funding, new token, migration, program upgrade or Production change occurred.

## Verified current state

Finalized slot 523739245: executable SHA-256 e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c; program Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D; authority DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW; treasury HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP. Existing mint, curve and fee accounts unchanged. Both old upload buffers closed. Fees remain 65/35 bps, total 100.

Existing JEETTEST mint 7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM.
Creator 13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf: 13,626,922 lamports. Trader 9m9k7oUP2EpVhgPXtrAsFTYE6WY6kaq8w67QvkWKjx9b: 837,776 lamports. Both existing Codespace keypairs independently derive these public identities, match their stored public halves, and have mode 0600. No secret bytes printed or transmitted. Codespace recovered via authenticated listing (its actual hostname omits the extra hyphen in the old prompt). Original main remains untouched. /workspaces has 815 MB available; /tmp 41 GB; no build/cleanup required. Native isolated workspace has 58 GB available.

## Exact requested operations — owner approval still required

1. Trader buys 2,400 JEETTEST: raw reserve input 103,199 lamports; platform 671; creator 361; total token purchase debit 104,231; network 5,000.
2. Trader sells the same 2,400: raw redemption 103,199; platform 671; creator 361; wallet credit 102,167; network 5,000.
3. Creator claims exactly 722 newly accrued creator-fee lamports; creator pays network fee 5,000. No platform claim.

Gross debits including network fees: 119,231 lamports = 0.000119231 SOL. Requested maximum 200,000 lamports = 0.000200 SOL. No new rent or funding. Trader remains above 650,240-lamport zero-data rent floor. Fee quotations use actual unsigned separate transaction messages: 647/647/312 bytes, one signature each, 5,000 lamports each, no priority fee. Requote and stop if message/state/balance/fees differ or cap cannot be satisfied.

Expected round-trip reserve 0 -> 103,199 -> 0, trader token balance 0 -> 2,400 -> 0; no new supply. Platform accrual increases 1,342 (existing 1,342 becomes 2,684). Creator accrual increases 722 (existing 722 becomes 1,444), with newly accrued 722 claimed (cumulative claimed 1,444). Creator vault returns to its existing rent-only balance. Trader final SOL 825,712 lamports; creator final SOL 13,622,644. Net wallet decrease 16,342 = network fees 15,000 + unclaimed platform fees 1,342. Creator-fee withdrawal is an internal transfer; do not double-count it. Historical external-spending allowance remaining 19,049,698; after planned net cost 19,033,356. Conservatively reserving all 119,231 gross debit leaves 18,930,467. Prior internal funding must not be counted again. No allowance used this session.

## Simulations and limitations

Fresh unsigned buy RPC simulation passed. A second unsigned atomic simulation combines buy/sell/claim solely to preserve predecessor state inside one simulation: 818 bytes, two required public signer identities, 122,046 compute units, err=null. No signatures supplied (sigVerify=false). This proves sequential instruction execution on current Devnet state, not real signing or settlement, and does not authorize replacing the three-transaction plan with an atomic transaction. Separate sell/claim simulations cannot persist the preceding buy. Execution must confirm each stage before constructing/simulating the next; stop on discrepancy, do not auto-retry a new signature after ambiguous submission.

The initial combined harness was rejected for duplicate compute-budget instructions, not an on-chain instruction failure. Removing the duplicate from the diagnostic-only combined message resolved it; original source and separately quoted messages unchanged. Initial fresh harness also required explicit Devnet environment selection; corrected runtime environment only. Failed diagnostic logs retained.

Fresh public route probes: local creation403; properly shaped sendTransaction/simulateTransaction envelopes403; environment200 Devnet. An intentionally incomplete send envelope is rejected503 by validation before forwarding; it is not evidence of an enabled write route. No valid signed transaction was generated for these probes.

## Public write security and operational gate — NO-GO

- Shared API rate limiting is NOT globally enforced: Map counters cap 60/client/minute and 240/process/minute, upstream queue 12 and 350ms spacing. They are per process/instance, not cross-instance protection. Do not describe them as distributed quotas.
- /tmp SQLite survives only within one serverless instance. Cold starts and independent instances have separate checkpoints. Retain stale/gap labels; never infer complete history from a snapshot.
- Durable index plan: deploy one authorized durable datastore and controlled ingest worker with unique network/program/stream/event keys and atomic event+cursor commits; resume finalized signature cursors, idempotently deduplicate, retain coverage intervals and unresolved gaps. Separate recent polling from bounded archive backfill; use an approved archival Devnet RPC for unavailable records, never clear a gap merely because a request returned an empty page. Expose indexed finalized slot, observed time, source and coverage to UI; monitor lag/gaps, restore/backfill and reconcile against receipts/account state. Test cold-start/restart, concurrent workers, duplicate/out-of-order events, missing/pruned transactions, RPC429/timeouts and recovery without losing events or overstating completeness.
- Abuse plan: use an authorized globally shared atomic limiter/store and trusted platform client identity; enforce per-client and global quotas plus upstream concurrency/budget, bounded body/query limits, TTL and Retry-After. Fail closed for write forwarding if quota storage is unavailable. Test cross-instance concurrency and provider failure. No existing globally shared datastore credential is configured; provisioning/selection is an owner infrastructure decision, no paid service introduced.
- Existing wallet executor reviewed: pinned Devnet/genesis/program, current-wallet checks before/after signing, simulation and fee/balance checks, exact signed-message equality, cryptographic signature verification, saved pending signature before broadcast, reconciliation on ambiguous send, duplicate submission lock, explicit rejection states. Preserve prior passing automated tests; real installed-Phantom signing/rejection remain unverified.
- Metadata and token image rendered in prior production browser acceptance, but automated public gateway Cloudflare403/error1010 remains unresolved for some clients. Require consistent publicly accessible metadata before opening uploads/creation; do not bypass provider controls or expose credentials.
- Dependency audits last passed with zero production/full findings at unchanged candidate; no dependency/source changes and no redundant build/audit claimed this session. Not an independent program audit.
- Separate public write release requires genuine authorized post-upgrade three-transaction acceptance, owner Phantom sign/reject/reconnect acceptance, approved RPC capacity, durable indexing/shared quotas and monitoring, validated metadata/creation input/upload limits, origin/method controls, and explicit Production publication approval. New-token/protected-opening/graduation/migration/post-migration acceptance remains a separate test authorization and budget; JEETTEST needs 50.192999999 SOL reserve and live AMM creation fee alone 0.15 SOL, outside this plan. No public migration enabled.

## Preservation and rollback

Live immutable source 5f7a07900f7c9a516fbfe0616452f5c6c0617bfe; deployment dpl_CShXrKvWLxMBUdziNnU7gjtPuzhT; preserved rollback dpl_Cm8WDG7Be9f3C6VqsrnAB5SXYc5C. Publication receipt f7d5800. This evidence-only checkpoint does not authorize deployment or relax any gate. No source/binary rebuild, account-layout or authority change. Owner next action: authorize only the three listed operations, total gross debit <=0.000200 SOL from existing signers and remaining lifecycle allowance, with fresh preflight immediately before signing. No funding, new token, platform claim, migration, upgrade, Mainnet or Production change.
