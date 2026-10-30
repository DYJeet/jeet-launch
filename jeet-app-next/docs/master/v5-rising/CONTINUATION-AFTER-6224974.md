# Continuation after verified V5 graduation checkpoint

## Durable starting point

Financial implementation checkpoint: **62249746621788be79899e28647e1e34323f394e**.
Its parent is07598ee2933781550f6de86807c9693c5bb2efad.
It is pushed to main, and the local working tree was clean immediately after
that checkpoint. Every committed change is under jeet-app-next; frozen baselines
were untouched. Do not reconstruct or repeat that completed financial work.

See GRADUATION-EXECUTION.md, graduation-verification.json and
graduation-local-evidence.json for source, commands, actual signatures and proof.

Verified checkpoint results:

- Graduation:28 positive,51 genuine rejection cases, including concurrent
  graduation, same-transaction duplicate rollback, atomic authority/terms
  activation, account substitution, ordinary/protected opening expiry,
  failed CPI recovery, post-migration claims and actual AMM swaps.
- Migration transaction:1,158 bytes,284,660 measured CUs in the recorded final run.
- Native Rust:13 default /15 local tests. Fresh locked SBF builds passed.
- Full legacy runner reached its final PASS marker. Fees46 positive/108 rejection
  including integrity; V4 full-run124 positive/79 rejection including integrity.
  Focused V4 rerun125/79; positive cleanup log counts vary with race winners.
- Existing V5:25 positive,42 transaction rejection plus7 integrity cases.
- JS/HTTP57, Chromium UX10, browser revenue7 positive/4 rejected, all passed.
- Standalone real CPMM4 positive/5 rejection, including LP withdrawal/remint.
- npm audit reported zero advisories. Clippy completed with pre-existing style
  warnings; a fresh RustSec scan remains unfinished.
- SOL:53,567 =2,813 +50,192 +422 +140lamports, excluding network fees.
- After AMM swaps:10 +591 +399 =1,000 tokens;10,157 +50,035 =60,192 wrapped
  lamports. Initial LP mint supply remains0. Setup is separately funded.

Default production artifact still rejects V5/graduation with1514. Public V5,
mainnet deployment and real-fund use are not activated. Raydium upgrade/admin
governance and public bytecode equivalence remain audit/deployment boundaries.

## Infrastructure interruption

The execution environment subsequently disconnected. Its exec server could not
resume after a25-second recovery timeout, and the environment was reported
unavailable. This prevents further file inspection, builds, tests and local
checkpointing. This is distinct from an owner-approval requirement.

An older clean checkout had also been restored at the beginning of this
continuation. It was safely fast-forwarded from d53eb51 to07598ee. Missing
uncommitted graduation source was reconstructed and freshly reverified before
the durable6224974 checkpoint above. Do not count missing old logs as new proof.

## Follow-on metadata work: local, not checkpointed as verified

After6224974, new local-only metadata code was written, compiled and subjected
to focused genuine-program testing. **It has not passed full regressions and
was not committed/pushed as a completed feature.** Inspect and preserve any
remaining local copies before editing:

- programs/launch-custody/src/metadata.rs
- programs/launch-custody/src/lib.rs: local-only opcode23 dispatch preparation
- src/lib/launch-metadata.ts
- scripts/metadata/run-local.mjs and test-local.mjs
- ignored target/master-verification/metadata-*.log and metadata-local-evidence.json
- ignored target/metadata-research/mpl_token_metadata.so

If these files disappeared with the environment, they are NOT part of remote
6224974. Recover only the missing metadata work; leave the financial checkpoint
and historical launch obligations unchanged.

The experiment adds a creator-signed, custody/mint-bound Metaplex CPI with
checked maximum caller expenditure and on-chain metadata-field verification.
Opcode23 uses: creator, mint, custody, canonical metadata PDA, System, Rent,
Metaplex executable. Data is opcode23, maximum lamports:u64, mutable:u8, then
three u8-length UTF-8 name/symbol/URI strings. Limits32/10/200bytes; no royalties,
creators, collection or uses in DataV2. Root errors1620–1627 distinguish encoding,
identity, existing metadata, signer, invalid fields, budget, arithmetic and proof.
This is development preparation, not an approved public fee activation.

Metaplex canonical program:metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s.
Its executable was cloned read-only from the public Devnet upgradeable
program-data account PwDiXFxQsGra4sFFTT8r1QWRMd4vfumiWC1jfWNfdYT.
ELF SHA256:bb0842f6d5740eabe8f9fb3b723b9ecd89cadf9f48ef9ad6a9dc6cfa8a9658e4.
This is a genuine deployment clone, NOT a fresh reproducible Metaplex source
build or proof of source/bytecode equivalence. Official interface reviewed at
metaplex-foundation/mpl-token-metadata commit024a6f45a443389815cbfa8855fc1796bc89e4b3.

Focused results actually observed before interruption:

- Local native Rust17 tests passed; local SBF compiled fresh.
- Metadata lifecycle4 positive /11 actual on-chain rejection cases passed.
- Actual on-chain metadata, a genuinely served local JSON/image, immutable-data
  flag and attempted immutable update rejection59 were verified.
- Wrong signer/accounts/program, malformed text/flags, duplicate creation,
  zero budget and one lamport below quoted total all rejected with exact rollback.
- Metadata creation cost was quoted through actual unsigned RPC simulation at
  confirmed commitment, then exact-budget execution matched.
- Observed metadata size607bytes, rent5,115,600lamports and Metaplex protocol
  fee10,000,000lamports: total15,115,600. The initial679-byte rent assumption was
  wrong for this deployed binary; never hardcode that size as authoritative.
- V5 metadata-equipped buy and sell executed. Raw token units reconcile:
  10,000,000,000 creator +75,000,000,000 buyer +519,000,000,000 sale custody
  +396,000,000,000 migration =1,000,000,000,000 supply.
  Raw curve inflow4,950 -outflow1,371 =reserve3,579lamports; platform48,
  creator16 fee lamports remain separate. Metadata did not change during trades.

Metaplex's0.01SOL protocol fee is separate from JeeT's zero platform creation
fee and from rent/network fees. Keep this feature local-only; do not silently
introduce a mandatory public creation charge. Production metadata/storage and
funding/disclosure choices remain to be resolved transparently.

The last attempted command, which would have added image-content validation and
started further builds, **failed to create an execution process**. Do not assume
those image/UI changes were applied.

Next: recover the workspace, inspect this uncommitted metadata delta, add
reproducible program-clone recovery and validation tests, build both artifacts,
rerun all relevant legacy/V5/graduation regressions and browser checks, inspect
the complete diff, then commit only verified work. Default metadata gating,
public wallet/UI integration and durable image/JSON storage remain unfinished.

## Devnet and remaining platform work

Read-only Devnet observation at slot516641035 confirmed the official CPMM
program/config and metadata program. CPMM config trade rate2500/million and
pool setup150,000,000lamports match the disclosed local fixtures.

A disposable test payer was generated only under ignored target/devnet-test.
Its private key must never be staged or published. CLI transport failed, and
the direct official RPC requestAirdrop returned HTTP410:
"The RPC faucet is closed on this cluster. Request test SOL at https://faucet.solana.com".
No Devnet program deployment or lifecycle was executed; no production funds used.
Do not deploy the publicly known local-fee-test treasury artifact to Devnet.

Continue safe frontend/wallet, metadata/storage, real Explore/integrity indexing,
RPC reliability and audit work. Public Devnet candidate identities/funding,
production setup funding, authority governance and independent security review
remain unresolved. No mainnet action is authorized.

Overall platform classification: **INCOMPLETE**. The integrated local V5
graduation checkpoint itself is verified and safely pushed.
