# Protected Mainnet read-preview backend

Prepared from `cc445fc91e43242fb381fe073e49bc373d1c1a81`. No hosted backend has been provisioned by this preparation.

## Deployment boundary

| Setting | Required value |
| --- | --- |
| Cloudflare account | `060a9dcc510ac73c02bc9915bd946e36`, from the retained Devnet resource audit; verify against authenticated account state before provisioning |
| Worker | `jeet-launch-shared-mainnet-read-preview` |
| Configuration | `workers/shared-devnet/wrangler.mainnet-read-preview.jsonc` |
| Storage | New Worker-owned SQLite namespace for `JeetSharedIndex`; fixed object name `jeet-mainnet-v1` |
| Program binding | `5PeRukdBmgnWVXvpz9cP1kxcQfDd4mF7h1h2xDb7To4Y`, the public fixture already compiled into Preview |
| Vercel project | `prj_vGtdBgWX5aCwfKN3FUK9xzBja6x8` |
| Vercel environment | Preview only, with existing Vercel Authentication retained |

The fixture is not the owner's final Mainnet identity. Do not bind the final release backend to it. Leave `wrangler.mainnet.jsonc`, the Devnet configuration, existing Worker, database, namespace and credentials unchanged. Same-named classes and objects in a distinct Worker obtain separate namespaces; verify the returned namespace ID differs from Devnet's retained `c62e688aa16242de8265ae4742c3e9a1` before acceptance.

## Authenticated preflight and provisioning

1. Restore an existing authorized Wrangler session in its original environment, or complete a separately approved secure sign-in. Do not copy OAuth secrets or API tokens into chat or Git. Check `wrangler whoami` and confirm the account above. The current workspace has no recovered session.
2. Verify the account's current Workers Free plan and available Worker/SQLite Durable Object allocations in authenticated account settings. The retained Devnet dashboard evidence is historical. Cloudflare documents SQLite-backed Durable Objects on Free, with quota exhaustion returning errors. Do not purchase, enroll in billing, upgrade, change a subscription, or infer this account's plan from public documentation.
3. Inspect existing Worker and namespace names. Stop on a collision with the proposed Worker or an unexpected existing program binding. Review a local dry run using the explicit read-preview config. There are no DNS routes or custom domains; only this new Worker's authenticated `workers.dev` service is requested.
4. Generate a new random backend credential in a mode-0600 file outside Git. Supply it privately as `JEET_SHARED_BACKEND_TOKEN` through Wrangler secret input. Do not print it, use it on the command line, share it with browsers/RPC providers, or reuse the Devnet credential. Provision only the explicit read-preview config after the preceding checks pass.
5. Capture the actual HTTPS URL, Worker version and SQLite namespace ID returned by Cloudflare. Verify the account, program profile, SQLite storage, fixed object name and separation from Devnet. No Solana deployment or transaction is involved.
6. Configure server-only `JEET_SHARED_BACKEND_URL` and `JEET_SHARED_BACKEND_TOKEN` on the isolated Vercel project with target `preview` only. Use secure file-to-API transfer. Keep `NEXT_PUBLIC_` credentials absent, public beta enabled, and all transaction/upload routes disabled. Environment changes require a separate verified Preview rebuild to reach running functions; do not promote or inherit a Production deployment. Preserve authentication and the existing public Devnet Production deployment.

## Acceptance scope

- Use `scripts/readiness/mainnet-hosted.mjs stack` with the approved read-only RPC and reviewed metadata/image hashes. It verifies Mainnet genesis, finalized slot, authenticated checkpoint, rejection of unauthenticated and Devnet requests, and bounded metadata retrieval.
- Confirm wrong credentials, alternate Mainnet program namespaces, unsupported operations and oversized bodies are rejected. Inspect exact responses without logging tokens.
- Verify shared read quotas from independent frontend requests; indexing writes are internal authenticated persistence operations, not financial or public write endpoints.
- Capture cursor, history, volume and quota evidence before and after a verified isolated Worker restart/redeployment, using the same namespace. Record the restart/version evidence separately. Do not add fabricated trades to a hosted chain-history stream or claim an unchanged empty snapshot proves nonempty historical recovery.
- Exercise actual protected hosted read routes and browser pages after integration. Confirm signing, simulation forwarding, submission, creation, claims, migration and uploads remain disabled. Preserve provider cooldowns and do not bypass blocked RPC or metadata providers.
- The fixture has no approved Mainnet deployment. Genuine JeeT Mainnet token history and fund-moving lifecycle acceptance remain unavailable until separately authorized final program deployment. Local fixture recovery and prior genuine Devnet history evidence remain distinct.

## Current evidence and blocker

The new configuration passed the existing workerd persistence/isolation test with its exact compatibility flags, SQLite migration, program binding and object bindings:

```sh
JEET_MAINNET_WORKER_CONFIG=workers/shared-devnet/wrangler.mainnet-read-preview.jsonc node --test scripts/test-mainnet-worker.mjs
```

One test passed, covering missing identity, invalid authentication, Devnet rejection, checkpoint persistence across local runtime disposal/restart, and refusal to rebind persisted state to another program. This used local storage only and no Solana requests.

Cloudflare's GitHub sign-in flow returned `Unable to sign in. Try again or use your email and password.` Automated retries stopped. Current account permissions and Free-plan state could not be verified. No Cloudflare resource, credential, Vercel environment variable or deployment changed in this continuation. A new secure authentication attempt or restoration of the authorized Wrangler session is required before provisioning.
