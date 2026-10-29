# CPMM readiness: verified observations and unresolved integration

This is not a migration implementation or production venue approval. No pool was
created, no token/SOL deposit occurred, no LP token was burned, and no Devnet
transaction was signed. All public-chain requests below were read-only.

## Official interfaces inspected

Raydium source pinned at `f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5`:

- [initialize.rs](https://github.com/raydium-io/raydium-cp-swap/blob/f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5/programs/cp-swap/src/instructions/initialize.rs)
- [lib.rs](https://github.com/raydium-io/raydium-cp-swap/blob/f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5/programs/cp-swap/src/lib.rs)
- [pool.rs](https://github.com/raydium-io/raydium-cp-swap/blob/f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5/programs/cp-swap/src/states/pool.rs)
- [config.rs](https://github.com/raydium-io/raydium-cp-swap/blob/f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5/programs/cp-swap/src/states/config.rs)
- [oracle.rs](https://github.com/raydium-io/raydium-cp-swap/blob/f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5/programs/cp-swap/src/states/oracle.rs)
- [Official address reference](https://github.com/raydium-io/raydium-docs-v1/blob/main/reference/program-addresses.mdx)
- [Official IDL](https://github.com/raydium-io/raydium-idl/blob/master/raydium_cpmm/raydium_cp_swap.json)

Source IDs: mainnet `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`;
Devnet `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`. No mainnet write occurred.
Current initialize discriminator `[175,175,109,31,13,152,155,237]` accepts two raw
u64 deposit amounts and open_time. Account validation includes mint ordering,
config, authority, pool, LP mint, vaults, observation, fee receiver and programs.
Source visibility/IDL agreement is not deployed-bytecode equivalence.

Observed source behavior: deposits determine the vault ratio; initial liquidity
is integer sqrt(vault0*vault1); the creator receives liquidity minus100 LP units.
That minimum 100 is **not** proof that the entire initial deposit is permanently
committed. The prospective JeeT transaction must burn all initially withdrawable
LP tokens, verify the resulting SPL supply/account balances and CPMM lp_supply,
and ensure no principal-release instruction exists in JeeT. Later third-party
liquidity must receive only its own mathematically funded entitlement. No NFT
burn or unverified LP-Lock program is substituted for this proof.

The initializer charges AmmConfig.create_pool_fee from its creator payer. Rent
and fee funding must be separate from the token/SOL liquidity amounts. It also
sets an immediate/past open_time to current block timestamp+1: pool creation does
not promise swaps in the same timestamp. Pool status/admin controls and future
upgrades are additional availability/trust assumptions.

## Actual read-only Devnet observation (2026-10-29)

At context slot 516545377, the documented Devnet program was executable and owned
by BPFLoaderUpgradeab1e11111111111111111111111. ProgramData:
`3KvTa2fYhMxMZNfHho5oX34yLQLwRauoU2JScBkugvXF`; deployed slot 515685818;
active upgrade authority `DRayw6sn9fCvbhx5ZLtAVGAgAk6qAAX7UT7urzkXTeM5`.
ProgramData account bytes 1,766,685; entire account SHA256
`01b9ace4c0d11d2847b7b53d45fa009d07bbc9fdb235f4a44209adb2ef96466c`.
This account hash includes loader metadata; it is **not** a reproducible ELF hash
or proof of correspondence to the inspected source. It can change after upgrade.

Derived Devnet config 0 `["amm_config", u16_be(0)]`:
`5MxLgy9oPdTC3YgkiePHqr3EoCRD9uLVYRQS2ANAs7wy`,236 bytes, owned by the program.
Checked source layout yields trade_fee_rate2500/1,000,000, protocol_fee_rate120000,
fund_fee_rate40000, create_pool_fee150,000,000 lamports, creator_fee_rate2500,
creator_fee_share_rate0. These are observations, not JeeT-approved DEX economics.
The selected initializer/pool's creator-fee enable flag must also be validated.
No post-migration JeeT75/25 collection is claimed.

## Numerically bounded setup funding

Fresh Devnet RPC rent quotations, raw lamports (not local Agave2.3 rent constants):

| Account size | Rent exemption |
|---|---:|
| SPL mint82 | 1,066,800 |
| SPL token account165 | 1,488,440 |
| Pinned CPMM PoolState637 | 3,886,200 |
| ObservationState4075 | 21,351,240 |

For standard SPL tokens with no extensions: two pool vaults+creator LP ATA (3x165)
+LP mint82+pool637+observation4075 =30,769,560 rent lamports. Config0 fee150,000,000
makes180,769,560 (0.180769560 SOL). One new wrapped-SOL source ATA adds1,488,440:
182,258,000 (0.182258000 SOL). This is a conditional fresh-account subtotal;
it excludes signatures/priority/compute fees, extra preparation accounts, caller
funding, existing V5 account rent, and any different live config/cluster rent.
No pool-creation transaction confirmed these deductions. Query/validate funding
again at execution and enforce a separately disclosed maximum setup budget.

A permissionless external payer is a possible policy, not an activated mandatory
charge. Source reserve R cannot pay setup while curve sells remain enforceable.
Fee liabilities cannot pay it at any time. No creator subsidy, platform subsidy,
creation fee or migration fee is assumed. Refund destination/rules for unused
setup funds must be explicit and cannot become a launch-principal withdrawal path.

## Atomic terminal transaction is unverified

The necessary asset-moving transaction would have to validate completion, fresh
curve/fee state and pool derivations; wrap exactly eligible SOL, transfer the
exact reserved tokens, invoke pool initialization, burn all initial withdrawable
LP tokens, verify pool/LP/vault postconditions, then irreversibly mark Migrated.
All steps must roll back together if any CPI/burn/postcondition fails. A separate
system-owned signer PDA/preparation may be needed for CPMM's System Program fee
payer; a program-owned state account with data cannot simply be used as a System
transfer payer. This has not been implemented/tested.

No measured terminal compute consumption, transaction wire size, account locks,
loaded data, CPI depth or public-network version compatibility is available.
Legacy/v0 wire limits differ from modern transaction versions; the older local
Agave2.3.13 regressions cannot prove modern public-cluster transaction support.
Do not infer feasibility from account-count estimates or available ALTs alone.

If preparation is split out, it may not move launch principal, terminate sells,
or grant withdrawals. Active/Eligible V5 keeps all redemption backing until an
atomic asset/LP/cutoff step is proven. Without that proof, migration stays disabled.
Public liquidity permanence also depends on external/JeeT upgrade authority and
AMM admin controls, even after LP burn. An internal test is not an independent
security audit or an absolute guarantee against program upgrades.

## Source compilation evidence

The pinned official source builds with --locked under the separately recovered
modern SBF tools (see RECOVERY.md). Source-build SHA256:
9e8b612bac22a1de528b564778670015a1d6ae6020feb4bb1081ccdd8affa09c.
No Raydium source or dependency constraint was patched; its checkout remains clean.
This is a real successful SBF compilation, not a claimed pool or JeeT migration
execution. Deployed-bytecode equivalence, complete CPI/LP tests and transaction
feasibility remain unresolved.
