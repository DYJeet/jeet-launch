# Backend hosting / acceptance unblock

Prepared from `172f4561168f5472437c049340c1b4ac38b24bcb` on `repair/functional-devnet-beta`. Only `jeet-app-next` changed. No services provisioned, no Vercel Production configuration/deployment, no Solana transaction or spending.

## Passing evidence

- Existing Node shared backend: 7/7 tests, including authenticated HTTP, restart/restore, atomic quotas and discovery.
- Market indexing + readiness: 11/11 tests; finality/backfill/replay and release-gate safeguards.
- Actual local workerd / Durable Object SQLite: 7/7 scenario checks; concurrent CAS, idempotency, rollback after partial writes, restart persistence, quota concurrency, discovery and namespace rejection. Fixtures make no Solana request.
- Total targeted checks: 25 passed, zero final failures. Separate integration: 68 real loopback-only launches, process restart, preserved partial cursor, injected 429 recovery, all cursor pages, search and ranked discovery assertions passed. No Devnet funds used.
- Next production build: passed with Devnet read-only configuration; TypeScript and targeted lint passed. Fresh Next route type generation was required before standalone TypeScript checking; no application defect was inferred from initially absent generated route globals.
- Optional backend test-tool audit: zero vulnerabilities after patched sharp/undici pins. Original audit retained. No new runtime package dependencies added to the app or Worker.
- Worker bundled artifact SHA-256: `3575917429563051abf72ac23e308c3e75455bc370b5fe0c8dbe088ddbcb88e9`. This is an optional HTTP backend bundle, **not** a Solana executable. Existing approved program artifacts remain untouched.

Native storage: 17 GB available; Codespace workspace ~816 MB available, separate `/tmp` ~40 GB available. All expensive local validation used that separate filesystem. No cleanup/deletion was necessary. Original main checkout, uncommitted work, existing worktrees, credentials, keys and binaries were preserved. Full validator ledger/runtime logs remain at `/tmp/jeet-scale-WvSQS9` and the failed old-runtime evidence at `/tmp/jeet-scale-QdtYk0`; compact acceptance evidence and provenance are committed.

## Hosting decision

Preferred small-beta candidate: Cloudflare Workers **Free**, SQLite Durable Object, $0 recurring within free quotas. Exact config, scopes, usage limits, recovery plan and owner approval are in `workers/shared-devnet/README.md`. Local tests prove adapter compatibility, not account eligibility, hosted capacity, uptime or disaster recovery. Worker runtime quota exhaustion must fail closed; no automatic paid upgrade. Render fallback: $7.25/month base before tax/overages; requires separate paid-resource authorization. No installed Vercel storage integration or connected backend host was found. DidYouJeeT infrastructure/credentials were not repurposed.

## Remaining external gates / NO-GO for public writes

1. Owner approval to create/connect the specified Cloudflare Workers Free service and SQLite namespace; secure dedicated application token. Verify actual free account plan and quotas before provisioning. No external connection was silently created.
2. Hosted HTTPS acceptance: canonical JEETTEST index rebuild/reconciliation, restarts, live quota/concurrency/usage/outage behavior, provider backup/PITR restore and rollback. Keep the single stable object identity; never reset quotas to recover traffic.
3. Existing approved RPC/archive and Pinata credentials must be securely configured for the private candidate under the approved scope. Existing bounded RPC retries/history-gap and metadata cache/validation code is reused. No new endpoint, provider credential or gateway bypass was invented. Previously observed gateway 403/1010 remains a host-specific retrieval/pinning verification gate, not a passed check.
4. Owner Chromebook: connection already accepted. Follow the private-preview procedure in `docs/FUNCTIONAL-DEVNET-BETA.md`: verify public address and Devnet, prepare JEETTEST buy, **Reject** in Phantom and record the explicit state. Real approval/signing/buy/sell require a fresh owner-wallet rent/fee quote and separate explicit spending authorization; do not reuse completed disposable-wallet authorization. No iPhone installation needed for desktop acceptance. A new private preview URL has not been started/verified in this turn.
5. Only after those pass: review genuine Phantom report, preserve current read-only rollback and separately approve exact functional Vercel candidate/environment/public-write publication. Public migration and platform treasury signing remain separately prohibited.

Current read-only rollback: `dpl_CShXrKvWLxMBUdziNnU7gjtPuzhT`, source `5f7a07900f7c9a516fbfe0616452f5c6c0617bfe`; older `dpl_Cm8WDG7Be9f3C6VqsrnAB5SXYc5C` also preserved. Approved 65/35 fees, treasury and upgraded Devnet program were not modified. Existing genuine Devnet receipts were retained rather than rerun.
