# Versioned V4 financial engine

Starting master checkpoint: `e8bce11ad81f287bef5f3949b73df6c03f771040`.
This phase implements a new financial engine, not a completed launchpad or an
independent audit. All work remains in `jeet-app-next`.

## Why a new version is required

V1/V2/V3 `sold` is gross cumulative distribution and must equal the global cap
counter. V3 `collected` is lifetime raw buy consideration and its reserve check
requires all of it to remain in the curve. Decrementing either field in place
would invalidate verified gross-cap accounting or change existing economics.

V4 is an explicitly new launch discriminator and new trade ABI. It does not
upgrade or rewrite existing launches. Legacy paid buys and raw quotes are
unchanged for legacy records and reject V4 records. V4 instructions reject legacy
records. Its initializer reuses authenticated V3 initialization atomically,
then funds rent and extends that newly created record before returning success.
An existing record cannot be converted through this initializer.

## Mandatory fee-rounding review

V3 remains independently rounded up:

`P = ceil(75R/10000); C = ceil(25R/10000)`.

At R=1 lamport, the fee is 2 lamports: 200% of raw consideration. For all R>0,
the absolute excess above nominal R/100 is strictly less than 2 lamports. Repeated
microtrades cannot evade its fees, but incur substantial effective overcharges.
This is retained only for compatibility; it is not silently changed in V3.

New V4 launches use one rounded total and cumulative allocation carry:

```
f = ceil(R / 100)
A = lifetimePlatformAccrued + lifetimeCreatorAccrued
assert lifetimePlatformAccrued == ceil(3A / 4)
A_next = A + f
platform_next = ceil(3A_next / 4)
creator_next = A_next - platform_next
P = platform_next - lifetimePlatformAccrued
C = creator_next - lifetimeCreatorAccrued
```

Thus P+C=f exactly, the nominal model remains 75/25 bps, and cumulative fees are
allocated 3:1, exact at every multiple of four fee lamports. Allocation error is
less than one lamport; there is no hidden recipient or unaccounted remainder.
Claims do not change lifetime accrual and cannot reset the carry. A quote binds
the trade sequence, so a different trade changing the carry invalidates it.
All intermediate calculations are checked integers; counters cannot wrap.

The maximum effective total is now 100%, at R=1. This one-lamport minimum total
is unavoidable for a nonzero fee on a one-lamport trade. The excess over nominal
R/100 is strictly less than one lamport. No undisclosed minimum trade or fee tier
is imposed. Four one-lamport trades charge four lamports, allocated 3 platform /
1 creator; V3 would charge eight. Splitting cannot reduce the rounded total fee.
Per-trade component deltas can be zero because allocation carry is shared by the
launch; every positive buy still pays a positive total fee. This is a published
rounding rule applied to all wallets, not a privileged exemption.

## Buy and inverse redemption mathematics

Retain the verified discrete linear price, with n/s in base units and q=10^decimals:

`buyRaw(s,n) = ceil((P*n*q + D*(s*n + n*(n-1)/2))/q²)`.

Here s is now explicitly **net curve units sold**. The inverse returns the last n
marginal units:

`sellRaw(s,n) = floor((P*n*q + D*((s-n)*n + n*(n-1)/2))/q²)`.

A buy pays `buyRaw + f`. A sell receives `sellRaw - f`; nonpositive net output is
rejected. Sell gross is debited only from actual curve reserves, with its fee
credited into the two fee PDAs and its net credited to the signing seller.
Tokens return to the mint-specific custody vault atomically. No fee liability
or rent funds a redemption. No virtual reserve, unpaid sell, or simulated payout
exists.

Let F(s) be the rational integral of the marginal series. Each buy adds at least
its exact rational increment and each sell removes at most its exact decrement.
Starting at zero, the raw reserve therefore backs F(s). For any valid n<=s,
redemption is bounded by available raw reserve. Explicit balance checks also
reject any inconsistent or depleted reserve. Integer overflow rejects rather
than silently weakening this argument. Splitting a sell cannot increase its
aggregate floored gross refund. Mixed cycles cannot create SOL.

Rounding surplus remains explicitly in the curve reserve, including when net
sold returns to zero. It is not awarded to an admin, treasury or creator. A
fractional-denomination integration case demonstrates the exact one-lamport
residual. Further disposition requires an approved policy; no sweep exists.

## V4 state: 245 bytes

The original first 204 bytes retain the protected layout, with magic JEETCRV4.
For V4 only, offset 128 is net sold and 136 is current raw reserve. The separate
opening account and per-wallet receipts remain gross cumulative buys forever.

| Offset | Field | Type |
|---:|---|---|
| 204 | lifetime raw buy receipts | u64 |
| 212 | lifetime gross redemption payouts, including sell fees | u64 |
| 220 | cumulative token base units returned through sells | u64 |
| 228 | monotonic sequence, advanced by every buy and sell | u64 |
| 236 | irreversible buy-completion flag | u8, 0 or 1 |
| 237 | completion threshold, exactly initial launch inventory | u64 |

The existing mint/custody/opening identities, bumps, scale and protected metadata
are checked. Additional invariants:

- raw buy receipts - gross redemption payouts = current raw reserve;
- net sold + cumulative returns = gross global buy distribution;
- actual token vault >= initial inventory - net sold;
- actual curve lamports >= rent(245) + current reserve;
- each fee PDA >= its rent + accrued - withdrawn;
- gross per-wallet receipts never decrease on a sell;
- every trade has the exact expected net cursor and sequence.

The sequence prevents ABA replay: buying and then selling back to the same net
cursor does not revive an old quote. Different wallets and different token
accounts share the same sequence. Solana's transaction-signature replay checks
also apply.

Tokens are fungible: any signing holder may redeem, including recipients of SPL
transfers. There is no invented nontransferable redemption credit. Redemption is
bounded by the funded net curve cursor, not guaranteed against every minted
creator-allocation unit. Creator allocation remains independently recorded and
transferable as before; it does not confer a privileged payout or fee exemption.

## Instructions and events

All program IDs and fee-beneficiary rules remain as documented in the fee engine.
New instruction versions:

| Opcode | Instruction | Data |
|---:|---|---|
| 11 | initialize V4 | same 35-byte parameters and 10 accounts as authenticated V3 initialization |
| 12 | buy V4 | opcode + amount, expectedNetSold, exactRawQuote, maxFullSpend, expectedSequence; 41 bytes |
| 13 | quote buy | opcode + amount; 9 bytes |
| 14 | quote sell | opcode + amount; 9 bytes |
| 15 | sell V4 | opcode + amount, expectedNetSold, exactRawQuote, minNetReceived, expectedSequence; 41 bytes |

Quotes use the existing seven fee-quote accounts and return ten u64 values:
raw, platform fee, creator fee, user spend/net proceeds, net sold, current raw
reserve, amount, sequence, lifetime raw in, lifetime gross out. Buys and sells
use the existing twelve fee-buy accounts. Opening and buyer receipt are read-only
on sells. The source/destination token account must belong to the signing wallet;
its mint and initialized state are checked. The receipt PDA is validated even for
a secondary-market holder without a receipt; selling never creates or resets it.

Initialization emits JEET_MARKET_INIT_V1 (mint, creator). Trades emit
JEET_MARKET_TRADE_V1 (mint, wallet, side, amount, raw, platform, creator, user
amount, resulting net sold, reserve, sequence). Completion emits
JEET_CURVE_COMPLETED_V1 (mint, sequence). Events from rejected transactions are
not evidence of settlement; consumers must check transaction success.

## Opening, completion and migration boundary

Buys enforce the unchanged slot-derived start, gross wallet cap and protected
opening limit. Sells are permitted after launch start, including during the
protected phase, but do not restore any gross buy allowance. Creators have no
pre-launch exemption. No client clock authorizes a trade.

The final available base unit sets completion once, atomically. No later buy can
reopen it, including after a redemption. Redemptions remain funded and available
in completed-but-unmigrated state. Existing claims remain available. No migration
instruction is exposed yet; no SOL has been designated or released for migration.

The current fully sold-out allocation leaves zero pool-seeding inventory. LP
ownership, lock/burn policy and a migration token allocation are not approved.
Reserves also back existing redemptions. Moving them or inventing LP entitlements
would be an unsafe economic change. Migration remains blocked pending a concrete
approved allocation and obligation-resolution policy. This phase does not claim
an external pool or a complete migration state machine.

## Added rejection codes

1400 encoding/count; 1401 account/owner/identity/permissions; 1402 signer;
1403 zero/invalid amount; 1404 stale net cursor or sequence; 1405 completed buy;
1406 reserve insolvency; 1407 arithmetic overflow/underflow; 1408 quote/spend/net
bound; 1409 zero-net dust redemption; 1410 inconsistent market accounting;
1412 inconsistent fee carry; 1413 insufficient seller tokens. Existing cap,
opening, fee-PDA and CPI errors remain explicit and are not suppressed.

## Verification and limits

Native tests cover inverse bounds across denominations, fee carry and overflow.
SDK review tests quantify rounding and repeated microtrades. The real-validator
suite tests buys, partial/full/repeated sells, multiple wallets, substitution,
min-output failure, stale/ABA quotes, duplicate instructions, mixed atomic
rollback, concurrent buyers/sellers/buy-sell ordering, full completion, fractional
rounding surplus, pre-start rules, claims and exact conservation. Separate
public-account genesis fixtures test inconsistent state, depleted reserves,
sequence exhaustion, late accounting overflow and invalid carry without a
production state-edit backdoor. All legacy regression suites are retained.

The SDK and on-chain engine are implemented in this phase; the existing V3 UI
is deliberately not represented as a completed V4 buy/sell frontend. UI rollout,
metadata, discovery, real Devnet verification, migration and the audit package
remain subsequent master-assignment work. Do not classify this phase alone as
READY FOR INDEPENDENT AUDIT.

## Reserve proof and fungibility disclosure

Define the rational potential F(s) = (P*s*q + D*s*(s-1)/2) / q²,
without rounding it first. Each buy increases the reserve by
ceil(F(s+n)-F(s)); each redemption decreases it by floor(F(s)-F(s-n)).
Consequently reserve - F(netSold) never decreases from its initial zero:
every buy/sell contributes a nonnegative rounding surplus. The reserve therefore
covers every eligible redemption interval, subject to the checked integer limits.
The execution path separately verifies actual rent-excluded SOL backing. Fees
never enter that reserve proof: buy fees are additional funds and sell fees are
split out of the gross redemption before its net payout.

Creator-allocated and transferred tokens are ordinary fungible SPL tokens. They
can be sold after launch start against aggregate net sold inventory and real
reserves; they do not carry a separate redemption guarantee. Selling never
restores a wallet's gross purchase allowance. This does not prevent Sybil wallets
or ordinary secondary transfers, and is not a maximum-holdings rule.
