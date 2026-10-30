# Milestone B continuation — not a verified main checkpoint

Starting local branch: recovery/v6-b-resume, 44009f6ec4142702532e7d4b73a56e1c181f7c4d.
That local commit has the exact same tree as remote recovery commit
84042a661583f25715a9e2bf970fd5aad9147c4d (tree 7a3614b2015bfef3e65b090bdbb39d0b2d5f0a70).
Main remains 33ff9ffb11167a3b5d185e148da2a7cdc2c43993. Intermediate preservation:
e3fff6c5a98cf2ceec0b532bc5be9313c6c6d98a, recovery/v6-b-resume.

## Actual work and evidence

- Added a read-only canonical token reader at /token/[mint], enabled only in
  explicit local-wallet mode. It derives the creator from custody, checks account
  identities/owners through the existing reader, and displays actual supply,
  partitions, authorities, opening rules, fees and graduation terms.
- Added creator-supplied metadata/image display. Local downloads are restricted
  to same-origin content-addressed assets, bounded and SHA-256 checked. Links
  require HTTPS without credentials. No arbitrary server-side metadata fetch.
- Public unknown token requests are rejected before streaming in src/proxy.ts;
  this preserves the previous HTTP 404 regression (streamed notFound alone
  returned 200). No test expectation was weakened.
- Existing graduation terms are correctly zero-pool before migration. Expanded
  mismatch errors identify public account fields for diagnosis. The genuine
  creation browser suite now successfully reaches final confirmation.
- Actual browser test uses a disposable Wallet Standard adapter and Node-side
  genuine Ed25519 signing, with real local-validator transactions. It is NOT
  installed Phantom/Solflare acceptance or native-mobile wallet verification.
- Both 390px and 1440px journeys rejected mint/supply signatures, resumed after
  reload without persisting a mint secret, completed all five signing stages,
  verified revoked authorities, loaded the token page, and reloaded it.
- Four positive grouped browser assertions and two grouped rejection assertions
  passed. Ten actual confirmed transactions are in creation-browser-evidence.json.
  Token conservation, each launch: 10 creator + 594 curve + 396 migration = 1000.
  SOL, each creator: 1,000,000,000 = 964,844,400 remaining + 35,125,600 new-account
  funding (including metadata protocol funding) + 30,000 network fees.
  No curve trades were made by this creation-only browser test.
- Fresh default/local SBF compilation completed. Existing old-builder undefined
  syscall warning remains; genuine validator execution proves these instructions
  run in this environment. Native tests: 13 default, 17 local-feature passed.
- Metadata local-validator suite: 6 positive, 21 rejection/rollback checks passed.
  Metadata suite SOL: 5000 payment = 1357 seller + 3579 reserve + 48 platform +
  16 creator, excluding separate rent/network funding. Supply 1e12 = 1e10 creator
  + 75e9 buyer + 519e9 curve + 396e9 migration base units.
- Existing V5 runner printed PASS: 25 positive, 42 on-chain rejection checks;
  inspect runner exit/cleanup before recording a complete final regression run.
- Frontend build, type check and lint passed before the storage-adapter extension.
  Rerun on final source. Public gating recheck passed all 5 tests.

## Storage dependency — milestone acceptance blocked

Default storage is real, retrievable content-addressed LOCAL WORKSPACE files.
It is explicitly not permanent. Losing this runtime can lose those files.
This is not sufficient for public metadata persistence.

A configurable server-only Pinata public-IPFS adapter is now wired into the
upload route. Set JEET_METADATA_STORAGE=pinata and server PINATA_JWT via the
runtime secret mechanism (never NEXT_PUBLIC, never Git). It uses the official
POST https://uploads.pinata.cloud/v3/files interface with network=public,
then retrieves each CID through https://gateway.pinata.cloud/ipfs/ and verifies
its exact bytes before returning success. Image and JSON are pinned separately;
metadata refers to the pinned image. Provider failure prevents mint creation.
A JSON pin failure may leave an orphaned image pin; no automatic unpin is
performed and no funds/keys are exposed. An interrupted upload may require
provider-side orphan cleanup. Account service terms, continued pinning and
availability remain external dependencies, not a guarantee of eternal storage.
Official interface reference: https://github.com/PinataCloud/pinata/blob/main/ai-instructions

Five adapter contract/failure unit tests passed using an injected fake transport.
Those tests are NOT real Pinata upload or persistence evidence. No provider
credential/account was available and no external upload was performed. Actual
provider retrieval, CORS and wallet creation using the resulting URI still need
verification. The bounded browser reader supports only the fixed Pinata gateway
or local asset route, rejects redirects and validates decoded images. Remote
UnixFS proofs are not independently checked; this trust boundary is disclosed.
No milestone B completion or main promotion is justified by these unit tests.

## Continue safely

1. Preserve/fetch the latest recovery branch; do not recreate saved code.
2. Finish final-source build/lint/types, creation browser rerun and regressions.
3. Official CPMM build and integrated graduation regression have now passed:
   28 positive / 51 rejection checks, migration 1158 bytes / 322132 compute units.
   Keep the evidence and rerun if relevant code changes.
4. Configure an approved Pinata account/server secret, verify genuine upload and
   retrieval, finish bounded remote reader, then repeat browser creation/reload.
5. Verify all acceptance criteria and inspect diff, secrets and baseline scope.
6. Only then promote a verified milestone to main. Do not begin Milestone C.

All modifications remain under jeet-app-next. No Rust financial source, baseline,
mainnet state, production funds, or authorities were changed.
