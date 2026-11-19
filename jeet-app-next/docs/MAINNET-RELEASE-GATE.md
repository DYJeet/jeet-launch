# JeeT Launch Mainnet release gate

**Decision on November 19, 2026: NO-GO for Mainnet deployment, public creation, and trading.** Baseline `95a9b75`, branch `repair/functional-devnet-beta`. Approved curve fees remain 65 bps platform and 35 bps creator. Approved treasury remains `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`. This review used local tests, project artifacts, source inspection, and read-only RPC queries.

| Priority | Release requirement | Result and evidence |
| --- | --- | --- |
| CRITICAL | Deployable program and network-pinned wallet | BLOCKED. The default Rust profile dispatches only legacy instructions. Current V5 creation, immutable metadata, trading and graduation opcodes compile under Devnet/local test flags. Mainnet needs a distinct program ID, an explicit instruction allowlist and isolated runtime, and a matching Mainnet build. The client still only accepts local and Devnet. The known reproducible executable `e4516444…` is a Devnet binary. |
| CRITICAL | Custody, fees and mint authority | DEVNET EVIDENCE. V5 loads canonical custody, token vault, curve, and fee accounts. Activation requires confirmed immutable metadata and checks revoked mint/freeze authorities. The fee claim binds the recipient signer to the recorded beneficiary and debits only accrued, unclaimed lamports. The verified Devnet buy, sell and creator claim reconciled. Replay, reused identities, reserve/rent conservation, and legacy instruction exposure still require review against the actual Mainnet profile. Treasury signer control remains unverified. |
| CRITICAL | Graduation and safe failure | BLOCKED. Devnet/local source pins Devnet Raydium addresses. Mainnet Raydium is live and its configuration was read at finalized slot `471405543`. A local Raydium replay already exercises CPI failure and rollback. Replay the final candidate once with the exact Mainnet dependency bytes and verify atomic custody transfer, wrapped-SOL synchronization, LP burn, fee account/config, state changes, and caller refunds. Recheck the external dependency hash before release. |
| CRITICAL | Independent review and containment | BLOCKED. This is an internal review. Independent review must cover final source and executable, fund-moving opcodes and any reachable legacy paths, writable account aliases and PDA signers, mint and fee authorities, and the external CPI/LP checks. UI and RPC restrictions stop JeeT traffic only. Confirm a real on-chain containment strategy and redemption behavior before allowing public funds. |
| REQUIRED | Installed wallet and signed transaction | PARTIAL. Chromebook Phantom connection and rejection are owner-confirmed. The separate 2,400-JEETTEST Devnet buy still needs the owner's public Devnet address, refreshed unsigned simulation and balance quote, and separate approval for a capped buy. See [Phantom acceptance](DEVNET-PHANTOM-UAT.md). A Mainnet genesis mismatch now fails the local wallet check using the full genesis hash. Existing signing checks cover message substitution, wallet changes, expiry, and ambiguous-send reconciliation. |
| REQUIRED | Network services and index | PARTIAL. Mainnet RPC, Raydium, and Token Metadata were reachable for read-only inspection. The existing Devnet Worker has persisted history and shared quotas. The Node adapter can now bind a fresh durable volume to one Mainnet program, segregating history and quotas. Validate the actual Mainnet RPC/metadata service under a private Preview and restore a non-production index backup before opening traffic. |
| REQUIRED | Authority, costs, and operations | PARTIAL. The loader quote and verifier below are ready. Deployment identities, treasury proof of control, exact signed-plan cost, build hash and live deployment verification remain pending. |
| OPTIONAL | Visual refinement, native mobile acceptance, archival history, and broader discovery | Defer for the first desktop-only controlled release. Keep explicit history-gap and supported-client labels. |

## Read-only tooling and observed costs

Run from `jeet-app-next` with Node 24. The tool uses finalized Mainnet RPC reads and accepts a server-only `JEET_MAINNET_READ_RPC` override. Prompts, wallet keys, and transaction submissions are outside this tool.

```sh
node scripts/readiness/mainnet-readonly.mjs dependencies
node scripts/readiness/mainnet-readonly.mjs quote 274496 274496
node scripts/readiness/mainnet-readonly.mjs verify REVIEWED_ELF_PATH REVIEWED_SHA256 MAINNET_PROGRAM_ID UPGRADE_AUTHORITY
```

The last command is for read-back **after a separately approved deployment**. It derives the canonical loader PDA, checks the finalized Program owner and executable flag, pins the ProgramData authority, and compares the executable SHA-256 and padding. It rejects the known local and Devnet artifacts. A hash match verifies the deployed bytes against the reviewed bytes.

The **274,496-byte** quote uses the current Devnet executable's size as a budget reference. Capacity equals file length for this example. The final estimate requires the reviewed Mainnet ELF, selected capacity, deployment signer count, exact loader message sequence, and updated RPC fees.

| Mainnet read-only quote | Observed SOL |
| --- | ---: |
| Loader Program and ProgramData rent combined | 1.396151640 |
| Temporary buffer rent | 1.395277880 |
| Conservative up-front funding for these accounts before fees | 2.791429520 |
| New launch account rent before metadata CPI and network fees | 0.014605000 |
| First buyer if both ATA and buyer receipt need funding | 0.002550160 |
| Raydium CPMM index-0 pool creation fee before migration rent and network fees | 0.150000000 |

Mainnet CPMM index 0 reported a 2,500-per-million trade fee (0.25%) and enabled pool creation. CPI compatibility remains unverified. The finalized ProgramData payload SHA-256, including capacity padding, was `c383e1c5b1f578f3d1bf42f12360fca67225b9adda0f3b6c293ad0d6b966818d`. Raydium retains an upgrade authority, so recheck immediately before deploying the candidate and monitor for changes. The approved treasury had no account at the observed Mainnet slot. An account lookup cannot prove key control.

## Owner-controlled release procedure

1. Choose a new Mainnet program identity and a separate owner-controlled fee payer. Keep deployment signing on an owner-controlled device. Keep the upgrade authority in an owner-approved hardware-backed or reviewed multisig workflow. Verify its authority-transfer and upgrade capability off Mainnet first. Keep the existing treasury. Prove control with a clearly scoped, non-transaction challenge before approving any treasury funding or claim.
2. Compile a dedicated Mainnet profile from a clean source checkout. Restrict the exposed opcodes to the reviewed release surface. Pin the crate lock, Solana/Agave SBF tools and Raydium binary/config. Start with the retained Devnet reproduction inputs (SBF v0 and platform tools v1.57), verify their suitability, and produce two clean builds from the exact Mainnet identity and source commit. Compare SHA-256 hashes and record ELF capacity, tool versions, and dependency hashes. The prior Devnet build and toolchain evidence stay available for comparison.
3. Provision a separate HTTPS index service on a dedicated persistent volume using `JEET_SHARED_MAINNET_PROGRAM_ID`, a new server credential, and a separate database path. The Node service binds the file to the full Mainnet genesis and program and rejects reuse of an existing Devnet database. Restore a backup off production and check event/checkpoint integrity. Use separate frontend wallet, RPC, metadata, and auth configuration. The read-only Mainnet probe uses the public RPC; configure rate limits, RPC health, metadata limits and persistence for the actual launch service.
4. Review exact unsigned create, trade, claim and migration messages for the built candidate. Run a focused local replay on the pinned public dependency bytes and do one owner-approved Devnet signing test. Mainnet JeeT simulation against an undeployed program cannot validate custody or ceremony success. If a later real deployment is approved, perform finalized read-back and restricted unsigned Mainnet simulation before authorizing any trade or admitting users.
5. Start with a private, owner-only launch window and reviewed spend limits. Keep the existing read-only public deployment as rollback. If an invariant, authority, dependency hash, or RPC health check changes, disable gated site writes and forwarding immediately, keep withdrawals available where safe, preserve logs/receipts and inspect finalized accounts. A frontend rollback cannot undo chain transactions or stop direct program calls. Any on-chain restriction or binary rollback requires reviewed authority action and separate authorization.

Sources: [Solana program deployment](https://solana.com/docs/core/programs/program-deployment), [Raydium CPMM source](https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/lib.rs), [verified Devnet upgrade](../artifacts/readiness/controlled-upgrade/independent-finalized-verification.json), [finalized Devnet trade receipts](../artifacts/public-beta/post-upgrade-acceptance-162ad9f/independent-finalized-verification.json).
