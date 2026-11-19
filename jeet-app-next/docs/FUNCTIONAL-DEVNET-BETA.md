# Functional Devnet beta candidate

This candidate extends acceptance checkpoint `38993787d39edb2e8fed54a271f4d59a112e1a0d`. It does not deploy anything, provision an external service, expose credentials, or authorize additional Solana transactions. All source changes are confined to `jeet-app-next`. The 65/35 program and its layouts/instructions are unchanged.

## Implemented architecture

The existing SQLite index now has an authenticated shared-service adapter. All Vercel instances use **one shared service backed by a persistent host volume**, rather than separate `/tmp` databases. It reuses Node 24 built-ins and existing index SQL; no new dependency or provider account is required for the code. It is a conventional HTTPS service, **not a Vercel Function** and not a claim that Vercel `/tmp` became durable.

`src/lib/shared-backend.ts` exposes only bounded, allowlisted index operations. It rejects wrong credentials, arbitrary SQL/operations, oversized bodies, malformed records and namespaces other than the pinned JeeT Devnet genesis/program. It contains no wallet signing or Solana submission capability. Backend credentials stay server-side and are never sent to clients, gateways, or Solana RPC.

Atomic SQLite transactions commit events, volume and checkpoints together. Deterministic event IDs deduplicate retries; contradictory replays abort without advancing the cursor. Compare-and-swap checkpoints protect concurrent workers. History responses include events, volume and checkpoint from one consistent database snapshot. Cursor pagination, ranking invalidation and observed-slot ordering are retained. Historical coverage gaps remain sticky until an independently verified recovery procedure proves completeness.

Quota counters and a clock high-water mark persist in the same shared database. `BEGIN IMMEDIATE` makes admission atomic across processes and all frontend instances. Clock rollback and backend restart cannot reset quotas. Rotating client identities cannot bypass the global ceiling. Raw IPs are HMAC-hashed with the private backend token before storage. The hosting edge **must overwrite** incoming `x-real-ip`; do not trust an arbitrary self-hosted forwarding header.

Default limits:

| Scope | Client limit | Global limit | Window |
|---|---:|---:|---|
| Reads | 60 | 240 | Fixed minute |
| Simulations/submissions | 12 | 60 | Fixed minute |
| Metadata uploads | 2 | 10 | Fixed hour |
| Metadata uploads | — | 20 | Fixed day |

Configure these on the backend using `JEET_QUOTA_READ_CLIENT`, `JEET_QUOTA_READ_GLOBAL`, `JEET_QUOTA_WRITE_CLIENT`, `JEET_QUOTA_WRITE_GLOBAL`, `JEET_QUOTA_UPLOAD_CLIENT`, `JEET_QUOTA_UPLOAD_GLOBAL`, and `JEET_QUOTA_UPLOAD_DAILY`. These are request budgets, not a paid-provider billing guarantee. Review the actual pinning account's hard limits before opening uploads. Upload failures consume their admission budget; uncertain provider writes are not blindly repeated.

Configured shared-backend failure denies admission; public writes never fall back to per-instance counters. Private local-validator/Codespace test throughput remains unchanged when no shared service is configured. On a hosted functional release, a missing shared index causes failure rather than silently reverting to `/tmp`.

## History, RPC and metadata

Transiently missing transactions, missing AMM inner instructions and truncated logs retain the page cursor instead of silently dropping events. `JEET_DEVNET_ARCHIVE_RPC`, when explicitly configured, is HTTPS-only and genesis-verified. Its signature pagination recovers older ranges; transaction bodies can fall back from primary to archive. No fallback is used for signed submissions. Primary RPC pacing, bounded 429 retries, provider cooldown and no-resend handling for ambiguous sends remain intact.

Discovery uses Next's `after()` lifetime support to finish bounded background batches after returning a saved snapshot. Shared persistent checkpoints make process termination retryable. The service is request-driven; it is not a continuously running external indexing worker. Prime the candidate through bounded `/api/launches?retry=1` and history reads before opening writes, then monitor freshness/backfill/coverage. Do not report historical completeness merely because a page is empty. Token-specific pruning checks compare the provider's earliest block with the token's actual creation slot; unrelated older ledger pruning no longer automatically implies that token history is missing. Program-wide coverage remains conservative when its complete birth range is unproven.

Metadata reads remain restricted to existing allowed content-addressed URLs. Hash/schema/image validation runs before a small bounded five-minute cache is populated. Failures are not cached, 403 errors are explained, redirects and oversized streams remain rejected. There is no fingerprint, network, Cloudflare or credential bypass. Existing provider verification still blocks a creation upload if pinned bytes cannot be independently fetched and matched. Browser rendering previously passed, but automated gateway 403/1010 access and public creation pinning must be verified from the authorized candidate host before release.

## Exact infrastructure approval needed

The inspected Vercel account has **no installed storage integration**, and this project has no database/shared-service/archive/pinning credential configured. No new account, plan, service connection or credential was created during implementation.

Preferred deployment for this implementation: one existing owner-authorized Node 24 HTTPS host with a **persistent mounted local volume**. Reusing the current SQLite engine avoids adding a database SDK or migrating indexed event formats. A Codespace port or serverless temporary disk is not an acceptable stable public backend. Software/dependency cost is **$0**; hosting cost is **not established** because no host or plan has been approved. Do not assume a free host has durable storage. If no existing suitable host is available, the owner must approve a specific external host/plan and its cost before provisioning; no paid plan is authorized.

After the owner names/approves that host:

1. Deploy `scripts/shared-index-server.mjs`, `src/lib/shared-backend.ts`, `src/lib/shared-backend-client.ts`, and `src/lib/market-store.ts` on Node 24 with their relative paths preserved. Their runtime dependencies are Node built-ins; no `npm install` is needed for this service alone.
2. Mount and verify a persistent volume, e.g. `/data/jeet`; set `JEET_SHARED_DB=/data/jeet/market.sqlite`. Do not use `/tmp`, a container's disposable layer, or a database file shared between separate hosts over a network filesystem.
3. Securely create one dedicated random backend token of at least 32 characters in the host's secret manager. It is an application service credential, **never a wallet key**. Set `JEET_SHARED_BACKEND_TOKEN` without printing/logging it.
4. Start `NODE_ENV=production node scripts/shared-index-server.mjs`, with `PORT=3040` by default. Keep the default loopback listener behind the approved HTTPS reverse proxy; set `JEET_BACKEND_LISTEN_HOST` only as required by that host's private routing. The proxy must limit bodies/connection rates and retain certificate verification. No DNS change is included.
5. After separate connection approval, assign `JEET_SHARED_BACKEND_URL=https://<approved-origin>` and the same encrypted `JEET_SHARED_BACKEND_TOKEN` to the candidate Vercel environment. Never use `NEXT_PUBLIC_` for either value. Remove `JEET_MARKET_DB` from the functional candidate environment to avoid confusion; code rejects ephemeral fallback in public-write mode.
6. Provide the existing authorized primary Devnet RPC in `JEET_DEVNET_WALLET_RPC` and, if needed, an approved archival endpoint in `JEET_DEVNET_ARCHIVE_RPC`. Validate the pinned genesis. Do not create paid RPC infrastructure or expose credential-bearing URLs.
7. Separately approve secure reuse of the existing Pinata credential: `JEET_METADATA_STORAGE=pinata`, encrypted `PINATA_JWT`. Verify provider hard upload/storage limits and HTTPS retrieval from the candidate host before opening creation.
8. Prove persistence by restarting the service and candidate frontend separately and checking the same real token's checkpoint/receipts; exercise backend outage, CAS, quota exhaustion and recovery. Back up with `node scripts/backup-shared-index.mjs <live-db> <new-backup-path>`; never copy only a live WAL-mode database file. Restore a backup onto a new volume/service and compare checkpoints/events before switching traffic. No deletion of original data is authorized.

Capacity monitoring, volume backups and backend uptime remain operator responsibilities. This is a single-primary backend with safe failure, not a claim of multi-region HA. If the backend is unavailable, hosted public writes stop.

## Controlled public-write switches

The Vercel build remains Devnet-only and defaults read-only. A functional build requires **all** of the following, and actual runtime backend admission must also succeed:

- `NEXT_PUBLIC_JEET_PUBLIC_BETA=0`
- `NEXT_PUBLIC_JEET_WALLET_NETWORK=devnet`
- `JEET_DEVNET_PUBLIC_WRITES=1`
- `JEET_DEVNET_WALLET=1`
- Valid private HTTPS shared-backend configuration and Pinata configuration above
- `JEET_PHANTOM_ACCEPTANCE_SHA=<SHA-256 of the reviewed genuine installed-Phantom acceptance report>`

The report hash is an operator attestation gate, **not automated proof that Phantom was tested**. Fixture hashes in automated tests are never genuine owner evidence. Do not set these release gates now. The current Production flags and secrets were not changed. Runtime `JEET_DEVNET_PUBLIC_WRITES=0` stops forwarding even if the client bundle was built for writes; a new read-only build hides the forms as well. The local server-signed creation endpoint and local diagnostic/assets endpoints remain disabled on Vercel. Hosted revenue never falls back to legacy direct-signing tools. Public-network migration remains separately disabled regardless of these switches.

## Chromebook Phantom acceptance — owner action required

Owner-confirmed installed Chrome-extension connection and desktop rejection handling are **PASS**. Owner signing, confirmation and owner-wallet trading remain **UNVERIFIED**. The dated owner evidence and proposed buy are in [Devnet Phantom acceptance](DEVNET-PHANTOM-UAT.md). No iPhone Phantom installation is required to complete desktop acceptance. Existing desktop/mobile layout and local simulated-wallet evidence are retained; they are not substituted for an installed-wallet test.

Use a private owner-only Codespace candidate preview for acceptance, with the same candidate code and explicit Devnet origin/network configuration. Keep its forwarded port private. This controlled non-Vercel environment can exercise the existing wallet flow before a public Vercel write build; it is not a public-write deployment. Its exact HTTPS URL must be verified after the preview is started; none is invented here.

Minimum owner steps:

1. Open that verified private HTTPS preview on the Chromebook, unlock the installed Phantom extension, select Devnet and connect. Verify the complete public address, disconnect/reconnect, and switch accounts to ensure balances/controls follow the selected account.
2. Provide **only the public Devnet address** for a fresh read-only balance/account-rent/fee quote. Never provide seed phrases or private keys, and never import the disposable Codespace keys into Phantom.
3. Desktop rejection completed on November 19, 2026. The installed Phantom prompt was rejected and JeeT Launch displayed **User rejected request**.
4. Obtain separate explicit approval for one buy from this owner wallet and its actual gross-debit cap. The owner then approves on-device and confirms the receipt and balances. A sell needs its own approval. The old three disposable-wallet transactions are completed and cannot be reused as spending authorization. A fresh owner wallet may need ATA and buyer-receipt rent, so do not reuse the 0.000200-SOL quote without inspecting its accounts. No new funding or treasury signing is included.
5. Save the owner acceptance report/receipts and hash it only after real approval/rejection are observed. Do not claim real-wallet acceptance from mock RPC tests.

## Functional evidence and remaining gates

Genuine Devnet evidence: original JEETTEST creation/allocation/custody/protected opening/cap enforcement, curve buy/sell, 65/35 accounting and creator claim; plus the separately finalized post-upgrade buy/sell/creator claim at `38993787`. A current read-only check reconfirms the same executable/authority and those settled receipts; no acceptance transactions were repeated.

Local evidence: prior graduation/AMM replay, reserve/LP/authority and rollback regressions remain valid because no program source/artifact changed. The new shared-index and quota tests use real local SQLite and HTTP processes, including crash/restart and backup restore. The two-Next-process HTTP test uses a locally trusted test TLS certificate and never disables TLS verification or calls Solana. The actual write-route gate test mocks all RPC/backend I/O; it verifies enabling/disabling and outage behavior, not genuine signing or chain settlement.

A fresh 68-launch local-validator discovery run was **BLOCKED** because the isolated native environment lacks the preserved validator executable/artifacts (`programs/launch-custody/target/toolchain/validator` ENOENT). Its original failed startup log is retained; this is not marked passed. The harness now detects missing tooling before starting services/waiting on health. No redundant toolchain download, program rebuild or additional Devnet test token was used.

Post-upgrade new-token creation, graduation/public migration/post-migration swaps and platform claim signing have not been authorized or executed. Existing JEETTEST graduation requires about 50.192999999 SOL reserve and the previously verified AMM creation fee alone was 0.15 SOL; those operations are outside the existing lifecycle allowance. This candidate does not unlock public migration. Platform claims require the exact treasury owner, never substituted/imported keys. Curve 65/35 fees must not be promised on unrelated external AMM swaps.

## Release / rollback

Current live read-only production: `dpl_CShXrKvWLxMBUdziNnU7gjtPuzhT`, source `5f7a07900f7c9a516fbfe0616452f5c6c0617bfe`, public URL `https://jeet-launch-community-preview.vercel.app/`. Use this immutable deployment as the rollback target for the next functional beta. Older rollback `dpl_Cm8WDG7Be9f3C6VqsrnAB5SXYc5C` is preserved as well. No DidYouJeeT project, DNS or Solana deployment changed.

**NO-GO for public writes** until the approved persistent host/credentials are connected and verified, metadata retrieval/pinning works from that host, genuine Chromebook signing/rejection passes, the native-validator discovery check is restored/completed where required, and the owner separately authorizes the exact Vercel release commit/environment. Source/code-level readiness is not hosted infrastructure acceptance. Mainnet remains prohibited and still requires independent security review and separate explicit authorization.

### Repairing an already-pruned index without erasing evidence

Do not clear a `gap` flag simply because an archival URL was added. A recent-head poll cannot prove an older missing range was recovered. Back up the existing service first, retain the original database and WAL, and use a **new database file on the persistent volume** for an isolated rebuild through the verified archive. Populate it using the private candidate's bounded discovery/history reads. Compare the known mint's unique trade IDs, cumulative raw buy/sell amounts, sequence counts, creator/platform withdrawal totals and current finalized reserve/supply/fee accounts. Check page boundaries and retained history coverage. If the archival provider still lacks data or canonical totals disagree, retain incomplete status and stop the switchover. Only after that proof and the required deployment/environment approval should routing move to the rebuilt service. The old database and immutable receipts remain rollback evidence; no destructive SQL, file deletion or on-chain operation is part of this procedure.

### Concrete optional host proposal — not purchased or provisioned

If the owner has no suitable existing host, a compatible proposal is one **Render Node web service**, named `jeet-launch-shared-devnet`, using the legacy Starter/current `0.5c-512mb` compute tier and a 1-GB persistent disk. The official base pricing checked for this proposal is $7/month compute plus $0.25/month disk: **$7.25/month base**, before tax, transfer overages or other extras. This is a cost estimate, not authorization or a guaranteed all-in spending cap. No extra resource, scaling or overage is approved; verify account hard limits and the actual quote before provisioning. Render's free web service cannot provide the required persistent disk. An existing approved host avoids this new hosting purchase.

Reviewable configuration after explicit owner approval:

- Connect **only** `DYJeet/jeet-launch`, branch `repair/functional-devnet-beta`, to the new backend service. Root directory `jeet-app-next`. Do not alter either existing Vercel project.
- Set Node runtime `NODE_VERSION=24.22.3` (the locally tested version). Build command `node --version`; start command `node scripts/shared-index-server.mjs`. No dependency install is needed for the backend's built-in-only runtime imports.
- Mount the 1-GB disk at `/data/jeet`. Set `JEET_SHARED_DB=/data/jeet/market.sqlite`, `JEET_BACKEND_LISTEN_HOST=0.0.0.0`, `NODE_ENV=production`; let the host supply `PORT`. Store the dedicated random token as an encrypted service secret.
- Disable automatic deployment after the initial approved revision. Retain the provider-assigned HTTPS hostname; no DNS work is included. Connect that origin/token to the private candidate only after separate service-connection approval.
- Keep one backend instance. Render disk-backed deploys briefly stop the old instance; public writes must fail closed during that interval. Do not claim zero-downtime or cross-host shared SQLite. Test backup/restore and startup volume persistence before enabling writes.

Primary references: https://render.com/pricing , https://render.com/docs/disks , https://render.com/docs/free , https://render.com/docs/node-version . No Render account connection, subscription or service creation has been performed.

## Hosting unblock continuation

The optional Cloudflare Workers Free SQLite Durable Object adapter is prepared in `workers/shared-devnet/`; its README contains the exact approval, configuration, free quotas, security, recovery and fallback plan. It reuses the validated protocol and SQL engine. This replaces the earlier assumption that a new paid Node host is the only practical option; the original Node/Render procedure remains valid. No provider resource or Vercel environment has been changed. Hosted acceptance remains pending. See `artifacts/hosting-unblock/` for current validation evidence.

The previously blocked 68-launch discovery regression is now **PASS** using the preserved Agave 4.3.2 validator in isolated Codespace `/tmp` storage: partial=7, resumed=7, discovered=68, gap=false, one injected HTTP 429 recovered, pagination/search/ranked-view assertions passed. Agave 2.3.13 failed to load the preserved local program; its failed log is retained separately. No program rebuild or public-network operation was used. This local discovery run used existing Next 16.4.3 dependencies; the final changed backend/frontend candidate separately builds and typechecks on the locked Next 16.4.6 dependencies. This closes the missing-validator gate, not genuine Phantom or hosted-provider acceptance.
