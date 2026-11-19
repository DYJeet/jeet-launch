# Hosted Cloudflare Free backend acceptance

The existing prepared Worker is deployed at https://jeet-launch-shared-devnet.victorriccardi24.workers.dev . It is a **server-only authenticated API**, not a replacement frontend. An unauthenticated browser request is expected to be rejected. The live read-only Vercel beta and its rollback deployments were not changed.

## Verified

- Owner-provided dashboard evidence showed 0/100,000 daily requests and an Upgrade option; the screenshot also showed no projects. Cloudflare documentation confirms SQLite-backed Durable Objects on Workers Free. Billing-subscription API inspection remains denied, so plan evidence is explicitly owner/dashboard plus provider documentation, not a successful billing API query. No paid subscription, upgrade, billing enrollment, custom domain or DNS change was made.
- Exactly one Worker, one SQLite namespace and one stored object. Namespace identity remained unchanged throughout testing. Observed SQLite size: 106,496 bytes (104 KiB).
- Nine hosted scenario groups passed, with 50 counted HTTP requests in the two acceptance phases, plus a small number of documented smoke/diagnostic calls. These are harness counts, not an account-wide Cloudflare usage invoice or CPU meter. Free allocations are not an unlimited capacity guarantee.
- Missing/incorrect credentials, Mainnet namespace, arbitrary SQL and oversized bodies rejected. Two independent application HTTP clients shared atomic client/global upload quotas. Concurrent checkpoint updates had one winner. A conflicting batch rolled back its partially inserted claim and cursor.
- Three **existing, archived, independently finalized genuine JEETTEST receipts** were decoded with the application's parsers and replayed as derived history. No synthetic trade, test token, wallet funding, signing or blockchain transaction was created. The history checkpoint remains backfilling; three receipts are not represented as complete history.
- Forced Durable Object abort returned the expected 503; a new constructor instance was observed. History IDs, totals, checkpoint and both quota scopes survived. The normal prepared Worker was restored, and all three temporary diagnostic operations subsequently returned 400; unauthenticated access still returned 401.
- Cloudflare management API download confirmed the final JavaScript matches the original prepared deployed code byte-for-byte: SHA-256 `4530c7ebb0a2a0af82f5787b2724871b359777ebfa98890cb221d96c88145aa0`. Final normal version: `224a4f97-851b-44f4-9e89-e59859177b8d`.
- Dedicated backend secret is in Cloudflare's secret binding and a mode-0600 file outside Git. A mode-0600 private candidate connection file is at `/home/codespace/.config/jeet-launch/shared-backend.env`; its public-write gate is 0. The service token was never forwarded to RPC or metadata providers. No Vercel secret/environment change was made.

## Necessary client compatibility correction

The first Python-default HTTPS calls returned Cloudflare 403/error 1010. Cloudflare explicitly documents that workers.dev may reject library-default agents and supports a descriptive application identity. `SharedBackendClient` now sends **JeeT-Launch-Backend/1.0**. This is truthful server identification, not a browser user agent, fingerprint impersonation, TLS bypass or security-rule change. The actual application client passed hosted authentication, concurrency and recovery calls; seven targeted Node regressions and targeted lint passed. Unchanged Rust, program builds and unrelated frontend suites were not repeated.

Reference: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/

## Blocked and unverified

The temporary network probe initially used redirect:error, which Cloudflare's edge runtime rejects. It was corrected to manual handling that rejects non-success responses, without following redirects. The corrected probe then obtained actual upstream responses: **Solana public Devnet RPC HTTP 403** for both read methods; **Pinata metadata gateway HTTP 429**. These checks are BLOCKED, not passed, and are distinct from the passing database/service checks. The normal backend performs no outbound Solana or metadata requests itself; those probes were temporary and are removed. No alternative paid RPC/provider or security bypass was introduced. The existing metadata URI and bytes were not changed.

Genuine Phantom approval/rejection, a reliably configured approved RPC/archive, successful public metadata/pinning checks, private candidate integration/backfill, and separate functional Vercel publication approval remain release gates. Public writes stay off. Mainnet, program upgrades, public migration, treasury signing and the 65/35 fee configuration remain outside this work and unchanged.

Provider PITR restoration was not executed. Forced process restart and transaction rollback are verified; a claim of completed disaster recovery is not made. Keep the fixed object name, class and namespace; never reset them to clear quotas/history. Preserve the current normal Worker version as rollback. The probe deployments recorded in logs are test-only versions and must not be selected as a production rollback. Retain the existing Vercel read-only rollback `dpl_CShXrKvWLxMBUdziNnU7gjtPuzhT` and older `dpl_Cm8WDG7Be9f3C6VqsrnAB5SXYc5C`.

Free-tier reference: https://developers.cloudflare.com/durable-objects/platform/pricing/ . Workers Free limits stop operations when exhausted; no automatic paid upgrade is authorized.
