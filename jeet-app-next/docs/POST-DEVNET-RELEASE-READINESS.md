# JeeT Launch Devnet release readiness — November 18, 2026

**Decision: GO for controlled owner connection UAT; NO-GO for unrestricted public release.** The original 10-transaction JEETTEST lifecycle and approved deployed program are unchanged. This recovery submitted no public-network transaction and spent 0 Devnet SOL.

The final report is on `repair/devnet-readiness`. Source recovery checkpoint: `81ea39b4302d4ea5c7dfa2c775ef96e8e5d877a0`. Validated candidate/evidence checkpoint: `51360fc31adfd2355768378eca005e0d34fcb845`. The report commit is the branch HEAD that contains this file; the original `repair/fees-65-35` branch remains at lifecycle checkpoint `ff8d7174498935ab3fb1a181da0a5ddc4c17fd31`.

## A. Recovery, preservation and disk

The Codespace restarted and its old `/tmp` validation copy was absent. The recovered source was preserved on GitHub before recreating only missing validation evidence. The original main checkout, its uncommitted changes, the original repair checkout at `9fc4bcb`, frozen release at `712f5b93e77f243ff8d0c35b98694abab56214c8`, recovery archives and approved artifacts were not overwritten. Worktree HEAD/status/tracked-diff hashes were checked before and after validation. No reset, force-push, branch deletion, wallet deletion or archive deletion was used.

Before recovery, `/workspaces` had about 174 MiB free and `/tmp` about 41 GiB. Validation ran in `/tmp/jeet-readiness-resume-81ea39b/jeet-app-next`. After the owner's cleanup instruction, six ignored webpack `wpc1` cache packs were checked for exact path, ownership, file format, symlinks/hardlinks and open use. Deleting those packs recovered **153,018,368 bytes**, leaving about **320 MiB** on `/workspaces` and **37 GiB** in `/tmp`. Git status was unchanged and the active operation was not interrupted. The root workspace remains too constrained for large new builds; continue using adequate isolated storage. Exact paths/sizes are in [disk-cleanup.json](../artifacts/readiness/disk-cleanup.json).

## B. Frontend integration

Confirmed corrections cover Devnet page gating, Create rendering behind an HTTPS reverse proxy, exact Codespaces forwarded-host handling, public metadata origins, accurate network labels, Devnet revenue navigation, server-only RPC selection and pacing, and friendly rent-minimum simulation errors. Default local behavior and public signing gates remain. The Next.js security update is pinned at 16.4.6. Changes are confined to `jeet-app-next`; there is no redesign or new product feature.

| Check | Result | Evidence scope |
| --- | --- | --- |
| Focused Node regressions | PASS: 58 | Preserved prior-session evidence |
| Additional regression cases | PASS: 50 | Preserved prior-session evidence |
| Index persistence/concurrency | PASS: 2 | Preserved prior-session evidence |
| New strict forwarding regression | PASS: 1 | Included with 23 wallet/4 existing environment cases in a 28-case affected suite; overlapping cases are not counted twice |
| Distinct preserved Node cases | **111 passed, 0 failed** | Carried forward; not unnecessarily rerun |
| Native Rust unit cases | **13 passed, 0 failed** | Prior captured session; not rerun in this recovery |
| Default/local production build | PASS | Fresh recovery, including TypeScript |
| Devnet production build | PASS | Fresh recovery, including TypeScript |
| ESLint | PASS | Fresh recovery |
| Public production browser | PASS: 3 viewport groups | 390, 768 and 1440 px, runtime exceptions checked |
| Devnet page/origin regression | PASS: 3 groups | Each page accepted the configured host and rejected three foreign host/origin/site variants |

Fresh raw build/browser logs are under [artifacts/readiness/logs](../artifacts/readiness/logs). The preserved Node/Rust result distinction is explicit in [readiness-summary.json](../artifacts/readiness/readiness-summary.json) and [recovered-native-validation.json](../artifacts/readiness/recovered-native-validation.json). Earlier interrupted builds and diagnostic browser errors were not silently counted as passes; final successful results supersede them.

## C. Wallet readiness

The previous local Wallet Standard infrastructure suite passed 15 positive and 10 rejection groups, including real disposable Ed25519 signing, connection/reconnection, account selection, disconnect, rejection, duplicate protection and account changes during signing. The navigation diagnostic response-body error was fixed without weakening independent signature, receipt and balance assertions.

The fresh complete browser lifecycle passed **24 positive and 24 rejection groups**, with **27 genuine local transactions** across 390/768/1440 px. It covers Create, metadata, token page, curve buy/sell, creator claim, graduation and AMM swaps/recovery. Wallet and RPC failure injections are identified separately in the evidence. These are disposable Wallet Standard adapters, **not installed Phantom acceptance**.

## D. Bonding curve and live Devnet

A fresh finalized read at slot **523608319** confirmed executable program `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D`, exact approved deployed bytes, unchanged upgrade authority and treasury, closed prior deployment buffer, unchanged wallet balances and fee vaults, revoked mint/freeze authorities and all **10 prior receipts finalized with no errors**.

JEETTEST mint: `7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM`. Its 1% creator allocation, 1% wallet cap, custody, protected opening and original buy/sell remain preserved. Prior round-trip raw consideration was 103,199 lamports per trade: each charged 671 platform plus 361 creator lamports, from a total rounded fee of 1,032. Platform accrual remains 1,342; creator accrual/withdrawal remains 722/722. Reserve and trader-token ending balances were zero in the verified lifecycle. Actual historical external lifecycle cost remains **0.030950302 SOL**; remaining external allowance is **0.019049698 SOL**, with **0.004585 SOL** of the original funding authorization unallocated. These amounts are reserved, not renewed spending permission.

The read-only production API smoke discovered the actual JEETTEST name/symbol, raw trade volume 206,398, both trade records and the 722-lamport creator claim without counting claims as volume. Metadata JSON and its 1,378,636-byte PNG were again retrieved publicly over HTTPS with HTTP 200 and recorded content hashes, without authentication. Actual external browser rendering of that data remains part of owner UAT.

## E. Graduation and AMM

The confirmed SyncNative error was caused by putting the curve account in the optional second CPI position now used for Rent. The minimum correction inserts the already supplied Rent sysvar there and keeps the curve after it. Stored account layouts and outer instruction formats are unchanged. A separate local fixture reproduced the prior corrected hash, and the Devnet candidate built identically twice.

| Artifact | SHA-256 | Status |
| --- | --- | --- |
| Approved live JeeT program | `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa` | Unchanged and verified on Devnet |
| Corrected Devnet candidate | `e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c` | 274,496 bytes; **not deployed** |
| Corrected local signer fixture | `a0517db22d618b092e1bd52b6b0e4c0e61bafa035a60abddd7ca3a9f649d87fa` | Local tests only; never deploy this fixture |
| Pinned Raydium local SBF | `4a04a78dbe3c643acdb1a4c20166c18b2e1391522a794f670a77bd305a0d4433` | Tested fixture; pinned source `f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5` |
| Current observed public Raydium ELF | `7422c293a9fd2ae516382a0e09a49ba0501b2d935f752f4ed4819ffe56d35fac` | Finalized read-only snapshot; different hash; not locally replayed |

The fresh local graduation suite passed **28 positive and 52 rejection/rollback checks**. It verifies full inventory completion, phase/cap restrictions, caller and creator boundaries, token/SOL conservation, exact reserve deposits, initial LP burn, fee-vault isolation, malformed/substituted accounts, inadequate compute/funding, duplicate and concurrent execution, post-migration curve rejection and redemption rights. The fresh browser also completed migration and both AMM swap directions with the corrected local fixture. Initial LP burn proves that initial position was burned; it is not a guarantee against later LP issuance or external program controls.

Read-only public Devnet inspection confirmed executable Raydium `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`, canonical 236-byte config, 2,500-millionths trade fee and a **150,000,000-lamport pool-creation fee**. The current public ELF hash differs from the tested pinned build. This does **not** by itself prove incompatible behavior, but current-snapshot local replay is still **UNTESTED**. Its exact compressed snapshot and provenance are preserved for that next check.

**Public migration is not cleared.** The application hides migration and rejects public-network graduation planning before RPC/signing. That frontend guard is not an on-chain pause: existing deployed Devnet instructions remain callable by external clients when their conditions are met. No public migration was submitted here. Raydium AMM swap fees are separate from JeeT's 65/35 curve fees; the current integration does not automatically collect that JeeT split on external swaps.

## F. Fees and claims

Active Rust/TypeScript fee math and UI disclosures remain **65 bps platform / 35 bps creator / 100 bps nominal total**. The total fee rounds up once, platform receives the rounded 65% share and creator the exact remainder; rounding conserves value and dust trades can exceed nominal rates. No active old 75/25 disclosure was found. Immutable creator entitlement and canonical beneficiary/vault checks remain.

Approved treasury: `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`. Upgrade authority: `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW`. They are distinct roles and neither was changed.

Creator claiming passed in the original genuine Devnet lifecycle and in local browser tests. Platform accounting and an unsigned instruction/fee quote were checked; **no platform claim was signed or submitted**. The treasury has no Devnet account, its 1,342-lamport claim is below the quoted 5,000-lamport transaction fee, and a future owner-controlled signature and separately authorized funding would be required. Never substitute the payer or import the treasury secret into the Codespace.

## G. Security, dependencies and candidate approval boundary

Fresh production dependency audit: **0 vulnerabilities**. Full audit: **14 high-severity development-tool dependency records**, rooted in the picomatch advisory; no forced framework downgrade or unrelated dependency rewrite was applied. New Git objects were scanned for high-confidence private-key/credential patterns and key files; none were found. This is a scoped new-work review, not an assertion about every unrelated historical commit or a substitute for an independent contract audit.

The new candidate fits the current **617,552-byte ProgramData capacity** and needs no account-layout migration. It is **not authorized for upgrade**. Read-only quotes give **1.395277880 SOL** refundable buffer rent and approximately **0.001455 SOL** new base fees, assuming 286 960-byte writes, zero priority fee and no retries. Existing deployment fees are 0.002935 SOL; estimated cumulative fees would be **0.004390 SOL**. Both the old 1.34-SOL buffer cap and 0.003-SOL cumulative fee cap would fail. Actual deployment messages, authority, cost and byte-range checks must be repeated only after separate owner approval and revised limits. The trading budget cannot be used for that upgrade or the 0.15-SOL public AMM creation fee.

## H. Actual Phantom and external HTTPS status

**NOT TESTED:** installed desktop Phantom and native iPhone Phantom signing/connection acceptance. **BLOCKED in this cloud browser:** the private HTTPS navigation returned `net::ERR_HTTP_RESPONSE_CODE_FAILURE`; inspection of its browser-generated error page was then denied by URL security policy. The cause of the HTTPS response error is not proven. No browser protection was bypassed, no alternative browser surface was used to evade it, and an unexecuted test is not reported as passed.

## I. Preview and owner instructions

Private preview URL: **https://symmetrical-adventure-544vrwjwxppcv7wx-3019.app.github.dev/**

Codespaces Ports showed a running Next.js 16.4.6 process on private port 3019. The screenshot is [private-preview-ports.jpg](../artifacts/readiness/private-preview-ports.jpg). This verifies the running private endpoint, not external browser or Phantom acceptance. Keep the Codespace running; `/tmp` storage and the server process can be lost when it restarts. Source, candidate and validation reports are now preserved in GitHub. This is not persistent production hosting.

Open the exact URL in your own authenticated desktop browser with Phantom installed, then inside the iPhone Phantom in-app browser. Use an existing wallet, select **Solana Devnet**, connect, verify public address/balance, disconnect and reconnect. Sign in to GitHub normally if the private port asks. If the direct link fails, open the authorized Codespace's Ports panel and use **Open in Browser** for private port 3019; do not weaken browser protections or make the port public as a workaround. Do not create another token, fund a wallet, trade or claim under this readiness instruction.

## J. Remaining steps

1. Complete external HTTPS and real installed-Phantom desktop/iPhone connection UAT. Then obtain a concrete, separately authorized minimal signing/spending plan before any new Devnet transaction. Reuse JEETTEST where possible; no additional token is currently authorized.
2. Replay the preserved current public Raydium ELF on a local validator and review its integration/version/fee policy before public graduation is enabled.
3. Review the corrected JeeT candidate; any in-place Devnet upgrade requires separate owner authorization and revised refundable-rent/cumulative-fee limits. Do not substitute it for the approved live artifact without that approval.
4. Before public release, address development-tool security risk, choose reliable existing authorized Devnet RPC infrastructure and durable index/hosting storage, and complete the security review appropriate to public funds. No new paid service was purchased or provisioned.

**Current permission boundary:** no Mainnet work, no further public transactions, no public migration, no treasury signing and no upgrade. The next owner action is connection-only Phantom UAT and reporting its result.
