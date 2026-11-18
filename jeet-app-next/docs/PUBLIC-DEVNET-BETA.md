# JeeT Launch public Devnet beta

## Release boundary

Target: existing DYJeet Vercel project `jeet-launch-community-preview` (`prj_Ofzewl9sXN4fBIPuixCEgVuYCocw`), production environment, root `jeet-app-next`, Node 24.x. It is separate from DidYouJeeT; no DNS or paid service changes. Rollback point: `dpl_Cm8WDG7Be9f3C6VqsrnAB5SXYc5C`.

This is the actual integrated application in a fail-closed read-only public beta. Wallet connection, live Devnet discovery, token details, public metadata/images, existing chart/history and fee balances are supported. Creation, wallet signing, uploads, buys/sells, claims and migration are disabled until separately authorized post-upgrade acceptance. Existing local test flows remain intact when the public-beta flag is off outside Vercel.

Vercel forces the public flag and Devnet network at build time; runtime Vercel always blocks transaction execution and write APIs. No signing keys, Pinata credentials or RPC API credentials are provisioned. Exact canonical and Vercel deployment hosts are allowed; foreign origins and arbitrary forwarded hosts remain rejected. RPC bodies, concurrency, upstream pacing, backoff and per-instance request windows are bounded. Per-instance limits are NOT distributed quotas or authentication; sustained traffic needs a globally enforced operational limit and reliable approved RPC before writes can be opened.

SQLite under `/tmp` is a regenerable per-instance read cache, not durable cross-instance history. Cold starts rebuild from available on-chain records; coverage gaps/staleness remain disclosed. Durable indexing and provider capacity remain prerequisites for an unrestricted service. No placeholder tokens or fabricated history are used.

## Verification

- Five new public-beta policy/origin/limiter tests passed.
- 29 affected wallet/RPC regressions passed.
- Eight affected Devnet configuration/index regressions passed.
- Ten final production HTTP checks passed, including 403 write denials, real JEETTEST discovery and the legacy-console fallback guard.
- Production build and lint passed.
- Fresh npm production and full dependency audits each reported zero vulnerabilities. This updates the earlier development-tool advisory snapshot; it is not an independent security audit.
- Preserved local graduation evidence: 28 positive / 52 rejection-and-rollback checks, plus the complete local browser migration/swap flow. No program source changed; no redundant SBF build or local economic regression rerun was required.
- Post-upgrade read-only check confirms exact approved executable, authority, treasury and account state. No Devnet transaction was submitted by this beta preparation.

## Visitor acceptance

1. Open the public HTTPS address; no GitHub/Codespaces session should be needed.
2. Confirm the Devnet beta/no-monetary-value banner.
3. Browse New, Trending, Final Stretch and Migrated; empty categories are valid, not synthetic launches.
4. Open JEETTEST, inspect mint/custody, metadata, chart, two real trades and creator-claim history.
5. Install/unlock Phantom on desktop, select Devnet, connect and compare the public address and balance; disconnect/reconnect.
6. On iPhone, use Phantom's in-app browser when available. Owner currently cannot install it, so iPhone installed-wallet acceptance remains blocked.
7. Confirm Create and all transaction actions explain why they are disabled. Do not send funds or use Mainnet.

Owner reported desktop Phantom connection PASS. Real signing/rejection/trading and iPhone acceptance remain unverified; simulated/local-wallet evidence is labelled separately.

## Separate post-upgrade transaction approvals

Stage A: reuse existing JEETTEST and existing creator/trader identities. Prepare one minimal buy, matching sell and disposable creator fee claim. No funding, new token, migration or platform claim. Exact current unsigned messages quote 5,000 lamports each (647/647/312 bytes); existing token/receipt accounts require zero additional rent. Buy debit 104,231 lamports; aggregate gross debits including all three network fees are 119,231 lamports. Request a conservative 200,000-lamport (0.000200 SOL) ceiling, charged against the remaining 19,049,698-lamport historical lifecycle allowance. The current buy passed read-only RPC simulation (signature verification disabled; nothing signed or broadcast). The zero-data rent floor is 650,240 lamports, and both existing wallets have sufficient balances without funding. Fresh state, simulation and balances must pass again immediately before any future signing. Sell and claim depend on prior committed state; this quote is not a claim of independent persisted simulations.

Stage B: creation/protected-opening/cap/graduation/migration/post-migration AMM acceptance requires a separately approved small disposable token. Proposed supply 1,000 whole tokens, 1% creator allocation, 1% cap and protected opening, using unchanged supported parameters and fee policy; draft metadata must be pinned and verified publicly before creation. Test expected cap/protection failures by simulation before the valid transitions; wait for restrictions to expire before curve completion. Do not bypass protections.

The existing billion-supply JEETTEST needs **50.192999999 SOL** total curve reserve to graduate; the live Raydium pool-creation fee alone is **0.150000000 SOL**, before account rent and network fees. This cannot fit the old 0.05-SOL lifecycle cap or current payer. For the proposed 1,000-supply token the unchanged curve requires about 0.000050192 SOL; the exact reserve, new-account rents, metadata CPI fee, full transaction-message fees and post-migration amounts must be finalized in a separate read-only harness before requesting the Stage B spending authorization. No exact all-in migration cost or approval is asserted here. No new funding is authorized.

Platform claiming requires the exact treasury owner signature; never substitute a signer or import its key. Current 1,342-lamport platform accrual is below a 5,000-lamport network fee, and the treasury is unfunded on Devnet. Owner participation and an explicit economic/funding decision are needed. Use the installed Phantom wallet controlling the recorded treasury, verify Devnet and the full beneficiary address, review an unsigned canonical claim message and its fee, then let the owner approve or reject on-device. Never ask for a seed phrase, import a treasury secret, silently change fee payer/beneficiary or sign on the owner’s behalf. The public beta does not expose this action.

## Rollback and Mainnet requirements

Retain immutable Git/source and binary checkpoints. A frontend incident: disable project traffic if necessary, preserve logs, and roll back only this Vercel project to its previous deployment; do not touch DidYouJeeT or DNS. An on-chain program rollback is a separate upgrade requiring separate authorization; frontend rollback cannot reverse financial state.

Before Mainnet: independently review program economics/permissions and external AMM upgrade controls, complete genuine post-upgrade lifecycle/migration and owner-wallet signing/rejection acceptance, globally enforce abuse limits, obtain reliable RPC and durable indexed history, test operational monitoring/recovery, and receive explicit Mainnet deployment/spending authorization. Fee policy on external AMM swaps is distinct from the 65/35 bonding-curve split; do not promise creator/platform curve fees on external swaps.

## Announcement draft

JeeT Launch is entering Solana Devnet beta 🐱 Explore real test launches, connect Phantom and inspect transparent on-chain activity. Devnet tokens and test SOL have no monetary value. Creation and trading remain gated while final post-upgrade acceptance is completed. No Mainnet launch or token sale is live.

## Publication approval boundary

Production publication was attempted through the Vercel connector and rejected by automatic approval review because it interpreted the owner directive as requiring a separate deployment authorization. No new deployment was created. Do not use another interface, preview target, alias or file-upload deployment to bypass that rejection. Existing production remains the older community preview, not this candidate.

Owner approval required: publish the exact final guarded source commit to `jeet-launch-community-preview`, team `DYJeet`, production environment and existing Vercel HTTPS aliases, Node 24.x and root `jeet-app-next`; retain the recorded rollback deployment. Only the five nonsecret Devnet/read-only/cache variables listed in the deployment record are configured. No API credential, wallet key, DNS edit, paid service, public transaction action, DidYouJeeT change or on-chain operation is included. External unauthenticated desktop/mobile browser acceptance must run after that authorized deployment is READY.
