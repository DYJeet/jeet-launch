# Controlled SyncNative Devnet upgrade — approval checkpoint

Status: preparation only. No public transaction, signing, funding, token creation, claim, migration or upgrade is authorized by this document. The owner reported successful installed Phantom Chrome-extension connection on the Chromebook, with the correct wallet address displayed. That connection check passes; owner-wallet signing, rejection, reconnection and trading are separate, unverified acceptance steps.

## Exact identities and artifacts

| Item | Value |
| --- | --- |
| Target Devnet program | `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D` |
| ProgramData | `4UHVfUkA2HxHRo11hcN3FH8QjX6ZYznikSvA678cxQVW` |
| Current executable SHA-256 | `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa` |
| Candidate SHA-256 | `e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c` |
| Candidate bytes | 274,496 |
| Upgrade authority | `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW` |
| Existing payer / refund recipient | `BAZK4s9BBN3x4XGhjG3tj4P6jGky8cnNHBUdMsoHGFyg` |
| Approved treasury | `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP` |
| Curve fee configuration | 65 bps platform, 35 bps creator, 100 bps nominal total |

Candidate: `artifacts/readiness/candidates/syncnative-devnet/jeet_launch_custody.so`. Rollback artifact: `artifacts/devnet/fee-65-35/jeet_launch_custody.so`. Neither is overwritten by the reproduction build. The clean-target reproduction uses the pinned original build paths, platform-tools v1.57 and SBPF v0. Its hash must equal the candidate before approval; this is not a claim about arbitrary compiler versions or build paths.

The only on-chain source correction relative to the verified lifecycle baseline is the SyncNative CPI account ordering in `programs/launch-custody/src/graduation.rs`: existing Rent sysvar second, curve account after Rent. Stored account layouts, outer instruction encodings, creator entitlement, mint authority rules and fee math are unchanged. Existing ProgramData capacity is 617,552 payload bytes, sufficient without an extend instruction. Application state accounts require no migration. An absent/unfunded upgrade-authority system account does not prevent its key from signing; the separate payer pays the network fees.

## Fresh spending model

`artifacts/readiness/controlled-upgrade/fresh-preflight.json` records finalized state, exact unsigned loader-message fee quotes and packet sizes. The quoted buffer address is a closed historical account used only as a public-address placeholder for message sizing. It is not a new or active buffer and must not be broadcast as a deployment plan.

| Operation | Transactions | Signatures each | Base fees (SOL) |
| --- | ---: | ---: | ---: |
| Create and initialize buffer | 1 | 2 | 0.000010 |
| Upload 960-byte chunks | 286 | 1 | 0.001430 |
| Buffer authority handoff | 1 | 1 | 0.000005 |
| Final in-place upgrade | 1 | 2 | 0.000010 |
| **Total successful path** | **289** | | **0.001455** |

Temporary refundable buffer rent: **1.395277880 Devnet SOL**. Prior cumulative deployment fees: **0.002935 SOL**. Expected cumulative deployment fees after success: **0.004390 SOL**, excluding retries. A failure-close after authority handoff costs approximately 0.000010 SOL; before handoff, approximately 0.000005 SOL. Zero priority-fee price is assumed. The upgrade message explicitly requests a 1,400,000-compute-unit limit; its packet still fits 1,232 bytes. A full 960-byte one-authority write occupies 1,180 wire bytes.

Funding source is the existing payer, freshly observed with **1.559308880 Devnet SOL**. No additional funding is needed for this quote. Preserve the full remaining lifecycle allowance of **0.019049698 SOL** separately; historical lifecycle net expenditure remains 0.030950302 SOL. Funding transfers and refundable buffer rent must not be double-counted as nonrefundable fees.

**Old limits fail:** 1.34 SOL refundable commitment and 0.003 SOL cumulative deployment fees cannot cover this candidate. Suggested approval limits for one attempt are **1.40 SOL temporary buffer rent** and **0.004600 SOL cumulative deployment fees including the already spent 0.002935 SOL**. This allows at most **0.001665 SOL new deployment fees**. It is a proposed cap, not authorization. Requote balance/rent/fees immediately before the first transaction. No chargeable operation starts if any cap, identity, artifact or account check differs.

## Controlled execution after explicit owner approval

1. Verify Devnet genesis, finalized current executable, authority, exact candidate hash/treasury, signer public identities, payer funds and fee ledger. Refuse Mainnet and unexpected active upload processes/buffers. Preserve the existing executable and application-account data hashes.
2. Create exactly one secure temporary buffer and fund only its quoted rent. Payer is temporary buffer authority, keeping each write to one signature. Do not change the program's upgrade authority or treasury.
3. Upload sequential 960-byte ranges using at least 600 ms pacing, fresh blockhashes, confirmed receipts and byte checkpoints. At most three submissions per range and twenty retries globally, always subject to the stricter remaining-fee cap. Do not rebroadcast a differently signed replacement while an earlier transaction is ambiguous. First reconcile signature status and actual buffer bytes; never rewrite verified correct bytes unnecessarily. Stop on unexpected errors or persistent rate limiting.
4. Compare the entire on-chain buffer payload with the approved candidate SHA-256. Only then transfer buffer authority to the existing upgrade authority and verify that exact authority on-chain.
5. Construct the one in-place Upgrade with the existing payer as fee payer and spill/refund recipient. Include no program authority change, extend, claim, trade or migration instruction. Simulate this exact final message against the now-existing complete buffer; simulation must succeed. Recheck fees, candidate bytes, signer set and remaining budget before signing/submission. A missing-buffer simulation before upload is not acceptance evidence.
6. Confirm finalization. Verify executable status, ProgramData pointer, logical ELF hash, zero tail padding, approved treasury bytes and unchanged upgrade authority. Compare application-state snapshots, token supply, authority revocations and fee custody. Investigate any unexpected state change rather than silently accepting it.
7. Verify buffer closure and exact rent/spill recovery. Successful loader Upgrade closes the temporary buffer automatically; do not submit a redundant close. Reconcile every charged receipt, payer balance and any ProgramData rent change. Preserve signatures and Devnet Explorer links, then stop before lifecycle transactions.

If upload fails before upgrade, the old executable remains installed. Preserve the checkpoint and reconcile fees. Only the identified temporary buffer may be closed, using its current verified authority and the payer as recipient, within explicitly approved cleanup/fee limits. Never close ProgramData or the program account.

## Rollback

A rollback is another controlled in-place code upgrade; it is not a Git reset or restoration of application account data. Stop all new lifecycle activity if post-upgrade verification fails, preserve all receipts/state, and present the retained `13e0…24fa` executable for separate owner authorization. Current rollback buffer quote is **1.330985400 SOL** refundable rent and approximately **0.001390 SOL** new base fees (273 writes plus setup/handoff/upgrade). These costs are **not included** in the one-attempt 0.004600 SOL cumulative proposal. Do not automatically perform a second deployment.

The old binary retains the known SyncNative migration incompatibility. Reinstalling it does not unwind an already completed pool migration or reverse token/SOL movements. No public migration is authorized during this upgrade phase, so application state should remain unchanged. Keep website migration controls disabled throughout.

## Evidence and remaining boundaries

Reuse the unchanged 115 distinct Node cases, production builds/lint, preserved genuine 10-transaction Devnet lifecycle, current-Ray­dium snapshot migration suite (28 positive / 52 rejection-and-rollback checks), and complete local browser lifecycle (24 positive / 24 rejection groups, 27 local transactions). The additional focused test rehearses the loader upload, buffer-authority handoff, wrong-authority rejection, candidate upgrade and rent/fee conservation on a loopback validator with ephemeral local signers, never real deployment keys.

Creator claiming previously succeeded on genuine Devnet; platform accrual is verified but no platform claim was signed. The treasury remains unfunded on Devnet and its 1,342-lamport accrual is below the 5,000-lamport fee. Treasury signing or funding requires separate owner approval. No private treasury key is requested or imported.

The preserved production dependency audit has zero findings; fourteen development-tool records trace to the picomatch advisory. No application import of those glob packages was found. The advisory currently lists no patched version; do not force a framework downgrade or represent this as resolved. Independent security review, reliable RPC/durable hosting and real Phantom signing/iPhone acceptance remain public-release requirements.

The preview now resides in `/workspaces/jeet-devnet-readiness/jeet-app-next`, with its validated dependencies/build and SQLite index on persistent workspace storage. Resume it using `python3 scripts/readiness/start-devnet-preview.py`; it does not rebuild, install packages, import wallets or submit transactions. It requires the existing server-only Pinata secret and exact authorized Codespace. The private HTTPS URL still requires a running Codespace and may require GitHub sign-in; this is not permanent production hosting.

Owner approval must name the existing target program, exact candidate hash, one Devnet-only attempt, revised refundable-rent/cumulative-fee caps, existing payer, and permitted failed-buffer cleanup. It does not authorize token creation, trading, migration, platform claims, Mainnet or an automatic rollback.

## Final verification, 2026-11-18
Clean pinned-toolchain build reproduced e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c exactly. Local loader rehearsal against the cloned Devnet feature set passed 289 transactions, 1,455,000 lamports fees, eight positive invariants and one expected wrong-authority rejection. Buffer closure and full rent/fee conservation passed. Default all-features validator rejected SBPF-v0; Devnet disable-SBPF-v0 feature is inactive, independently recorded. Both results are preserved. No public transactions submitted.
HTTPS preview restored on port 3019; JEETTEST metadata, image, chart, two trades and creator claim loaded. Discovery warns of RPC history coverage gaps. Real desktop Phantom connection passed by owner report; signing, rejection, reconnection and iPhone acceptance remain unverified.
