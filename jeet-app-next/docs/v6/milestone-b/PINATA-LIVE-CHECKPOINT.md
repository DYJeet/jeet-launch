# Verified live Pinata storage and browser rendering

This checkpoint resolves the previously unverified provider storage dependency.
It is NOT a complete new wallet-signed launch/browser lifecycle and does not
promote Milestone B to main or begin Milestone C.

## Recovery and secure execution

Work started clean on recovery/v6-b-resume at
f2a3d06c38b71a0eab7a9299ffbe2946a909ba1d. Main was and remains
33ff9ffb11167a3b5d185e148da2a7cdc2c43993.

The GitHub connector has no Codespaces execution/secret-management tool. The
owner completed secure browser sign-in/device verification, and separately
confirmed the VS Code workspace-trust prompt at action time. The existing
symmetrical-adventure Codespace started successfully and reported only
PINATA_JWT availability/valid JWT format; no secret value, decoded claims,
authorization headers, cookies or authentication codes were inspected or logged.
The secret was never copied to Work or a Git-tracked environment file.

The original Codespace was on main at
c9b2d9b962c6c79428f652adf733a892a8a3f766 with significant pre-existing work,
including outside jeet-app-next. No original branch switch, reset, stash, broad
staging or baseline edits were performed. Instead git archive extracted only
latest recovery jeet-app-next source under its own test directory:

jeet-app-next/programs/launch-custody/target/pinata-live-20261031/jeet-app-next

A local ignore file hides this test copy. An original status snapshot is retained
beside it. Outside-app Git status compared equal after testing; the original HEAD
and 29 grouped status entries remain intact (VS Code originally counted 341
individual pending items). Do not interpret this as a clean original Codespace.

## Genuine provider proof

`npm run metadata:pinata:verify` ran in that isolated Codespace copy with its
inherited environment JWT, using the real Pinata service and real gateway.
No fake transport, fabricated response or local-file metadata URI was used.

The code uploaded one generated disposable 8x8 PNG and one matching JSON file.
It checked returned CID, size and UUID; authenticated the public-file account
record for each; retrieved exact bytes; checked SHA-256; and verified JSON name,
symbol, description and image IPFS reference. The existing token metadata SDK
accepted the on-chain URI format. Public evidence is in pinata-live-evidence.json.

Image CID:
bafkreicj7f73y73dqbw7blmpjvfnlxt7kle5nufbbcy2bn5inhb2tk4rhi

JSON CID:
bafkreigtvuzpf7evzmsl75qz5slgozvlgtiqpcg52forqpy2hvyvliflom

Account records and current gateway availability do not guarantee indefinite
pinning, future gateway uptime, replication or independent UnixFS proofs.
Continued provider service/pinning remains an operational dependency. The two
disposable records remain pinned for review; no account data was deleted.

## Actual browser proof

A read-only `/local-metadata?uri=ipfs://...` acceptance page reuses the real
LocalLaunchMetadata component. It is disabled by default, explicitly gated by
JEET_LOCAL_METADATA_VERIFY=1, and returns HTTP 404 before streaming when disabled.
It neither connects a wallet nor enables launch/trading or the upload API.

In the actual Codespace production build, the page ran on private forwarded
port 3012. Browser observations verified the real uploaded description, website
link and decoded PNG (natural size 8x8, complete=true), then a full browser reload
retrieved/rendered them again. No provider traffic was mocked or replaced.
No public port was enabled. Screenshots were captured as proof for the owner.

## Checks and fixes

- Codespaces Node 24.21.0, locked npm ci --ignore-scripts; no dependency upgrades.
- Production build, lint and TypeScript checks passed in Codespaces.
- Selected unit/SDK/HTTP regression run: 87 passed, zero failed/skipped.
- A clean-copy regression exposed a missing test-log directory in the public
  gating harness. The harness now creates its own directory; assertions were
  unchanged. The rerun passed, including disabled metadata-view protection.
- Work production build, lint/types and focused checks also passed.
- No Rust/program code, instruction encoding, fee economics, custody, wallet caps,
  opening rules or graduation logic changed. Native/SBF/local-validator financial
  suites were not rerun for these read-only page/test/evidence changes; historical
  verified financial evidence remains under the prior checkpoints.
- npm ci reported 16 moderate dependency advisories in the existing lockfile;
  they were not automatically upgraded or represented as resolved.

The stored credential can now be used in this authorized Codespace. Work's
standalone process still has no PINATA_JWT, and no secret transfer is needed.

## Remaining Milestone B acceptance

Execute the integrated genuine wallet-signed creation lifecycle with this
provider mode and URI (local validator, real metadata CPI, safe activation,
token reader, wallet reconnection and reload). Do not substitute this read-only
metadata test or SDK URI acceptance for an actual on-chain launch transaction.
Installed extension/native-mobile wallet acceptance also remains separate.

No Solana transaction, mainnet deployment, real-SOL spending, authority change,
production token or production liquidity operation occurred in this checkpoint.
The original dirty Codespace and frozen baselines were untouched by this work.

The temporary metadata server was stopped and its private port forward removed
after verification (VS Code confirmed no running process and zero forwarded
ports). The test copy, logs and original work remain on disk.
