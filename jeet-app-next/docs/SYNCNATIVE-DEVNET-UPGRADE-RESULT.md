# Finalized SyncNative Devnet upgrade recovery

Approved checkpoint: `a3eb77a2ad629e5142bde5db92a4e4adb8a008fc`. One original upgrade attempt; no new transaction, uploader, buffer or funding was initiated during recovery.

- Program: `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D`
- Executable SHA-256: `e4516444814532383d1dce55dd84f0b88dacbb35435f738596b1c7fb725e2e2c`
- Upgrade authority: `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW` (unchanged)
- Treasury: `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP` (unchanged)
- Fees: 65 bps platform / 35 bps creator / 100 bps total.
- Original uploader completed at `2026-11-18T15:34:06.826Z`. Process no longer running; private and public journals matched; no pending transaction.
- 286/286 byte-verified upload chunks; complete buffer hash verified before handoff; final deployed hash independently reverified.
- 289 finalized receipts rechecked; zero failed on-chain transactions; zero expired attempts.
- All 14 recorded application accounts unchanged in owner, executable flag, lamports and data hash.
- Existing main, repair and frozen release checkout HEAD, status and tracked-diff fingerprints rechecked against the preceding recovery record.

## Financial reconciliation

| Item | Devnet SOL |
|---|---:|
| Previous deployment fees | 0.002935000 |
| This upgrade fees | 0.001455000 |
| Cumulative deployment fees | 0.004390000 |
| Approved cumulative cap | 0.004600000 |
| Unused deployment-fee headroom | 0.000210000 |
| Buffer rent refunded | 1.395277880 |
| Buffer rent outstanding | 0 |
| Final payer balance | 1.557853880 |

Buffer `BbZogFHxBmRWGet9BJDdZvwTgumBuamNzMhEAHZfqRio` was closed automatically by the finalized upgrade. Creation and upgrade transaction pre/post balances independently prove the exact rent commitment and refund. No redundant close transaction was sent.

## Finalized transaction receipts

- [create-buffer](https://explorer.solana.com/tx/2iXR3qCPCYA5KPFSnVq1GCFUASSpc8cWyQrF9LvFUAQBsw4qeyDLkAu8KfHtbngpXt6GUDQwBJQmz1hHiYhfNa36?cluster=devnet): `2iXR3qCPCYA5KPFSnVq1GCFUASSpc8cWyQrF9LvFUAQBsw4qeyDLkAu8KfHtbngpXt6GUDQwBJQmz1hHiYhfNa36`
- [handoff](https://explorer.solana.com/tx/mMExawLsB9uxt2VqBo7fxa7geTmpDzXsKiBrvWVs4EoN8KJDTdZ82SUfmbLy1VRUx2ZKF2qtp2Li8po4CyyNLs8?cluster=devnet): `mMExawLsB9uxt2VqBo7fxa7geTmpDzXsKiBrvWVs4EoN8KJDTdZ82SUfmbLy1VRUx2ZKF2qtp2Li8po4CyyNLs8`
- [upgrade](https://explorer.solana.com/tx/3x5wBLamaV3USF4GZMGKuJVAU51bi12CocRs1jxeR51e6ghR8wa1513TR2Kzkupr6FyVELuyjF2a4mAXnRzPeVDN?cluster=devnet): `3x5wBLamaV3USF4GZMGKuJVAU51bi12CocRs1jxeR51e6ghR8wa1513TR2Kzkupr6FyVELuyjF2a4mAXnRzPeVDN`

All 289 signatures and Explorer links are in [finalized-receipts.csv](../artifacts/readiness/controlled-upgrade/execution/finalized-receipts.csv).

Independent evidence: `artifacts/readiness/controlled-upgrade/independent-finalized-verification.json` and `recovery-verification.json`. The latter verifier checks the complete finalized signature set, critical transaction balances, source receipt fees and unchanged application state using read-only Devnet RPC calls.

## Preservation and boundaries

Previous executable retained unchanged at `artifacts/devnet/fee-65-35/jeet_launch_custody.so`, SHA-256 `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa`. Any rollback would require another separately authorized upgrade.

No Mainnet activity, public liquidity migration, new token, trading, funding transfer, or treasury claim occurred during this recovery. Public lifecycle/migration acceptance remains separately gated; this report confirms the program upgrade, not new public migration testing.
