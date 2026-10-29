# OWNER APPROVAL REQUIRED — V5 economic recommendation

Start: d53eb51a042144bebdd54c25e28dcf37e268c239. This is a proposal and
mathematical reference, not a V5 program, pool, deployment or liquidity lock.
It supersedes earlier undecided V5 design alternatives only if approved.

## Exact recommended decisions

1. Preserve creator policy: configurable 0–500 bps maximum, recommend **100 bps
   (1%) default**. Round creator allocation down to whole tokens. This default
   is proposed, not inferred from earlier test fixtures.
2. Split the remaining whole-token supply **50% trading / 50% migration**.
   Reject a configuration with an odd remaining whole-token count; do not mint,
   confiscate or silently round the extra token into a different allocation.
   At an exactly representable 1% creator allocation: **1% / 49.5% / 49.5%**.
3. Use the existing curve formula with **slope D=0**, a constant-price fair sale.
   This intentionally gives up increasing marginal prices for new V5 launches.
   V1–V4 price progression and liabilities do not change. Do not market V5 as an
   increasing-price curve if this recommendation is approved.
4. Recommend a **50 SOL target** for the graduation SOL side, with price
   P=ceil(50,000,000,000 / Bwhole) lamports per whole token. This target is an
   economic recommendation, not a mathematical optimum or promised market cap.
5. Curve buys/sells accept **whole-token lots** only (n divisible by q=10^decimals).
   Ordinary SPL transfers remain unrestricted and untaxed. Fractional tokens can
   trade on the AMM after graduation or be aggregated into whole redemption lots.
6. Graduation is the **final buy plus pool initialization plus complete initial
   LP burn in one atomic transaction**. Only confirmed Migrated ends curve sells.
   A failed final buy/migration rolls back in full; earlier holders can still sell.
   There is no persistent completed-but-redemptions-disabled waiting state.
7. All accounted curve principal X and all migration tokens M enter the pool.
   Fee liabilities and rent do not. Caller separately funds disclosed external
   pool setup/rent; no additional JeeT migration fee. No platform/creator LP yield
   entitlement is added. External setup sponsorship is explicit, never hidden.

Approval is required for all seven choices, especially the flat price, whole-token
lots, allocation, target depth and prospective redemption cutoff. These parameters
are not activated. If atomic pool creation/burn cannot fit verified transaction
limits, this proposal cannot launch as written: return for a revised terminal
contract, never silently disable sells or implement a non-atomic fund release.

## Parameter domain and exact partition

Let q=10^d, d integer 0..9, S raw issued base units, W=S/q whole tokens.
Require S in [1,2^64-1], S divisible by q, creator bps c in [0,500].
Awhole=floor(W*c/10000), N=W-Awhole. Require N>=2 and even.
A=q*Awhole; B=M=q*N/2. Therefore A+B+M=S exactly.
The smallest valid supply is two whole tokens at c=0; a proposed 1% creator
allocation may round to zero on small supplies and must be displayed as such.
Maximum supply is floor((2^64-1)/q)*q, additionally constrained by partition parity,
checked completion principal, supported AMM amounts and actual rent/compute limits.
Not every value below the numerical maximum is a valid launch configuration.

Compute P=ceil(T/Bwhole), T=50,000,000,000; X=P*Bwhole, using checked u128
intermediates and u64 outputs. Reject invalid flags, zero values, overflow or
unsupported token standard. For generalized user target T>0 the same domain and
checks apply, but changing the recommended target requires explicit disclosure.
For the proposed fixed T: T<=X<T+Bwhole. These are conditional mathematical
amounts **if the sale completes**, not a guarantee that demand will complete it.

| Supply / decimals | Creator raw | Curve raw = migration raw | P lamports/token | X lamports |
| --- | ---: | ---: | ---: | ---: |
| 1,000 / 0 | 10 | 495 | 101,010,102 | 50,000,000,490 |
| 1,000,000 / 3 | 10,000,000 | 495,000,000 | 101,011 | 50,000,445,000 |
| 1,000,000,000 / 9 | 10,000,000,000,000,000 | 495,000,000,000,000,000 | 102 | 50,490,000,000 |

For the billion-token example: S=10^18 raw, 10 million creator tokens,
495 million sale tokens, 495 million migration tokens; pool SOL side 50.49 SOL.
One full buy pays raw 50.49 SOL + total trading fee 0.5049 SOL = 50.9949 SOL,
excluding separately funded rent/setup/network fees. Platform entitlement is
378,675,000 lamports and creator entitlement 126,225,000 for that one trade.

## Fees and immutable entitlements

Retain 75 bps platform / 25 bps creator, nominal total 100 bps. Total fee is
ceil(raw/100); use the verified V4 lifetime 3:1 allocation carry so components
sum exactly to the charged total. Claims do not reset the carry. Platform
beneficiary remains HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP; creator
entitlement remains the immutable launch creator. Separate fee PDAs and signed,
bound-destination claims survive graduation unchanged. Creation platform fee is
zero; network, rent and external pool setup costs remain separate.

## Reserve and supply proof

The implemented V4 raw pricing is
ceil((P*n*q + D*(s*n+n*(n-1)/2))/q²), with inverse floor over [s-n,s).
With D=0 and n a multiple of q, both equal exactly P*n/q.
Inductively for every Active state: R=P*s/q. Buy adds raw and s; sell subtracts
the same raw and s. Thus a worst-case full redemption costs exactly R, never
fees or rent. Arbitrary wallet ordering, partial returns, resale and segmentation
cannot change this equality. Checked limits fail before accepting an invalid
transition; actual transaction rollback still needs on-chain implementation tests.

Before terminal settlement migration-designated SOL is **zero**: the same R must
not simultaneously be called available migration liquidity. In the atomic final
transaction, s reaches B and R=X. The pre-approved prospective contract replaces
curve redemption with an established AMM exit at the same raw opening ratio.
Only upon successful pool deposit AND verified LP disposition does R become zero
and migration principal become X. It is a state-contingent reclassification, not
a second liability. No V4 claim is extinguished. There is no guaranteed future
fixed-price redemption once AMM trading begins; normal AMM price impact applies.

Physical token invariant: outside holdings H + tradable custody V + reserved
migration custody M = S; while Active, H=A+s and V=B-s. A is the original
allocation, not necessarily the creator's current wallet balance. Creator tokens
are fungible and transferable/sellable; gross wallet purchase allowances never
reset. Returned/resold tokens are already in V or H and are not counted again.
After graduation: outside holdings A+B plus pool tokens M = S. Actual account
balances, rather than allocation labels, must be asserted in implementation.

Let U be cumulative fee-inclusive buys, Z cumulative net seller payouts,
Fp/Fc accrued fee entitlements, Wp/Wc withdrawals, Lp/Lc claimable amounts,
and G the committed pool SOL. Trading identity:
U = Z + R + G + Fp + Fc; Fp=Wp+Lp; Fc=Wc+Lc.
Active: G=0. Migrated: R=0, G=X. Rent, setup and network costs are separately
funded, not part of U. Actual program SOL equals relevant accounted assets plus
rent and separately measured unsolicited residuals. Donations are not quote
principal, fee entitlement or a refund promise; retain them as explicitly tracked,
non-withdrawable residuals, with no admin sweep. Do not let donations change price
or make migration fail merely because an account contains excess SOL.

## Threshold and terminal behavior

Recommended combined check: next net sold=B AND tracked raw reserve=X AND intact
reserved M AND all canonical pool/LP/CPI conditions. An inventory-only trigger is
mathematically equivalent under R=P*s/q but would omit defense-in-depth validation.
A reserve-only trigger is unsafe if actual SOL donations are mistaken for buys.
A percentage below 100% of B leaves unsold inventory and requires an additional,
unapproved disposition; reject that alternative for this profile.

Before the final buy, all ordinary valid sells remain available, including while
a caller prepares a migration transaction. Concurrent buys/sells serialize through
a monotonic state sequence. If a sell wins, the terminal transaction must fail
stale conditions and release no assets. If the final transaction wins, subsequent
curve buys/sells fail Migrated. There is no admin early graduation route. A failed
CPI or LP burn must roll back payment, token delivery, fees, cap receipts, pool
creation, wrapping SOL and state. There is no persistent recoverable failure flag
from a failed atomic instruction; display failure from transaction evidence.

The terminal final buy is permissionless but still requires a purchaser of the
remaining lot and a payer for external setup costs. A venue can deny service or
require setup funds; liveness and transaction fit are not mathematically proven.
This proposal does not claim a free standalone graduation crank for a previously
closed completed state. Supply/caps/opening settings and terminal policy must be
immutable/disclosed before launch and repeated in the pre-sign quote screen.

## Opening prices, depth and arbitrage

Curve marginal and raw executed buy/sell prices all equal P per whole token.
Fee-inclusive amount for k tokens: buy P*k+ceil(P*k/100), sell
P*k-ceil(P*k/100), using the existing lifetime 3:1 allocation carry. At P=102,
one-token buy costs 104 lamports, redeem returns 100; splitting can increase fees.
If raw=1 lamport, fee=1: zero-net sells reject as in V4; quote dust restrictions
explicitly rather than promising a one-lamport net redemption.

Initial pool ratio is X/Mraw=P/q exactly. This requires actual post-CPI vaults
receive X and M without deduction. Caller-funded setup costs and a clean pool
are essential. Foreign donations/preexisting pools or token transfer fees cannot
be silently included; canonical pool identity and net deposits need verification.
Minimum internally consistent lots are Bwhole=Mwhole=1; actual venue minimum LP,
rent and limits can raise this minimum and must be checked before enabling a
configuration. No claim that 50 SOL is sufficient for every trading size is made.

For an ideal zero-fee constant-product pool and a sell of a*M tokens, output is
X*a/(1+a), average price P/(1+a), terminal spot P/(1+a)^2. At a=1%, average
impact is 0.990099P and terminal spot 0.980296P; at 10%, 0.909091P and 0.826446P;
at 50%, 0.666667P and 0.444444P. Real AMM fee/rounding worsens seller output.
These are rational model comparisons, not executable AMM quotes. There is no raw
opening discontinuity to exploit; creator selling, demand and AMM fees still
move price. A large final curve buy executes at P, without a final-buyer discount.

## Alternatives (all unapproved)

Default 1% creator; values below split the other 99%:

| Configuration | Curve / migration % of total | SOL at completion | Raw AMM/curve spot | Assessment |
| --- | --- | --- | --- | --- |
| Recommended constant price, 50/50 remainder | 49.5 / 49.5 | P*Bwhole >= target | 1 | Simplest exact solvency/continuity; sacrifices rising curve and limits curve lots |
| Constant price, 60/40 remainder | 59.4 / 39.6 | P*Bwhole | 1.5 | Funded but 50% upward opening gap; early buyer advantage/arbitrage pressure |
| Constant price, 80/20 remainder | 79.2 / 19.8 | P*Bwhole | 4 | Funded but 300% gap and shallow token side; not recommended |
| Rising linear curve, calibrated M | Derived, not a fixed percentage | ceil(F(B)) plus path rounding | Requires M approximately F(B)/p_final | Preserves progression; coupled allocation/price and rounding policy more complex |
| Existing V4 full redemption rights | No reserved M | May have zero spare SOL | Undefined | Nonviable for this migration; preserve legacy backing |

For positive slope, equal B/M generally opens near the average rather than final
marginal price, potentially almost 50% below final marginal in slope-dominated
large sales. A universal Pump.fun percentage cannot solve arbitrary P,D,S.

## AMM / permanent liquidity feasibility

Preferred candidate: Raydium cp-swap fungible-LP constant-product pool. Official
source has initialize and LP-based withdrawal interfaces. Proposed method: mint
initial withdrawable LP into a program-controlled account, burn its entire amount
with the actual SPL token program in the same transaction, verify LP balance zero,
unchanged pool vault assets and no alternative authority/recovery withdrawal path.
Account for protocol minimum locked LP separately. This is conditional design,
not evidence that a particular deployment is safe or immutable.

Primary sources inspected:
- https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/initialize.rs
- https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/lib.rs
- https://github.com/raydium-io/raydium-idl/blob/master/raydium_cpmm/raydium_cp_swap.json
- https://github.com/raydium-io/raydium-docs-v1/blob/main/reference/program-addresses.mdx
- Alternative concentrated-liquidity implementation: https://github.com/orca-so/whirlpools

Burn & Earn adds a lock contract and fee-key rights requiring separate review;
not selected. Concentrated-liquidity/NFT positions require proof of position
withdrawal authorization and valid full-range management; NFT destruction alone
is not accepted. No external source/IDL revision has been deployment-pinned and
no CPI, program ID, LP burn or pool has been independently verified here. Upgrade
and protocol-admin trust remain material. No post-graduation 75/25 fees are claimed.

## Verification and exact limits

scripts/test-v5-economics.mjs is an independent, non-activating integer economic
reference. Seven test groups cover partition examples, u64/creator/parity limits,
10,000 mixed buy/sell steps, terminal rollback model, lots/dust/overflow, fee/rent
separation and alternative opening ratios. It models atomic rejection by validating
before commit; it does not prove Solana CPI atomicity or real multiwallet/concurrent
execution. The existing V4 implementation remains the only verified transaction
engine. Do not label this as an on-chain V5 implementation.

Current runtime: Node 24.22.1/npm 11.9.0. Rust/Cargo/Solana SBF/local-validator
executables from the prior session are absent again. Therefore native/SBF/validator
regressions cannot be rerun here; previous checkpoint results remain historical,
not fresh verification. No V1–V4 production financial source is changed.
Run results and build evidence accompany this document. A design-only checkpoint
must state this limitation and must not be promoted as a verified program release.

## Owner decisions and implementation sequence

Approve or reject: 1% default (0–5% policy retained), equal remainder partition,
constant price D=0, 50 SOL target with integer price ceiling, whole-token lots,
atomic final-buy cutoff, caller-paid external costs, permanent full LP burn and
non-withdrawable unsolicited residual treatment. None is active today.

Then: pin/review venue and deployment authorities; verify transaction fit and
minimum LP; restore complete toolchain; implement opt-in V5 initialization/PDA
partition; buy/sell/cap/fee compatibility; atomic graduation and post-CPI proofs;
SDK/disclosures; full legacy/new validator regressions; real Devnet lifecycle;
independent professional audit and explicit deployment approval. If atomicity
cannot be achieved, stop activation and seek approval for a revised contract.
