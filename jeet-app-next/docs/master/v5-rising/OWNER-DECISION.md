# OWNER APPROVAL REQUIRED — rising V5 proposal

Parent: 3905603fdfd294385ba06d111c6ff8e00bbc9c12. The prior flat-price
proposal is a comparison baseline only, not approved. No V5 parameter is active.
This document is economic design; it does not implement on-chain V5 or migration.

## Recommended representative launch

- Supply: 1,000,000,000 tokens, nine decimals, S=10^18 base units.
- Creator: default 1%, configurable 0–5%; A=10,000,000 tokens (10^16 raw).
- Curve: 59.4%, B=594,000,000 tokens (594,000,000,000,000,000 raw).
- Migration: 39.6%, M=396,000,000 tokens (396,000,000,000,000,000 raw).
- Curve trade lot: 1,000 tokens = 10^12 raw; 594,000 sale lots.
- Starting lot price: 42,000 lamports; ending lot price: 126,000 lamports.
  Per token these are 42 and 126 lamports (3x growth).
- Exact completion principal: **49,896,296,996 lamports = 49.896296996 SOL**.
- Initial ideal pool ratio: 49,896,296,996 / 396,000,000 lamports/token,
  approximately 126.00074999 lamports/token.
- Permissionless final buy atomically establishes the pool and burns all initial
  withdrawable LP. Sells cease only when that entire transaction succeeds.
- Caller separately pays disclosed external initialization costs/rent. No JeeT
  migration fee. No platform or creator fee principal funds pool initialization.

These are proposed values. The 3x growth and roughly 50 SOL depth are policy
recommendations, not mathematical necessities or guaranteed demand/market cap.
Approve them together with the terminal contract, lot granularity, partition and
opening-price tolerance before any implementation can activate them.

## Derivation rather than copied allocations

For a continuous linear marginal curve starting a and ending g*a, average price
is (1+g)*a/2. Opening-price continuity requires M/B=(1+g)/(2g).
Thus g=3 implies B:M=3:2 of the non-creator supply; g=5 implies B:M=5:3.
Flat g=1 gives B:M=1:1, explaining the earlier flat allocation.

A naive independently rounded linear buy integral preserves V4 solvency but
accumulates path-dependent rounding surplus. A rounded cumulative quadratic
potential removes that surplus but can make adjacent executed unit prices dip
by one lamport. Recommended V5 instead uses **monotone integer marginal lots**
and their exact cumulative sum. It is a stepwise approximation to a linear
curve, not a claim of a strictly increasing price on every smallest token unit.

Let K=B/lotRaw=594000, i a net-sold lot index 0..K-1, L=K-1.

```
p(i) = 42000 + ceil(84000*i/L)           # lamports per 1000-token lot
G(s) = 42000*s + sum(i=0..s-1, ceil(84000*i/L))
buy(s,n) = G(s+n)-G(s)
sell(s,n) = G(s)-G(s-n)
```

Compute the sum with Euclidean floor-sum in O(log L):
G(s)=42000*s+floorSum(s,L,84000,L-1), where floorSum is the sum of
floor((a*i+b)/d). The reference tests compare it to brute-force integer sums.
Checked u128 intermediates/u64 outputs are mandatory in eventual Rust. Overflow
rejects; no floating point or unbounded loop over purchased tokens is permitted.

The staircase gives 84,000 one-lamport lot-price increments, roughly one per
seven lots. Its initial increment is 1/42000 of a lot price. Quotes remain in
SOL/token amounts; users need not enter internal lot counts.

## Domain and supply equations

q=10^decimals, decimals 0..9. S must fit u64 and be divisible by q.
Awhole=floor((S/q)*creatorBps/10000), creatorBps in [0,500].
N=S/q-Awhole must be divisible by 5000 for this fixed 1000-token lot profile.
Bwhole=3N/5, Mwhole=2N/5, A=q*Awhole, B=q*Bwhole, M=q*Mwhole.
Reject inadmissible supply/creator combinations visibly before signing; do not
silently change supply, creator allocation or lot size. This is the consequence
of exact whole-lot partitions, and is a UX tradeoff requiring approval.
For default 1% creator rounding, 5,050 whole tokens gives Awhole=50,N=5000;
smaller supplies may be valid for another allowed creator setting (e.g. 5000
whole tokens and zero creator allocation). The reference partition primitive
also tests smaller algebraic cases; only the recommended profile adds lot checks.

Maximum numerical S is floor(u64MAX/q)*q, further restricted by N granularity,
G(K) fitting u64, fee-lifetime limits, checked intermediate arithmetic and actual
venue limits. It is incorrect to promise every u64 supply is supported. Quote
construction must validate the entire chosen launch configuration, not just S.

Before graduation, actual outside holdings H plus trade custody V plus reserved
custody M equals S. H=A+s*lotRaw; V=B-s*lotRaw. A denotes original allocation,
not the creator's current wallet balance: creator tokens are fungible and may be
transferred or sold. Returned inventory is already in V, never added twice.
After graduation H=A+B and the pool contains M. No further minting occurs.

## Solvency and non-overlapping liabilities

Starting R=0, every buy changes reserve by G(s+n)-G(s); every sell subtracts
G(s)-G(s-n). Therefore R=G(s) exactly for any valid ordering and segmentation.
Full redemption costs G(s), partial redemption costs at most that. Minimum lot
raw price is 42000, so all allowed profile sells have positive net output after
1% fees. Fractional holder lots can be transferred/aggregated or traded through
the AMM later; they are not independently curve-redeemable. Disclose this clearly.

Before atomic graduation, all R is redemption backing and **zero** is independently
migration-eligible. After successful terminal settlement, the prospective contract
ends curve redemption and X=G(K) is committed pool principal. There is no moment
in an observable successful state where the same SOL backs both claims.
This is a rights transition for NEW V5 launches; it requires approval and explicit
pre-launch/pre-trade disclosure. It never applies to V1–V4.

Let U be fee-inclusive buys, Z net seller payouts, R current curve reserve, X
committed migration SOL (zero before success), Fp/Fc lifetime accrued fees:
U = Z+R+X+Fp+Fc; Fp=withdrawnPlatform+claimablePlatform, likewise creator.
Rent, external setup funding and network costs are separate inputs/uses. Claims
never decrease R. Fee carry remains V4 ceil(raw/100) total with lifetime 3:1 split,
75-bps platform and 25-bps creator nominal rates. Treasury stays
HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP. Creation platform fee stays zero.

Unsolicited deposits are separately measured residuals, not fees or quote principal.
They cannot inflate progress, alter price, trigger eligibility, or be swept by
an admin. Their permanent non-withdrawable residual treatment needs disclosure;
do not promise refunds to unidentifiable senders. Actual balance reconciliation
must include these residuals and rent, not discard them from asset equations.

## Exact threshold, cutoff and failures

Final eligibility: next net sold lots=K, tracked R=G(K), intact M in reserved
custody, valid immutable venue/configuration/pool/LP accounts, valid opening/cap
rules and nonce, and sufficient separately supplied setup costs. Completion below
K or using gross buy volume is invalid. Donations or wash volume do not substitute
for net sold. An initial LP burn alone is not proof of correct pool reserves.

Prefer one transaction containing final payment/delivery, pool creation/deposit,
LP disposition and post-CPI verification. Only confirmed Migrated ends curve buys
and sells. InProgress/Completed are transaction-local conditions, not a persisted
closed market. A separate indexer may display the attempted graduation as pending.

Final buy, pool setup, LP burn, insufficient setup funds, stale account, compute
exhaustion or oversize failure must release no assets and leave existing holders'
redemptions available. A failed instruction cannot persist a recovery flag while
also rolling back all writes. Failure status comes from transaction evidence.
If a seller wins the race, the final quote is stale; if graduation wins, later
curve sells reject Migrated and users retain tokens for AMM trading. Multiple
final buyers cannot graduate twice. No creator/admin override or privileged
redemption exists. Claims survive migration with isolated beneficiary rights.

Atomic feasibility is **not proven** by this economic model. If it cannot fit
Solana transaction/account/compute limits, do not activate this terminal contract.
A safe non-atomic fallback requires distinct approval: continue Active sells while
performing idempotent preparation that transfers no launch assets and grants no
LP rights, then still perform the asset/cutoff step atomically. If even that final
step cannot be atomic, stop migration rather than promise an unbacked closed state.
Protocol outages can indefinitely delay graduation; fail closed, not confiscate.

## Pricing, fees, depth and discontinuity

First lot raw buy/sell 42000; buy including fee 42420; net sell 41580.
Final lot raw 126000; buy including fee 127260; net sell 124740.
The final large trade average is [G(K)-G(K-n)]/n and is lower than final marginal
for n>1. That is normal rising-curve entry advantage, not a hidden final subsidy.
Exact slippage/max spend/min proceeds and nonce remain on-chain requirements.
The full-supply raw buy costs X; its total fee is ceil(X/100)=498962970 lamports;
full expenditure is 50395259966 lamports, excluding rent/setup/network fees.

Without integer staircase rounding, reserve would be 49896000000 lamports.
Exact sum adds 296996 lamports deterministically, independently of trading path.
The pool/last marginal relative gap is exactly 296996/49896000000,
approximately +0.00059523% (0.059523 basis points). Proposed maximum tolerance
is +0.0012% (0.12 basis points) for this representative profile, checked as a
rational inequality; other supplies require recomputation, not copied tolerance.
No arbitrary SOL/token adjustment is used to manufacture continuity.

Pool SOL depth is conditionally 49.896296996 SOL, token depth 396 million tokens.
For an ideal zero-fee constant-product pool, a sell of fraction a of initial
pool tokens returns X*a/(1+a), average price p/(1+a), final spot p/(1+a)^2.
At 1%,10%,50% sizes, average factors are respectively 100/101,10/11,2/3;
final spot factors are 10000/10201,100/121,4/9. These are exact rational model
bounds; real venue fees/rounding worsen output. A SOL buy of a*X has the symmetric
reserve-ratio price impact. Actual AMM quotes, fee tier and UI slippage must come
from the verified pool, not these ideal formulas.

The last-lot fee-inclusive buy is above opening raw pool price, so this tiny
upward gap alone does not make a last-lot round trip profitable, even before
AMM fees. Earlier buyers and free creator tokens can profitably sell; permanent
liquidity does not prevent price declines, Sybil wallets or creator selling.

## Comparison: all configurations unapproved

Representative billion-token supply, 1% creator, 1000-token curve lots:

| Model | Curve / migration | Start / end lamports per token | Growth | Exact completion lamports | Pool raw price | Tradeoff |
| --- | --- | --- | --- | ---: | --- | --- |
| Prior flat baseline | 49.5% / 49.5% | 102 / 102 | 1x | 50490000000 | 102 | Exact continuity, no rising-price experience; not approved |
| Recommended 3x integer linear staircase | 59.4% / 39.6% | 42 / 126 | 3x | 49896296996 | 49896296996/396000000 | Small deterministic gap; O(log K) potential |
| 5x integer linear staircase | 61.875% / 37.125% | 27 / 135 | 5x | 50119059374 | 50119059374/371250000 | More early/late price dispersion; same solvency/complexity, less token depth |

All three use the same telescoping integer accounting. At any Active state the
maximum aggregate gross redemption is its entire R; none has spare principal
while sells remain promised. Graduation funding is conditional on net completion,
not guaranteed demand. The 5x version has relative opening gap exactly
309374/50118750000, about +0.0006173%. Continuous quadratic potentials are simpler
O(1) but their rounding can break executed unit-price monotonicity; exponential
or virtual-constant-product designs add calibration and division edge cases without
solving the prospective redemption cutoff. The recommended modest 3x progression
is a policy judgment balancing familiarity, price dispersion and maintainability.

## Venue and liquidity permanence feasibility

Raydium cp-swap is a candidate because official source exposes real pool
initialization, token vaults and fungible LP mint/withdrawal paths:
https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/initialize.rs
https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/lib.rs
https://github.com/raydium-io/raydium-cp-swap/blob/master/programs/cp-swap/src/instructions/withdraw.rs

Before selection: pin source/IDL/deployment, validate canonical pool/token order,
SOL wrapping, exact received amounts, mint/transfer standards, pool-creation charge,
rent, minimum locked LP and current protocol authorities. Proposed full LP burn
must destroy all initially withdrawable fungible LP without calling the AMM
withdrawal instruction. Verify pool assets remain, launch LP balance is zero and
no alternate authority can release principal. Protocol minimum LP accounting and
upgrades still need review. Do not substitute an NFT burn or frontend lock flag.
No venue deployment, CPI transaction size, pool setup amount, Devnet execution or
permanent lock has been verified in this assignment. These are blockers to
activation, not gaps filled with fake liquidity tests. Caller-funded external
costs are variable and must be quoted before the final signature; no fee tier or
post-graduation platform/creator revenue is assumed.

## Verification scope and approval

Seven deterministic reference-test groups include brute-force floor-sum comparison,
monotone pricing, exact representative balances, 20,000 mixed ordering steps,
threshold/terminal failure model, boundary/overflow and alternative configurations.
They do not execute Solana instructions, real concurrent wallets or AMM CPIs.
Those require the eventual program and full validator/Devnet adversarial suites.

Approve or reject: this exact supply split and representative start price/growth,
1000-token lots and admissible supply granularity, prospective atomic final-buy
cutoff, rational opening-gap tolerance, full initial LP burn, caller-paid setup,
and explicit unsolicited-residual treatment. Approved platform fees, default 1%
creator policy and all historical obligations remain intact. Independent audit
and explicit deployment approval are still required after implementation.

### Transaction-format compatibility finding

Official Solana references distinguish legacy/v0 (1232-byte transactions) from
opt-in v1 (4096 bytes, different inline account/resource configuration). Our
historical Agave 2.3.13 local profile and explicit v0 fixtures do not establish
modern v1 compatibility. The nominal maximum compute budget is 1.4 million CU;
actual migration must be serialized, simulated and measured under the selected
cluster/wallet/format, not assumed to fit based on protocol documentation.
Sources: https://solana.com/docs/core/transactions/versioned-transactions and
https://solana.com/docs/core/fees/compute-budget . Do not silently change old
transaction builders or claim v1 deployment readiness from old validator results.
