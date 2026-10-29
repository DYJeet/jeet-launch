# Real CPMM local execution checkpoint

Starting GitHub main:0a6c324a95772978389faf61b92b258fbfcb52b5. The owner's latest
directive authorizes reversible implementation/test decisions and the rising V5
development reference. Earlier requests to re-approve routine granularity or
local integration choices are superseded. Production funding, mainnet operations,
live authority changes and public launch remain outside this authorization.

## Executed, not simulated

Official Raydium source commit f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5 builds
unchanged with its Cargo.lock, Devnet feature and explicit SBF v0 ABI. The modern
compiler/platform-tools1.57 supports its edition2024 dependencies. Agave4.4 cannot
start in this sandbox because io_uring is unavailable; v3 ELF cannot load in the
legacy validator. Explicit supported v0 output runs successfully on Agave2.3.13.
No compiler integrity checks or program assertions were weakened.

The integration runner loads that genuine AMM SBF at the official Devnet ID,
DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb, in a disposable LOCAL validator.
AmmConfig, native mint and fee receiver are explicit local genesis fixtures;
admin config initialization is not tested. No AMM instruction or RPC economic
result is mocked, and no public Devnet transaction is claimed.

A genuine transaction initializes a pool with1,000,000,000,000 token base units
(decimals9) and1,000,000,000 wrapped lamports, then burns the complete initially
withdrawable LP amount before that transaction commits. Assertions inspect both
actual pool vault balances, LP mint supply0, holder LP amount0, LP authority,
CPMM's retained liquidity-accounting denominator and disabled creator-fee flag.
Source pool LP accounting retains the burned shares; the source's minimum100
units alone would not have protected all initial principal.

The initializer/burn transaction is919 wire bytes in the executed v0 transaction.
Its measured compute units are recorded per run in cpmm-local-evidence.json;
they vary with generated mint addresses. This proves that standalone operation,
**not** a combined JeeT final-buy/migration CPI transaction.

The test then executes real AMM buy and sell swaps after the burn. Final token
balances reconcile exactly to2,000,000,000,000 base units; owner+pool wrapped-SOL
balances reconcile exactly to2,000,000,000 lamports. AMM swap fees remain in those
accounts and their program accounting; no fee extraction is simulated.

The150,000,000-lamport config fee is paid separately from liquidity. On this local
validator the six new pool/mint/ATA/vault/observation accounts cost42,156,720 rent
lamports. The caller's exact debit is192,156,720, excluding network fees paid by a
separate sponsor. This differs from previously quoted public Devnet rent, as
expected; production must query/enforce the cluster's actual rent and live config.
These costs are test-funded, not evidence of a self-funding JeeT graduation model.

Five actual failed transactions prove unchanged protected balances/state:

- Creator withdrawal after burning LP: Anchor2506.
- Unauthorized LP remint: SPL4.
- Duplicate pool initialization: System0.
- Substituted LP mint: CPMM6004.
- Impossible minimum-output swap: CPMM6005.

All historical local suites and the existing V5 suites run separately. No JeeT
financial program source changes are included in this standalone AMM checkpoint.

## Scope of the permanence proof

Initial LPs cannot be used by the creator to withdraw through the tested protocol
path after burn. Fresh local genesis loads the AMM with upgrades disabled. Public
Devnet's program is upgradeable; no deployed-bytecode equivalence or unconditional
protection against future external upgrades is claimed. An independent audit must
review upgrades, admin controls, future liquidity deposits, protocol fee claims,
and all relevant withdrawal paths before production policy can be certified.

The next implementation must bind pool creation and LP burn to JeeT custody,
keep redemptions available until success, protect fee liabilities, and fund setup
separately. This checkpoint does not claim a JeeT migration or full launch lifecycle.

## Reproduce

```bash
bash scripts/recover-solana-tools.sh
source scripts/solana-tools-env.sh
npm run amm:build:local
npm run test:amm:cpmm
```

Source/vendor/tool outputs remain under ignored programs/launch-custody/target.
No deployment, production token, real SOL transfer or authority revocation occurs.
