# Finalized 65/35 Devnet upgrade

The existing program `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D` was upgraded in place on Solana Devnet only. The approved artifact from `9fc4bcb60317d65a580e039fc53a452698e7ae78` was used without rebuilding or substitution. No lifecycle transactions were authorized or performed in this phase.

## Finalized verification

- Artifact and deployed executable SHA-256: `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa` (261840 bytes). All trailing ProgramData capacity bytes are zero.
- Approved artifact fee configuration: platform 65 bps, immutable creator 35 bps, total 100 bps. Exact binary equality links this deployment to the previously validated fee implementation; genuine Devnet fee-accrual/claim testing remains a separate phase.
- Exact embedded treasury: `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP` (one binary occurrence).
- Program executable; upgrade authority unchanged: `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW`.
- Final upgrade slot: 523424884. No ProgramData extension or account migration was required. No program-owned launch/fee accounts existed at verification.
- 273 unique write ranges cover all artifact bytes (960-byte chunks, final chunk 720 bytes). Finalized instruction bytes are compared directly to the approved artifact. No duplicate writes or failed transactions in this attempt.
- 276 finalized successful transactions: one buffer creation/initialization, 273 writes, one authority handoff and one upgrade. See the complete public [receipt CSV](../artifacts/devnet/fee-65-35/deployment-receipts.csv) and [machine-readable verification](../artifacts/devnet/fee-65-35/deployment-verification.json).

[Final upgrade transaction](https://explorer.solana.com/tx/4BVoi9uggNpfumnRiyyizQFdJQyvsC4DX5F9JdTB9hgpGKhFaXXCKXt5jtmvL4Vcaa5KM7ZQ2h4GUXPxDBfxzozM?cluster=devnet)

## Actual financial reconciliation

| Item | Devnet SOL |
|---|---:|
| Payer before | 1.606113880 |
| Temporary buffer rent committed | 1.330985400 |
| Buffer rent recovered in upgrade | 1.330985400 |
| New upgrade transaction fees | 0.001390000 |
| Prior deployment fees | 0.001545000 |
| Cumulative deployment fees | 0.002935000 |
| Remaining deployment fee cap | 0.000065000 |
| Payer after | 1.604723880 |
| Lifecycle spending | 0.000000000 |
| Lifecycle allowance reserved | 0.050000000 |

Fee calculation: buffer creation two signatures = 10000 lamports; 273 one-signature writes = 1365000; handoff one signature = 5000; upgrade two signatures = 10000. Total 1390000 lamports. The finalized upgrade balance changes prove the entire buffer rent returned to the original payer and ProgramData rent remained unchanged. The buffer no longer exists. Net payer decrease equals transaction fees exactly. No funding transfer, token creation, trade, claim, migration, mainnet operation or additional deployment was performed.

## Preservation and access

Original main changes, frozen release, prior repair checkpoints, recovery archives and the old 75/25 binary were preserved. This receipt checkpoint changes only public documentation/manifest/evidence inside `jeet-app-next`; it does not alter the validated application, program or binary. Private buffer keys, signed wires and existing credentials remain excluded.

The Codespace browser session required GitHub sign-in after the upload. The final CLI exit/log could not be re-read; independent finalized Devnet RPC verification established the deployed bytes, authority, complete transaction sequence, fees and rent recovery. No second uploader or duplicate buffer was started. These reports were preserved through the connected GitHub tools. Reauthenticate the existing Codespace before the next signing phase; do not restart the completed uploader. Its local branch may remain at the approved artifact checkpoint until a safe fetch/reconciliation.

## Next phase requires separate owner authorization

GO to prepare the first genuine Devnet lifecycle, subject to restored Codespace access and fresh metadata, signer, balance, rent, fee and budget checks. Do not treat the upgrade as proof that a Devnet launch or trade has already passed.

Proposed scope: one disposable JEETTEST token, 1% creator allocation, 1% opening wallet cap and protected opening; minimal buys/sells, supply/custody/reserve conservation, exact 65/35 accrual and authorized disposable creator claim. Keep total lifecycle allocation within the existing 0.05 SOL cap and distinguish internal funding from ultimate expenditures. Existing creator/trader wallets remain unfunded at zero. Requote all stages before funding; no duplicate wallets or test tokens.

Platform claims require the approved treasury owner's separate secure wallet-signing approval. Prepare unsigned verification only unless that approval is given. Installed Phantom/native mobile acceptance and genuine Devnet lifecycle results remain release gates. No mainnet launch is authorized.
