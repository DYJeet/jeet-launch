# Deterministic buy-pricing checkpoint

Parent: `ec7921711c5be39e8a28d60911cdab5fead00a3c`. All changes are under
`jeet-app-next`. Creator allocation, custody program identity/seeds, the 89-byte custody
state, 108-byte opening state, 81-byte wallet receipts and cumulative cap rules are preserved.

## Formula and units

Let `q = 10^decimals`, `s` be base units already sold through the launch, and `n` be the
requested base units. Immutable parameters `P` and `D` are integer lamport values: `P` is
the initial marginal price per whole token, and `D` is the increase in that marginal price
per whole token sold. The discrete marginal price of base unit `i` is `(P*q + D*i)/q^2`.

```text
cost(s,n) = ceil((P*n*q + D*(s*n + n*(n-1)/2)) / q^2)
```

The program sums the discrete series using checked u128 integer arithmetic, then rounds
the aggregate purchase payment upward once to a whole lamport. Conversion to u64 is checked.
There is no floating point pricing. Positive `P` ensures that every positive purchase costs
at least one lamport. A zero slope is allowed for a constant-price boundary case. Splitting
a trade can incur extra lamport rounding; receipt caps still accumulate across trades.

Local defaults are `P=1000`, `D=1`; `q` follows the existing mint decimals. Parameters are
explicit configurable test values. The local create API accepts `curveBasePriceLamports`
and `curveSlopeLamports` as u64 integer strings. Base price must be positive, slope can be
zero, and mint decimals remain limited to 0–9. The creation flow initializes and verifies
the curve before applying the unchanged mint/freeze authority choices.

For the zero-decimal validator fixture, 10 tokens at `s=0` cost 10,045 lamports; the next
10 cost 10,145; the next one costs 1,020. For fractional tokens the same formula uses the
mint scale. Quotes represent purchase payment only: transaction fees and first-use wallet
receipt rent are separate. Tests verify these components separately.

## State and quotes

The curve is a PDA derived from `["curve", mint bytes]` under the existing program ID.
It also holds collected SOL, with rent retained. Initialization requires the mint-authority
signature, valid unchanged custody, configured opening state, full initial inventory and
zero distribution. The curve is initialized once, with no parameter reset instruction.

| Offset | Encoding | Value |
| --- | --- | --- |
| 0 | 8 bytes | `JEETCRV1` |
| 8 | 32 bytes | Mint |
| 40 | 32 bytes | Custody PDA |
| 72 | 32 bytes | Opening PDA |
| 104 | u64 LE | Base price P |
| 112 | u64 LE | Slope D |
| 120 | u64 LE | Scale q |
| 128 | u64 LE | Cumulative base units sold |
| 136 | u64 LE | Cumulative lamports collected |
| 144 | u64 LE | Initial sale inventory |
| 152 | u8 | Canonical curve bump |

Instruction 4 initializes the 153-byte curve account. Its input is opcode plus P and D,
both u64 LE. Instruction 5 quotes a positive amount, encoded as opcode plus n (u64 LE).
It validates canonical curve/custody/opening/vault identities and state consistency, then
returns 32 bytes: cost, sold count, collected lamports and amount (four u64 LE values).
It does not mutate curve state or SOL. Clients may simulate this read-only instruction;
the validator tests submit it and inspect return data from the confirmed transaction.

Both quoting and buying call the same Rust cost function. The TypeScript BigInt mirror
is tested against on-chain quotes, including fixed-point rounding and boundaries.

## Atomic execution and bypass prevention

The existing inventory instruction 3 now requires 33 bytes: opcode, amount, expected sold
count, exact quoted cost and maximum cost (four u64 LE values). Its original account list
is preserved with the writable curve PDA appended. The retired 9-byte unpaid format is
rejected; there is no second inventory-release route bypassing pricing.

Validation preserves the existing wallet cap checks before payment or inventory release.
The curve must match the mint/custody/opening, sold count must equal opening's distributed
count, original supply must match custody's allocation, and inventory must cover the
scheduled remaining sale inventory. The expected sold count is a monotonic state version:
a competing buy makes an earlier quote stale. The recomputed cost must equal the exact
quoted cost and be within maximum cost. A higher maximum never causes an overpayment.

The same transaction transfers exact purchase SOL to the curve PDA, updates sold/revenue,
releases inventory through the existing custody PDA signature, and updates the unchanged
opening and wallet receipt counters. Any later failure rolls all of that back, including
receipt rent allocation. Writable account locks serialize competing state changes.

SOL gifts and tokens returned unsolicited to the inventory ATA do not change sold counts,
prices or allowance. Inventory must cover the scheduled reserve; excess is not added to
the sellable budget. This prevents a holder from blocking the curve by returning one token.
The original inventory budget still bounds all cumulative distributions. Token conservation
uses actual balances, while cap receipts and curve sold track gross launch distributions.

## Error codes

Existing custody/cap and SPL errors are retained. New curve errors are:

| Code | Meaning |
| --- | --- |
| 1100 | Malformed curve instruction or account count |
| 1101 | Zero quote amount |
| 1102 | Invalid/missing curve, ownership, account identity or inconsistent state |
| 1103 | Invalid curve parameters |
| 1104 | Stale expected sold count |
| 1105 | Exact quote mismatch or maximum cost exceeded |
| 1106 | Insufficient buyer SOL for payment |
| 1107 | Missing/unauthorized initializer signature |
| 1108 | Checked arithmetic overflow/underflow or unrepresentable u64 cost |
| 1109 | Curve already initialized |
| 1110 | Quote exceeds scheduled remaining inventory |

Earlier cap validation can reject a buy first, e.g. 1005 for cap exceeded, 1006 for zero
amount, 1007 for insufficient inventory and 1000 for the retired unpaid format. A system
or token CPI can return its own error, with the same transaction-wide rollback.

## Verification

```bash
cd jeet-app-next
npm run custody:build
npm run build
npm run test:local
```

The full local suite retains allocation/custody regressions and all 23 opening-cap rejection
cases. Pricing tests verify sequential buys across multiple wallets, exact on-chain quote
and payment equality, marginal price progression, fractional ceiling, zero slope, exact cap,
full-inventory purchase and sold-out boundary, maximum u64 quote, one-lamport-over u64 cost,
u64/u128 overflow, insufficient SOL, stale and mismatched quotes, substituted accounts,
zero/malformed requests, unpaid-format bypass, parameter initialization and reset guards,
unsolicited deposits, and token conservation across all fixtures.

Rejected pricing transactions are actually submitted to the local validator with preflight
and resource estimation disabled in test clients. A separate sponsor pays network fees.
Snapshots assert that buyer SOL, curve SOL, SPL balances, opening state, wallet receipts
and curve state remain unchanged. A valid paid buy followed by a failing instruction tests
rollback after payment and token release. Network fees themselves are charged even when
transactions fail; they cannot be rolled back. Successful first purchases separately account
for receipt rent and assert exact price transfer and collected-counter progression.

Tested with Agave 2.3.13, SBF platform-tools v1.48, Node 24 and version-0 transactions.
Focused ESLint and Rust formatting checks pass. Previously documented whole-project lint
issues and toolchain syscall-name warning remain outside this feature; actual validator
execution passes. Evidence and the passing test list are in `bonding-curve-local-evidence.json`
and `bonding-curve-test-results.txt`. `JEET_CURVE_EVIDENCE` selects the pricing evidence path.

## Scope

This checkpoint supports deterministic buys only. There is no sell, treasury withdrawal,
liquidity migration or new anti-sniper rule. It uses a fresh local genesis-loaded program
as in the prior checkpoints; it does not upgrade the frozen baseline or migrate existing
public-chain launches. Devnet/mainnet preparation remains later work.
