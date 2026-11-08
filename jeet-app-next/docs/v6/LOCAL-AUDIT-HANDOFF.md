# JeeT Launch local security review handoff

## Review scope

Review the exact release commit, pinned Rust and npm lockfiles, and locally built SBF digests. The previous public-cluster readiness review is in [Devnet acceptance](DEVNET-ACCEPTANCE.md). This handoff describes the existing local protocol and its latest data-read path. It is an internal review aid.

## Architecture and custody

```mermaid
flowchart LR
  Wallet["Wallet Standard signer"] --> Browser["JeeT browser"]
  Browser --> Proxy["Local RPC proxy"]
  Proxy --> Validator["Local validator"]
  Browser --> Metadata["Pinata or local metadata"]
```

```mermaid
flowchart LR
  Buyer["Buyer and seller"] --> Curve["Curve and custody PDAs"]
  Curve --> Fees["Platform and creator fee vaults"]
  Curve --> Migration["Graduation terms and migrator PDA"]
  Migration --> Pool["Raydium CPMM token and WSOL vaults"]
  Pool --> Burn["Initial LP burn"]
```

- The launch custody PDA binds the mint, creator and associated token vault. The curve PDA holds SOL redemption backing. Opening and wallet receipt PDAs enforce slot windows and cumulative buying restrictions. See [V5 ABI and integer math](../master/v5-rising/EXECUTION.md) and [custody layout](../launch-custody.md).
- Curve buys add the pre-fee curve cost to backing and separate platform/creator fees into their assigned vaults. Sells redeem against backing. Fee claims require the immutable beneficiary and advance the withdrawn counter. Review [fee ABI](../fee-engine.md) and [financial threat model](../master/authority-and-threat-model.md).
- Graduation requires the registered terms, expiry of opening restrictions, reconciled backing and inventory, and eligible curve state. Atomic execution initializes the pinned CPMM pool, deposits the reserved tokens and SOL, burns the initial LP allocation and closes migration accounts. Verified terms record the pool, slot, deposits and initial burn. Later LP issuance and external program authority are separate risks. See [Milestone D](MILESTONE-D-LOCAL-GRADUATION.md) for transaction evidence and reconciliation.
- The default program, local-fixture program, and Devnet build profile have distinct identities and gating. A production authority review should document signing custody, upgrade authority, operational recovery and incident response before any deployment. See [operations](../master/operations.md).

## Data and security boundaries

- Local discovery validates canonical custody, terms, mint, curve and metadata accounts at confirmed commitment. It is a bounded RPC snapshot with a short cache. No persistent or public-cluster index is configured. Trending represents cumulative curve turnover.
- Curve history reads program-attributed events and verifies arithmetic and mint identity. Raydium history recognizes top-level base-input swaps against the verified graduation pool with canonical account roles, two scoped SPL Token transfer-checked instructions, exact input and minimum output. Each swap is identified by signature and instruction index. Curves and AMMs have separate charts. Both history windows page by RPC signature cursor and reconcile against confirmed transaction slots. Unsupported Raydium routes, missing inner-instruction data and unconfirmed activity produce no trade record. This is not a durable event index, volume oracle or finalized ledger.
- The signing proxy is loopback-gated, checks genesis and restricts RPC calls. Wallet Standard keeps signing in the wallet. Audit pending transaction reconciliation, duplicate submit handling, account switches and origin/network binding. Local test endpoints and publicly reproducible fixture signers must stay isolated from shared deployments.
- Pinata credentials remain server-side. Images and metadata can come from an external service. Independently review upload limits, malicious metadata, gateway availability, XSS, untrusted links and dependency exposure.
- Review arithmetic boundaries and liabilities, CPI account aliases and substitutions, replay and duplicate migration, stale quote and graduation races, receipt and fee beneficiary substitution, and partial failure rollback. Include the exact external CPMM binary and upgrade authority in the review. A verified initial burn is evidence about the initial LP units only.

## Reproduce the checks

From `jeet-app-next`, restore the pinned tools with `bash scripts/recover-solana-tools.sh` and source `scripts/solana-tools-env.sh`. Build the standard and local fixture SBFs using the commands in [verification](../master/verification.md). Run expensive SBF builds sequentially because Cargo's Solana toolchain alias is shared. Recover the verified Metaplex clone with `npm run metadata:recover:local` and build pinned Raydium with `npm run amm:build:local`.

```sh
npm run build
npx tsc --noEmit
npm run lint
npm run test:local
npm run test:v5:local
npm run test:graduation:local
npm run test:amm:cpmm
node --test scripts/test-release-data.mjs scripts/test-wallet-infrastructure.mjs scripts/test-wallet-amm.mjs
node --test scripts/test-release-browser.mjs
JEET_BROWSER_LOCAL_METADATA=1 JEET_BROWSER_GRADUATION=1 JEET_RELEASE_BROWSER=1 npm run test:wallet:creation:browser
```

Use separate disposable validator ledgers and Wallet Standard harness identities. Preserve command exit codes, binary digests, signatures and accounting snapshots. Genuine installed Phantom and Solflare, shared Devnet, public indexing, and independent review remain release gates. See [release readiness](RELEASE-READINESS.md) for the preceding evidence and [Devnet acceptance](DEVNET-ACCEPTANCE.md) for installed-wallet procedures.
