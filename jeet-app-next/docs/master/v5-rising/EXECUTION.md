# V5 local execution checkpoint (not activation approval)

Starting remote main: 342796657a0f009e80cb5cc14c8742685f42b679. Remote main had no
later implementation-readiness commit. Local checkout was clean at d53eb51 and
was fast-forwarded; no local work was discarded. Work remains on master-completion.

## What runs

The default/production build rejects opcodes 16–20 with 1514. V5 program code is
compiled **only under the existing disposable local-fee-test feature**, whose
program ID and public test treasury fixture must never be publicly deployed.
There are no V5 production defaults or public launch controls. No AMM CPI,
migration, redemption cutoff, public deployment or LP lock is implemented.

The local SBF engine executes actual token and SOL transfers. It has immutable,
parameterized starting/ending prices, quantity quantum and inventory partition.
Initialization moves reserved migration tokens into the mint's curve-PDA ATA.
Ordinary buys and sells can access only the distinct launch-custody ATA. No
instruction releases the reserved ATA, closes it, rotates its authority or spends
its rent. Both token accounts reject delegates/close authorities/native wrapping.
The original creator allocation and total issued supply are unchanged. Trading and quotes require mint and freeze authorities to be revoked; initialization itself still needs the original mint authority signature.

Legacy instructions validate their original versions and cannot trade V5 state.
Existing op10 claims accept V5 only in the local feature; the original beneficiary,
signer, per-mint fee-vault and liability checks apply. V1–V4 math/handlers have not
been edited. V5 repeats the V4 execution validations in a separate module to avoid
changing historical semantics; future deduplication requires separate regression
review. This duplication is a maintenance risk, not a new admin path.

## Flexible pricing and explicit economic difference

Let B be curve inventory in raw units, Q the raw-unit quantum, K=B/Q >=2, a the
starting lamports per quantum, z>=a the ending lamports per quantum. All are u64.
Q must be an integer number of whole tokens, at least 10^decimals; decimals <=9.
Reserved inventory is positive, an integral number of Q, and B+M must equal the
verified original noncreator custody inventory. Creator allocation cannot exceed
5% of total supply. No allocation percentages are supplied as production defaults.

For 0<=i<K, `p(i)=a+ceil((z-a)*i/(K-1))` lamports. With n=s/Q,
`G(s)=a*n + sum(i=0..n-1, floor(((z-a)*i+K-2)/(K-1)))`.
The Euclidean floor-sum implementation uses checked u128 intermediates, checked
u64 outputs and logarithmic iterations; it never loops over token quantities.
Buy raw `G(s+x)-G(s)`; sell gross `G(s)-G(s-x)`. Trades must be positive integral
quanta; no token dust is rounded into free inventory. Marginal prices are
nondecreasing (plateaus are expected), with exact a/z endpoints. Every successful
trade preserves R=G(s), so full redemption returns exactly R, before fees.

Fees reuse V4: F=ceil(raw/100), lifetime P=ceil(3*sum(F)/4), C=sum(F)-P. Per-trade
components are changes in these cumulative totals. Buy expenditure=raw+F; sell
net=raw-F>0. Maximum expenditure/minimum net proceeds and exact sold/sequence/raw
conditions are checked on-chain. Network fees and receipt rent are separate.
At 42 lamports gross, F=1 (2.38095% effective); at 126, F=2 (1.58730%). Splitting
cannot reduce total rounded fees. These are the existing V4 rounding semantics,
not a claim of exactly 1% effective fees on every microtrade.

The SDK finds the largest affordable quantum count using a bounded binary search
and full fee-inclusive expenditure. The returned quantity is then independently
quoted/executed by SBF, with stale-state/slippage guards. No browser estimate is
authoritative, no fractional quantity is silently rounded, and no residual budget
is transferred. This is SOL-budget input support at SDK level, not a live public
trading panel or a new market-buy instruction.

For the proposed billion-token 1%/59.4%/39.6% profile:

| Internal quantum | a→z lamports/quantum | G(B) lamports | Ideal pool price lamports/token |
|---|---|---|---|
| Earlier 1,000 tokens | 42,000→126,000 | 49,896,296,996 | 126 + 296,996/396,000,000 |
| Flexible 1 token | 42→126 | 50,192,999,999 | 126 + 296,999,999/396,000,000 |

Whole-token execution is the smallest quantum offered by this implementation;
raw SPL fractions remain transferable/aggregatable and are not confiscated.
Exact-base-unit pricing with these prices cannot charge a positive integral
lamport per base unit: many base units share less than one lamport of value.
Rounding an integral potential at base-unit precision introduces zero-cost steps
or nonmonotone single-unit executed differences. A rational indicative price is
possible, but a different dust contract would need explicit design and approval.

The new quantum increases terminal raw reserve by exactly 296,703,003 lamports
(0.296703003 SOL). This is **not silently compatible with the older reserve**.
At 396m migration tokens its ideal initial price is approximately 126.75 lamports/
token versus final raw marginal126: +0.5952380932%, or 59.52380932bp. Proposed ideal
ratio limit: 60bp, requiring owner approval; it leaves only 0.47619068bp for additional
ratio error. Do not activate this tolerance without actual venue balance fixtures.
At the old quantum the gap is only approximately0.00059523% (0.059523bp).

A smaller integer-lamport quantum also coarsens the marginal price grid. The
1-token profile has only85 distinct marginal prices42..126, compared with84,001
at the previous1,000-token quantum. Its first token costs42 raw lamports; indices
1..7,071,428 cost43, and index7,071,429 costs44. This is an explicit staircase,
not a claim of continuously increasing price after every buy. The SDK budget
conversion works at any validated quantum; selecting trade granularity versus
continuity remains an owner economic decision before activation.

| Quantum (tokens) | Exact terminal reserve (lamports) | Excess over continuous target49,896,000,000 |
|---|---:|---:|
| 1,000 | 49,896,296,996 | 296,996 |
| 100 | 49,898,969,999 | 2,969,999 |
| 10 | 49,925,699,999 | 29,699,999 |
| 1 | 50,192,999,999 | 296,999,999 |

One token is the minimum implemented precision and the executed local fixture,
not an activated production default.100/10-token options reduce the price-grid
and graduation gap tradeoff while still supporting SOL-budget entry. They have
mathematical fixtures, not separate on-chain profile acceptance runs.

No setup costs have been subtracted. Removing0.15 SOL from the flexible reserve,
for example, would violate R=G(s) while sells remain enforceable. The external
setup payer/funding policy remains unapproved; it must explicitly and separately
fund all setup costs, rent and network fees. No compulsory creation/migration
charge or hidden subsidy is introduced.

## State and lifecycle

V5 uses the existing mint-specific `["curve", mint]` PDA, magic JEETCRV5, length262.
All offsets below are bytes; integers are little-endian u64 unless specified.

| Offset | Meaning |
|---|---|
| 0..7 | JEETCRV5 |
| 8,40,72 | mint, custody, opening pubkeys (32 bytes each) |
| 104,112,120 | start/end lamports per quantum, token scale |
| 128,136,144 | net sold raw units, tracked redemption reserve, trading inventory B |
| 152 | curve bump (u8) |
| 153..203 | original protected-opening fields; semantics unchanged |
| 204,212,220,228 | lifetime raw in/out, returned tokens, sequence |
| 236 | current completion eligibility bool; **not** legacy irreversible completion |
| 237,245,253 | threshold B, Q, migration inventory M |
| 261 | 0=Active,1=Eligible; must agree with sold==B and offset236 |

Initialization op16 has59 data bytes and12 accounts. Quote17/18 has9 bytes and8
accounts. Buy19/sell20 has41 bytes and13 accounts. SDK builders specify the exact
account order; the migration ATA is validated on every quote/trade. It is readonly
for trading. The initializer requires the original mint authority and immutable
creator signature via the verified V4 initialization path; no existing initialized
curve can be upgraded/repartitioned. Supply and creator ownership are checked.

Gross wallet/opening receipts never decrease on selling. Alternate accounts share
the same wallet receipt. Start/expiry use Clock.slot and the unchanged protection
checks; same-transaction operations see updated state. Trade+payment+fees+receipts+
inventory+sequence update atomically. On-chain logs use JEET_V5_PREVIEW_INIT,
JEET_V5_PREVIEW_TRADE and JEET_V5_ELIGIBLE tags. Quote return data keeps the V4
80-byte component format, decoded by decodeMarketQuote.

At exact B, eligibility is true but no redemption right is terminated. Sells
remain solvent and can reverse eligibility; buyers cannot exceed B. There is no
intermediate migration state or asset release. An unavailable external venue
therefore cannot strand these local holders. This is a safe trading checkpoint,
**not a solved terminal migration contract**. Atomic external CPI and permanent
LP withdrawal prevention must be proven before any terminal/cutoff state is added.

V5 errors:1500 encoding;1501 accounts;1502 signature;1503 quantity/parameters;
1504 stale cursor/sequence;1506 reserve;1507 arithmetic;1508 price/slippage;
1509 nonpositive sell proceeds;1510 state consistency;1512 receipt consistency;
1513 insufficient seller tokens;1514 production V5 disabled. Reused validation
errors include1005 cap,1200/1201 start/opening limit,1202 protection parameters,
1302/1303 fee-vault state,1304 claim authorization,1307 unavailable claim,1407/1412
shared fee arithmetic/carry,1106 insufficient buyer SOL. Some codes remain
reserved/unreachable until future state transitions exist; no migrated error is
claimed. SPL/system CPI failures retain their native errors.

## Conservation and rollback

At every checked trade: creator holdings+buyer holdings+trading ATA+reserved ATA
=issued supply (no double counting returned tokens); R=G(netSold)=rawIn-rawOut.
Buyer expenditure=net seller payouts+R+platform accrued+creator accrued, excluding
network fees and separately measured receipt/account rent. Each fee entitlement
satisfies accrued=withdrawn+claimable and fee-PDA SOL=rent+claimable. Curve SOL=
rent+R in these no-donation fixtures. There is no migration SOL simultaneously counted: X=0 while redemption
continues. Eligibility alone does not make R spendable by a liquidity pool.

The local suite sends actual failed transactions with separate sponsors, records
failed signatures, snapshots all protected account data+lamports, and verifies
unchanged snapshots. Races use two excluded sponsors so network charges do not
reduce buyer funds. The race winner is included in the lifetime conservation
ledger; losers cannot double redeem. These are local-validator proofs, not
Devnet/mainnet execution or an independent audit.

## Approval and remaining work

Approval is still required for final allocation, quantum/economic rounding delta,
start/end pricing, ratio tolerance, prospective terminal contract, actual AMM
configuration and transparent setup funding. High-level permanent-liquidity policy
is approved; a deployed mechanism is not verified. Production V5 is disabled.
Next: pin/verify AMM bytecode and config, execute a complete local terminal CPI+
LP burn within measured limits, inspect pool/LP balances and authorities, prove
failure recovery, then seek explicit activation/deployment approval. Do not add
a non-atomic redemption cutoff to compensate for transaction-size/compute failure.

## Frontend changes in this checkpoint

Corrected the stale0.5 SOL creation estimate to the approved0 SOL platform fee,
added nominal 75/25 fee/dust and disabled-public-V5 disclosures before desktop and
mobile review, connected the decorative header search to actual Explore, and
added mobile navigation. No fake launches or enabled public V5 actions were added.
A shared wallet hydration boundary makes SSR and initial browser rendering use
the same fallback; it fixes the observed React418 hydration mismatch without
suppressing errors or changing signing/claim authorization. Actual Chromium tests
cover 390px/1440px rendering, navigation, search, fee disclosure, client exceptions
and horizontal overflow. They do not establish a full public V5 wallet lifecycle.

Unsolicited deposits are possible under ordinary SPL/System semantics. General
account checks therefore require at least tracked inventory/backing, not equality.
Excess SOL is measured as balance minus rent minus tracked liability/reserve; it
is a separate unassigned, non-withdrawable residual, never extra redemption or
migration funding. Excess tokens likewise remain outside the configured sale
quota and migration allocation. Actual token-account balances, including such
residuals and the donating holders' reduced balances, must reconcile to the
revoked mint's supply. The executed fixtures contain no donations, so their
reported residuals are exactly zero. Future migration must explicitly preserve
these residuals; no sweep/refund economics has been approved.
