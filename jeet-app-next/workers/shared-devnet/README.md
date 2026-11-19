# Optional $0 Devnet shared backend — prepared, not deployed

This adapter hosts the existing authenticated index/quota protocol on **Cloudflare Workers Free with one SQLite-backed Durable Object**. No Cloudflare account, Worker, namespace, secret, paid plan or Vercel connection was created during preparation. Local Miniflare/workerd validation is not a hosted availability test.

The existing Node 24 + persistent-volume server remains supported without configuration changes. Both hosts reuse the same SQL tables, event identifiers, validation, cursors, fee-neutral discovery data and quota logic. No Solana instructions, accounts, program artifacts, fee constants or frontend gates change. Optional test-tool transitive dependencies are pinned to patched `sharp@0.35.5` and `undici@7.30.1`; the resulting tool lockfile audit has zero findings. These dependencies are not bundled into the Worker or the frontend.

## Why this candidate

Vercel inventory showed two frontend projects and no installed storage integration; the launchpad has no configured durable/shared backend. Vercel `/tmp` and free ephemeral Render storage do not meet persistence requirements. Workers Free supports durable SQLite and serialized synchronous transactions without a monthly plan charge, subject to quotas. This is the preferred **small-beta** proposal, not an unlimited or high-availability guarantee. Render's compatible alternative starts at $7 compute + $0.25 for a 1-GB persistent disk per month, before tax/overages.

Published free quotas: 100,000 DO requests/day, 13,000 GB-s/day, 5 million SQL rows read/day, 100,000 rows written/day, 5 GB total SQL storage. Worker request/CPU limits also apply. Quotas are shared with other resources on the account. Index maintenance and quota accounting update multiple SQL/index rows per visitor request; **100,000 requests is not a safe visitor capacity estimate**. Confirm observed SQL usage and load on the hosted candidate before public writes. On Free, exhaustion fails operations until quota reset; write routes must remain closed. Never enable a paid plan automatically.

References: https://developers.cloudflare.com/durable-objects/platform/pricing/ and https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ . Prices/limits checked November 18, 2026 (owner timezone).

## Architecture and security

- One fixed object `jeet-devnet-v1`, binding `JEET_SHARED`. Never shard by client, change this name, change class identity, or replace the namespace: that would reset globally shared quotas and hide existing history.
- Bearer authentication is checked before object allocation and again by the shared handler. Only server-to-server `POST /v1/index` is available. No arbitrary SQL, wallet credentials, signing, transaction submission or browser CORS.
- Every operation executes inside `storage.transactionSync`; legacy nested SQL BEGIN/COMMIT are intercepted only by this driver. Exceptions roll back events, volume and cursor together. Full cursor results are consumed before asynchronous work. SQL integer values that require u64 precision remain decimal text.
- Schema and protocol match Node. Existing SQLite files are **not automatically imported**. Rebuild a fresh approved Devnet index from canonical RPC/approved archive; retain old evidence. Never silently clear history gaps.
- Runtime storage persists through isolate restarts/deployments. The provider-managed storage is not a local file: the Node `shared:backup` command cannot back it up. Before hosted acceptance, verify provider PITR availability/retention and a restore procedure on the selected account, record a restore bookmark and validate a non-production recovery. Do not claim that Miniflare restart equals disaster recovery or a hosted PITR test.

## Deployment-independent validation

From the application root, install this optional tool package in isolated storage (`npm ci --prefix <isolated tools directory>` using this package's manifest/lockfile). Set `JEET_WORKER_TOOLS_ROOT` to that directory and run:

```
node scripts/test-durable-object-backend.mjs
```

It bundles the actual Worker and exercises local workerd SQLite, concurrent checkpoint arbitration, replay deduplication, rollback after a partially written batch, pagination, runtime restart, quota persistence, discovery and namespace restrictions. Fixtures have no Solana network access. State/logs are retained in `/tmp/jeet-durable-object-*`; the secret-free report is written under `artifacts/hosting-unblock/`.

## Exact owner approval required before deployment

Approve a new Cloudflare **Workers Free** service named `jeet-launch-shared-devnet`, its SQLite Durable Object, and a dedicated random **application backend token** (not a wallet key). Allow server-only Devnet index/event and hashed quota identifiers to be stored there. No paid plan, custom domain, DNS change, wallet data or Solana transaction is included.

After approval, using the owner's Cloudflare account and reviewed Wrangler tooling:

1. Confirm Workers Free, available account quotas and accepted provider terms; review exact source commit and `wrangler.jsonc`. Keep the generated `workers.dev` HTTPS origin, no custom domain. Build locally first; preserve bundle SHA-256.
2. Securely set `JEET_SHARED_BACKEND_TOKEN` (32–256 characters) in Cloudflare's secret manager. Never put it in source, command-line arguments, reports or `NEXT_PUBLIC_` variables.
3. Deploy this worker configuration once. Its migration creates the SQLite class `JeetSharedIndex`; retain the binding and class identity in subsequent deployments.
4. Verify unauthorized requests return 401, authenticate privately, ingest canonical Devnet data, compare JEETTEST IDs/totals to saved receipts, restart/redeploy and compare history/checkpoints/quotas. Measure usage, provider quota failures, rollback and recovery. If any storage/backend call fails, public write routes remain closed.
5. With separate connection approval, set only the private candidate's encrypted `JEET_SHARED_BACKEND_URL=https://<actual workers.dev origin>` and matching `JEET_SHARED_BACKEND_TOKEN`. Verify HTTPS normally. No Production env change/public-write publication is included.
6. Keep current Vercel read-only deployment as rollback. Roll Worker code back without deleting/migrating the namespace; keep Vercel write gates off during outages or recovery. Any data restore can rewind quota counters: stop traffic, preserve evidence and wait out affected windows/reconcile high-water state before reopening.

Hosted restart/recovery, usage/CPU, real RPC/metadata access and owner Phantom signing/rejection remain external acceptance gates. If Free capacity is insufficient, stop for explicit approval of a concrete paid alternative instead of auto-upgrading.
