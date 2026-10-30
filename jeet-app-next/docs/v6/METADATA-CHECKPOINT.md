# V6 local metadata and creation-input checkpoint

Starting main: `1fe4100f71f8c3cbcdbd650d2e86847c67d9dfa6`.
Financial ancestor: `62249746621788be79899e28647e1e34323f394e`.
Recovery branch: `recovery/v6-metadata-20261030`; WIP preservation commit:
`d788c4904fd181d0ace12caff566a1eeaefd480f`.

This milestone recovers the missing metadata experiment and verifies it afresh.
It is **not** completion of the V6 application or public activation of V5.
All changes are confined to `jeet-app-next`. The financial implementation,
legacy instructions, fee entitlements and graduation economics are unchanged.

## Implementation

Local-only opcode 23 creates real Metaplex MetadataV1 through its canonical
program. It binds the creator signer to existing custody and mint authority,
validates the metadata PDA and executable programs, rejects existing metadata,
and verifies the returned mint, authority, strings, royalty and mutability fields.
The maximum caller expenditure includes rent and the external protocol fee;
an exceeded budget rolls back the entire CPI. The default artifact rejects
the extension with 1514, as it does V5/graduation.

Accounts: creator (writable signer), mint, custody, canonical metadata PDA
(writable), System program, Rent sysvar, Metaplex executable. Data: opcode 23,
maximum expenditure u64 LE, mutable u8, then three u8-length UTF-8 strings:
name (32 bytes), ticker (10 bytes), URI (200 bytes). Stable metadata errors:
1620 encoding, 1621 identity, 1622 already exists, 1623 signer, 1624 fields,
1625 budget, 1626 arithmetic, 1627 returned metadata proof.

The SDK encodes these accounts and bounds, derives the PDA, and decodes metadata.
Loopback HTTP URIs are explicitly local-test support. Public storage/upload
integration is not implemented by this module.

Creation input validation checks actual PNG/JPEG/WebP signatures, a 2 MiB
maximum, real browser decoding and dimensions from 1 to 4096 pixels. SVG and
disguised files are rejected. Object URLs are released; stale asynchronous
decodes cannot replace a newer selection. Name limits use UTF-8 bytes.
The existing branding and review flow are preserved.

## External program and costs

`scripts/metadata/recover-program.mjs` performs read-only Devnet RPC requests.
It checks the Devnet genesis, upgradeable-loader accounts and pinned ELF hash.
See `metaplex-provenance.json` for program identity, observed slot and upgrade
authority. The clone is a genuine deployed executable, **not** a reproducible
source build or proof of source/bytecode equivalence. A changed hash requires
review. No Devnet transaction or deployment is performed by recovery.

Observed executable: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`.
Observed account size: 607 bytes; rent 5,115,600 lamports; protocol creation fee
10,000,000 lamports; total caller debit 15,115,600 lamports, excluding network
fees. Tests simulate at confirmed commitment and enforce the resulting budget;
they do not assume a fixed account size. JeeT's platform creation fee remains
zero. Production metadata funding/storage and external protocol costs must be
disclosed before any public flow is enabled.

An immutable metadata-data flag does not imply all authorities are revoked:
the update-authority public key remains in the record. Tests verify the flag
and actual rejection of a data update. No broader immutability claim is made.

## Executed focused verification

- Native Rust: 13 default, 17 local-feature tests.
- Fresh locked SBF builds: default and local-feature JeeT artifacts, plus
  pinned official Raydium CPMM v0. No saved build substituted for compilation.
- Deterministic JS/HTTP/economic/SDK tests: 61 passed, none skipped.
- Metadata local validator: 6 positive, 21 rejection checks; see the complete
  signatures, codes, artifact hashes and conservation in metadata-local-evidence.json.
- Integrated graduation regression: 28 positive, 51 rejection checks, genuine
  CPMM CPI and LP burn; migration 1,158 bytes, 302,620 measured compute units.
- Existing V5 local suite: 25 positive, 42 transaction rejection and 7 integrity
  rejection checks.
- Full legacy runner reached its final PASS marker: fee tests 46 positive/108
  rejection including integrity; V4 tests 125 positive/79 rejection including
  integrity; protected opening 14 positive/28 on-chain and 9 API rejections.
  Allocation, custody, cumulative caps and legacy pricing also passed. Race
  cleanup positive counts can vary; rejection assertions are unchanged.
- Production build, ESLint and TypeScript checks passed. See the compact fresh
  log excerpts in verification-results.txt; no saved historical run is counted.
- Revenue browser: 7 positive, 4 rejection checks against real local programs.
- Responsive Chromium acceptance: 10 existing route checks and 4 new creation
  input groups (390/1440px, decoder fallback, out-of-order decode protection).

Metadata rejects unauthorized/missing signers, substituted metadata/programs,
malformed fields, budget zero/one-lamport-under, duplicate creation and immutable
updates. Every program-rejected test snapshots protected SOL, tokens and state;
only separate sponsor network fees are excluded. Failed activation also rolls
back mint/freeze authority changes. Actual V5 buy/sell leaves metadata intact.

Exact token base units after metadata-equipped trading:

```
10,000,000,000 creator + 75,000,000,000 buyer
+ 519,000,000,000 sale custody + 396,000,000,000 migration custody
= 1,000,000,000,000 issued supply
```

Exact lamports, excluding sponsor fees and separately paid account rent:

```
4,950 raw purchases - 1,371 raw redemptions = 3,579 curve reserve
5,000 buyer expenditure = 1,357 net seller receipts + 3,579 reserve + 48 platform + 16 creator
```

## Reproduction

Use `scripts/recover-solana-tools.sh` and `source scripts/solana-tools-env.sh`
as documented by the existing financial checkpoint. Host Rust/Cargo 1.99.1,
Node 24.22.1, npm 11.9.0; JeeT builder/platform tools 2.3.13/1.48
(SBF Rust 1.84.1); CPMM builder 4.5.0/platform 1.57 (SBF Rust 1.95-dev).
Build the two SDK generations sequentially: they share a rustup alias.
The old validator executes v0 CPMM; the modern validator requires unavailable
io_uring support in this environment. No integrity checks were disabled.

```
npm run metadata:recover:local
npm run test:metadata:client
npm run test:metadata:local
npm run test:graduation:local
npm run test:v5:local
npm run test:local
npm run lint
npx tsc --noEmit
npm run build
JEET_CHROMIUM_PATH=/absolute/path/to/chromium npm run test:creation:browser
```

The metadata runner requires the freshly built default/local artifacts and
pinned metadata executable. It uses disposable accounts, loopback RPC and a
five-minute deadline; it writes a completed evidence marker only after success.

## Continuation: application work still required

Public V5 and metadata remain gated. `/create` does not yet execute a complete
wallet-signed V5 launch; the existing local test launcher is distinct from that
goal. The unused Devnet mint component is not a supported public launch path.
Wallet-signed V5 creation, durable image/JSON upload, verified launch indexing,
live token pages/charts, V5 trade panel and post-graduation AMM wallet routing
remain unfinished. Do not populate public Explore with the local test fixtures.

Next implement explicit local environment/genesis checks and a signing-only
wallet transaction executor, then a resumable creation flow with confirmation
and canonical-PDA verification at every stage. Reuse the verified activation
bundle for atomic mint/freeze revocation plus immutable graduation terms before
first trade. Follow with real bounded indexing and wallet trading/browser tests.

Devnet deployment/lifecycle is not verified. The public RPC faucet returned
HTTP 410 directing funding to faucet.solana.com; no funded disposable deployment
identity or approved test spending budget has been established here. Read-only
program recovery is not a Devnet lifecycle test. Mainnet remains prohibited.

The application is INCOMPLETE. Independent security review, external-program
upgrade/admin trust, source/bytecode equivalence, durable metadata hosting and
production setup funding remain deployment boundaries.
