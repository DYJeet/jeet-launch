# Pinata: secure setup and verification

**Current status:** genuine Pinata image/JSON uploads, authenticated file records,
exact retrieval, and actual read-only browser rendering/reload are VERIFIED.
See PINATA-LIVE-CHECKPOINT.md and pinata-live-evidence.json. Full wallet-signed
creation using this real URI still needs its integrated acceptance run before
Milestone B promotion. The historical preparation state below is retained for context.

## Historical preparation state (before authenticated Codespaces execution)

Actual restored local HEAD was 44009f6ec4142702532e7d4b73a56e1c181f7c4d,
with a clean tree. It is preserved as recovery/v6-b-local-preserved-20261031.
The most complete remote branch was recovery/v6-b-resume at
53c50c03dab48b56c21f1d502b77baac424fcfc6. Work resumed from that commit,
without resets, history rewriting, or reconstructing saved code.
Main remains 33ff9ffb11167a3b5d185e148da2a7cdc2c43993.

Work's current process has no PINATA_JWT, no Codespaces runtime identity, and no
PINATA_JWT assignment in its conventional local env files. No secret values were
printed. Codespaces secret availability is UNKNOWN: it is a separate runtime,
and the connected GitHub connector does not expose secret management or remote
Codespaces execution. The saved credential was not assumed available here.
No actual credential-bearing app server was started. No live upload was made.

## Secure setup instructions (already completed for the current Codespace)

1. Open https://github.com/settings/codespaces . Under Codespaces secrets, choose
   New secret (or update the existing secret).
2. Name it PINATA_JWT. Enter the privately saved **JWT** in GitHub's secret value
   field, not the API-key/API-secret pair. Do not paste it into chat or commands.
3. Restrict repository access to DYJeet/jeet-launch and save.
4. Stop and reopen the Codespace; restart the application from a new terminal so
   the new server process inherits the secret. Existing processes do not inherit
   later environment changes.

Once the Codespace has the latest recovery branch, from jeet-app-next run:

```
npm run metadata:pinata:environment
npm run metadata:pinata:verify
```

Neither command takes a secret argument. The first prints presence/format only;
the second reads the injected JWT and forces Pinata mode for this provider test.
For an actual local application process, set the NON-SECRET setting
JEET_METADATA_STORAGE=pinata in its server runtime configuration. Existing local
wallet/RPC/genesis configuration is still required. The secret-free template is
.env.pinata.example. Never use NEXT_PUBLIC_ for a credential.

Codespaces injection does NOT install the secret into ChatGPT Work. Until an
authorized credential-bearing execution path exists, Work cannot claim genuine
provider/browser verification. No Work secure-secret-entry tool is exposed.
Do not copy the credential through Git, a report, or a Library file.

The credential needs public-file upload and read-own-file-record permissions.
This code does not need admin permissions or deletion permission. Verify the
account plan supports these operations. Do not broaden permissions unnecessarily.

Official GitHub secret instructions:
https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces
Official Pinata interface inspected:
https://github.com/PinataCloud/pinata/blob/main/ai-instructions

## Implemented integration

- POST https://uploads.pinata.cloud/v3/files, explicit network=public, multipart
  File, server bearer authorization. No credential forwarded to a gateway.
- Requires a returned file UUID, structurally valid CIDv0/CIDv1 sha256 identifier,
  and exact size. GET https://api.pinata.cloud/v3/files/public/{id} authenticates
  separately and must match the returned UUID, CID and size.
- Gateway retrieval is bounded and exact SHA-256 bytes must match the upload.
  Responses have bounded sizes, timeouts and redirects rejected. Untrusted
  transport exceptions/provider bodies cannot expose authorization headers.
- On-chain URI and JSON image reference use ipfs://CID. Browser display resolves
  only that CID, the explicit Pinata gateway, or same-origin local asset hashes.
  Arbitrary hosts, credentials, paths, queries and redirects are rejected.
- Image signature, real Sharp decode, static-image dimensions <=4096, 2 MiB
  size, UTF-8 metadata lengths and credential-free HTTPS social links remain
  enforced before uploads. Pinata mode does not write image/JSON to temporary
  files as its storage mechanism.
- Identical in-flight uploads coalesce; bounded account/content receipt cache
  avoids another POST on ordinary retries and revalidates account/gateway data.
  A returned upload receipt survives a later verification failure in-process.
  No automatic POST retries are made after uncertain transport failure.
  Cache is not permanent: a process restart or a response lost before receipt
  delivery can still require provider-side duplicate/orphan reconciliation.
- If either upload, account lookup, or retrieval fails, no mint is prepared.
  Existing saved launch jobs retain the same URI across wallet-signing retries.
  No changes to custody, authorities, activation bundle or financial instructions.

## Abuse boundary

The existing upload API is LOCAL DEVELOPMENT ONLY: explicit local-wallet mode,
loopback URL/Host, same-origin checks, actual configured genesis check, 2.9 MB
body cap and two concurrent operations. It now additionally admits six upload
attempts per process per hour. This limit is supplemental, not public-service
identity authentication or a distributed quota. Restarting the local process
resets its quota. Public/non-loopback mode remains rejected and must not be
opened merely to make a forwarded Codespaces port work. A real public service
still requires authenticated wallet/session admission and durable distributed
rate limits before exposing storage quota. This change does not advertise one.

## Live test and limitations

metadata:pinata:verify generates a disposable 8x8 PNG and matching JSON, runs the
actual server pipeline, verifies public-file account records and exact gateway
bytes, confirms the metadata/image IPFS relationship and the existing token SDK's
URI acceptance. It makes NO Solana transaction and has NO signing key.
Its non-secret result goes to programs/launch-custody/target/v6-pinata/live-evidence.json.
A missing or malformed JWT exits 2 as BLOCKED; provider failure exits 1; success
exits 0. Mocks are never selected by this script.

The separate contract/pipeline tests deliberately inject a fake transport. They
prove validation/error handling/URI consistency, not real pinning or persistence.
No current live success evidence exists. After credential setup, additionally
repeat genuine wallet-signed browser creation, metadata/image refresh, token
reader and safe activation using the actual returned IPFS URI. Existing local
browser evidence in this directory belongs to the PREVIOUS checkpoint.

A Pinata public-file record and current gateway bytes are evidence of current
storage/retrievability, not indefinite availability, independent UnixFS proof
verification, geographic replication or a permanent contractual guarantee.
Continued pinning/account service is an external dependency. Disposable records
are not auto-deleted: retain them for refresh acceptance; manually remove only
the exact test file IDs afterward if desired. Never bulk-delete account data.

No mainnet deployment, production funds, live authorities or frozen baselines
were changed. Milestone B stays on recovery; do not promote main or start C until
its genuine persistent-provider/browser acceptance passes.
