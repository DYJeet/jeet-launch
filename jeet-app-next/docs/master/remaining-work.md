# Master completion: continuation and blockers

Base: e8bce11ad81f287bef5f3949b73df6c03f771040. Only jeet-app-next is authorized.
This is a work inventory, not a completion certificate.

## Financial phase verified

New versioned V4 buys/redemptions, funded inverse pricing, gross caps, monotonic
sequence, improved fixed-rate rounding carry, completion and compatible claims.
See financial-v4.md, financial-checkpoint.md and financial-verification.json for executed evidence.
V1/V2/V3 behavior and all previous tests are retained.

## Decisions that must not be guessed

- Migration token allocation: selling the entire existing inventory leaves no
  tokens in custody for a nonzero external pool deposit.
- LP ownership, lock duration, burn policy, creator/platform LP entitlement are
  unapproved. No admin withdrawal or fabricated lock is a substitute.
- Redemptions remain funded. A future migration must explicitly resolve their
  obligations, exclude all fee liabilities and rent, and verify the actual pool.
- External venue pool-creation charges and rent need an explicit funding source;
  they are not an approved additional JeeT migration fee.

Raydium's maintained cp-swap source is the candidate venue for further review:
https://github.com/raydium-io/raydium-cp-swap . No CPI integration or pool is
claimed at this checkpoint. Select and pin exact source/IDL/program IDs before
implementation; never trust arbitrary caller-supplied pool/program accounts.

## Observed infrastructure / authority constraints

- The approved default program ID is 7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31.
  Read-only Devnet RPC inspection found no program account there.
- The generated ignored build key has a different public key; possession of a
  matching default program deployment key has not been established. Do not
  deploy to or claim authority over the default ID by assumption.
- Devnet RPC health is reachable. A separately configured, explicitly isolated
  candidate program ID/deployer may be needed for real Devnet testing. No
  deployment or test funding has occurred during this phase.
- Activating GitHub Actions requires a root .github/workflows file, outside the
  allowed directory. Deliver an in-scope runnable verifier/template; do not write
  outside jeet-app-next without authorization.

## Independent work remaining

1. Complete V4 wallet buy/sell UX and fee/opening/cap/reserve disclosures.
2. Real configurable token creation, image/metadata storage/URI validation,
   Metaplex metadata and authority/mutability verification; ticker policy.
3. Real bounded discovery/indexing, token pages and public integrity reports;
   remove live-looking mock launch fixtures and dead controls.
4. Environment/program-ID separation, bounded RPC retries/backoff, WebSocket and
   confirmation recovery, duplicate submission / interrupted signing handling.
5. Revenue pagination and production usability while preserving existing claims.
6. Migration implementation only after the economic/authority decisions above.
7. Full frontend responsiveness/accessibility checks and all regressions.
8. Real Devnet lifecycle under controlled test identities where tooling permits.
9. Authority matrix, threat model, operational/recovery runbooks, dependency
   remediation findings, deployment preparation and external audit package.
10. Final full verification, scoped diff review, verified checkpoints and exact
    readiness classification. No mainnet deployment or production funds.

## Dependency findings observed so far

npm audit reports zero vulnerabilities for the current locked graph. Cargo audit
reports zero vulnerability-class entries, with three informational warnings:

- RUSTSEC-2025-0141: bincode 1.3.3 unmaintained.
- RUSTSEC-2025-0161: libsecp256k1 0.6.0 unmaintained.
- RUSTSEC-2026-0097: rand 0.7.3 unsound under its documented custom-logger/RNG
  reentrancy conditions. https://rustsec.org/advisories/RUSTSEC-2026-0097.html

These are not recorded as resolved. The JeeT program defines no custom logger
or direct rand RNG calls; transitive reachability and a compatible remediation
must still be reviewed. No breaking Solana/Rust dependency upgrades were applied.
The subsequent frontend/RPC checkpoint resolves the five existing ESLint errors
and image warnings without rule suppressions. Full-project lint and 11 focused
RPC validation/retry/cancellation tests pass. Configurable providers, unified
network handling and full wallet/Devnet verification remain unfinished.
Internal testing is not an independent security audit.
