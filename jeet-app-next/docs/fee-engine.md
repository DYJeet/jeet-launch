# JeeT Launch fee engine

Starting checkpoint: `ce4b3857603ae2c2eb2fde0b44d336d47f254f19`.
Development scope: `jeet-app-next` only. No live deployment or authority changes.

## Economics and integer rounding

The fee base is **the existing integer bonding-curve consideration, in lamports**.
The verified curve formula is unchanged:

`raw = ceil((P*n*q + D*(s*n + n*(n-1)/2)) / q²)`

Here `n` and `s` are token base units and `q = 10^decimals`.

- `platform = ceil(raw * 75 / 10_000)`
- `creator = ceil(raw * 25 / 10_000)`
- `tradingFee = platform + creator`
- `fullConsideration = raw + tradingFee`

Each entitlement independently rounds **up** to a lamport. The nominal rates are
75 bps / 25 bps / 100 bps total. Rounding is disclosed separately: actual fees on
dust trades can exceed 1% and the total is the sum of the two rounded components,
not a separately rounded 100-bps amount. No rounding remainder exists. Repeated
microtrades cannot reduce either rounded fee below its aggregate-trade amount.
All financial intermediates use checked u128/u64 arithmetic. Zero consideration
and full-spend overflow are rejected. No floating-point financial math is used.

| Raw | Platform | Creator | Total fee | Full consideration |
|---:|---:|---:|---:|---:|
| 1 | 1 | 1 | 2 | 3 |
| 399 | 3 | 1 | 4 | 403 |
| 400 | 3 | 1 | 4 | 404 |
| 9,999 | 75 | 25 | 100 | 10,099 |
| 10,000 | 75 | 25 | 100 | 10,100 |
| 10,001 | 76 | 26 | 102 | 10,103 |

Creation platform fee is **0 SOL**. Account rent and network transaction fees are
separate. Ordinary SPL transfers collect no platform or creator trading fee.
No migration fee or post-migration DEX fee exists. Selling is not implemented.
`futureSellFees` provides arithmetic for future net proceeds (`raw - fees`),
rejecting proceeds below fees; it neither moves reserves nor implements selling.
Any future redemption must independently establish available, funded reserves.

## Versioning and authorization

Production program ID remains `7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31`.

- JEETCRV1 and JEETCRV2 layouts and economics remain unchanged.
- Original opcode 3 retains its 33-byte paid-buy ABI and raw quote semantics.
- Original opcode 5 still returns the same 32-byte raw curve quote.
- New fee launches use **JEETCRV3**, with the same 204-byte protected curve layout.
  The discriminator explicitly marks fee enforcement; no historical state is
  rewritten. All existing protected fields and timing rules are preserved.
- Fee-enabled launches reject legacy opcode-3 purchases with 1306. Opcode 8
  rejects fee-disabled launches. There is no unpaid entry point or fee exemption.
- Fee initialization is one-time, requires the mint-authority signer and the
  immutable creator from custody to sign, and is permitted only before launch
  distribution. It cannot reset a curve or retrofit existing launches.

The approved production beneficiary is pinned in Rust and the app:
`HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`.
It decodes to 32 bytes. Knowing this address does not establish control.
There is **no runtime treasury configuration/rotation instruction**, alternate
beneficiary parameter, admin exemption, or privileged withdrawal authority.
A new launch can only create vaults for this exact platform beneficiary and its
custody-recorded creator; callers cannot redirect existing liabilities.

Historical local-proof creators used discarded temporary keys. They are not
reassigned to connected wallets. The new signer-owned Devnet launch interface
is a separate explicit path: its signing wallet owns the creator allocation and
is recorded in custody. Allocation arithmetic, custody seeds, caps, protection,
and pricing remain the verified implementations. The old local and Devnet proof
creation interfaces are preserved.

## SOL custody and state

Curve consideration stays in the curve PDA. Fees never enter that reserve.
Two program-owned PDA accounts per mint hold the liabilities separately:

`[b"fee", mint_bytes, [kind]]`, with `kind = 0` platform or `1` creator.

Each fee account is exactly **153 bytes**:

| Offset | Field | Size |
|---:|---|---:|
| 0 | `JEETFEE1` discriminator | 8 |
| 8 | mint | 32 |
| 40 | canonical curve PDA | 32 |
| 72 | immutable beneficiary | 32 |
| 104 | kind | 1 |
| 105 | lifetime accrued lamports | 8, u64 LE |
| 113 | lifetime withdrawn lamports | 8, u64 LE |
| 121 | remaining claimable liability | 8, u64 LE |
| 129 | reserved, must remain zero | 23 |
| 152 | PDA bump | 1 |

Every quote, fee collection and claim validates the required PDA, program owner,
discriminator, mint/curve/beneficiary/kind/bump and consistent liabilities.
`claimable = accrued - withdrawn`, checked for underflow. Vault balance must be
at least `rent(153) + claimable`. Surplus donations do not become entitlements.
Only liability amounts may leave a vault. Rent and donated surplus remain locked:
**no account closure or rent-recovery operation is exposed**, even after a full
claim. This prevents close/reinitialize attacks and preserves lifetime accounting.
Prefunded PDA initialization uses the existing top-up/allocate/assign procedure.

Withdrawals do not mutate the curve, token custody, cap, receipt or opening state.
Platform claims cannot use creator vaults; creator claims cannot use platform
vaults; each mint has independent PDAs. There is no migration instruction. The
future migration budget can only include available curve consideration excluding
rent; fee vaults and outstanding fee liabilities are outside that budget.
Unsolicited curve deposits remain outside recorded trading consideration.

## Instructions

All integers are little endian. These are explicit versioned additions; legacy
serialized instructions and account interfaces remain intact.

### Opcode 7: initialize a fee-enabled protected curve

Data: 35 bytes, `[7, basePrice:u64, slope:u64, delay:u64, duration:u64, limitBps:u16]`.
Accounts: original curve-init seven accounts (payer RW signer, mint RO, custody
RO, opening RO, curve RW, token vault RO, System Program RO), followed by platform
fee vault RW, creator fee vault RW, custody creator RO signer. Payer must be mint
authority. Ordinary and protected opening constraints remain the verified rules.

### Opcode 9: full fee quote

Data: `[9, amount:u64]`, 9 bytes. Accounts: original quote five RO accounts
(mint, custody, opening, curve, token vault), then the two fee vaults RO.
Return data: 56 bytes / seven u64 values:
`raw, platform, creator, fullConsideration, sold, rawCollected, amount`.
The program uses exactly the same fee and curve functions as execution. Quotes
are read-only and may be obtained before opening, but purchases remain gated.

### Opcode 8: fee-bearing purchase

Data: 33 bytes:
`[8, amount:u64, expectedSold:u64, exactRawQuote:u64, maxFullConsideration:u64]`.
Accounts: the existing paid-buy ten accounts, followed by platform and creator
fee vaults RW. Buyer must sign and own the destination token account.

The shared buy engine validates custody, mint, cumulative receipt, ordinary cap,
protected opening and curve identity/state before inventory release. The fee
module validates both fee PDAs and fixed entitlements, computes checked amounts,
enforces the **fee-inclusive** maximum, collects the two fees and records their
liabilities. Raw consideration is paid to the curve. Receipt allocation, token
transfer and the original cap/curve updates remain in the same transaction.
Any later failure rolls all earlier transfers and writes back.

`expectedSold` rejects stale quotes, including two instructions with inconsistent
state in one transaction. A valid batch must supply the next exact curve state
and price for each instruction. Cumulative cap/opening accounting is shared
across every token account owned by a wallet and across instructions.

### Opcode 10: claim a positive amount

Data: 10 bytes: `[10, kind:u8, amount:u64]`.
Accounts: beneficiary RW signer, mint RO, custody RO, curve RO, fee vault RW.
There is no caller-supplied destination: the signing beneficiary is the destination.
For platform claims it must be the pinned treasury; for creator claims it must
be the immutable custody creator. The beneficiary must be a System-owned,
data-empty account. A governance program can only authorize a claim if it can
actually produce this exact beneficiary's signer privilege through a valid CPI.

Partial and full withdrawals are supported. Amount must be positive and no more
than remaining liability. A full duplicate claim fails. Re-signing a smaller
partial amount while liability remains is a new authorized partial withdrawal,
not a reusable reward voucher. Solana transaction-signature replay protection
also applies. Excessive multi-instruction claims roll back the entire batch.

## Structured events

`sol_log_data` emits:

- `JEET_TRADE_FEE_V1`, mint, buyer, raw:u64, platform:u64, creator:u64, total:u64.
- `JEET_FEE_CLAIM_V1`, mint, beneficiary, kind:u8, amount:u64, totalWithdrawn:u64.

Integers are LE; RPC represents each field as base64. The client decoder tracks
the program invocation stack, ignores another program's logs, and verifies fee
arithmetic. History and confirmations only accept transactions with `meta.err =
null`; events from a reverted transaction do not establish earnings or claims.

## Stable added errors

| Code | Meaning |
|---:|---|
| 1300 | Invalid fee instruction encoding/account count/kind |
| 1301 | Zero fee base |
| 1302 | Wrong fee PDA, identity, owner, beneficiary, type, bump or writability |
| 1303 | Inconsistent liability/reserved state or insolvent fee vault |
| 1304 | Missing/wrong beneficiary or creator signature; invalid claim receiver/permissions |
| 1305 | Fee-inclusive maximum expenditure exceeded |
| 1306 | Legacy/fee version mismatch or attempted fee bypass |
| 1307 | Zero claim or claim exceeding unclaimed liability |
| 1308 | Fee arithmetic overflow/underflow |

Existing 1000-series, 1100-series and 1200-series errors retain their meanings.
SPL/System CPI errors and runtime signature/program errors are not suppressed.

## Application and verification

`/revenue` contains the treasury and creator dashboards, per-mint breakdowns,
confirmed claim references, authorized partial/full claim controls, a fee quote
and buy form, and the explicit signer-owned Devnet test launch flow. Token pages
link to it with the mint prefilled. Original branding and creation proofs remain.

The client requires the Devnet genesis hash and executable program account,
uses Wallet Standard signatures, and never offers an unauthorized claim button.
It shows loading, empty, pending, confirmed, wallet rejection and failure states.
Earned/withdrawn/claimable amounts come from confirmed program accounts, with
checked rent/liability coverage. Fees are previewed from SBF quote simulation,
not a disconnected browser calculator. Confirmed buys verify the binary fee
event before displaying confirmed amounts. Network fee estimates and account
rent are separate from the bounded trade consideration. An intervening trade
invalidates the sold-state quote; increasing maximum spend cannot bypass this.
Claim history is a recent verified view (50 account transactions per vault), with
an explicit truncation/retention warning; lifetime totals come from on-chain state.

The program has not been deployed to Devnet or mainnet by this checkpoint. The
live Devnet UI fails closed until a separately approved deployment. Wallet control
of the intended treasury has not been established or assumed. No real SOL was
sent, no live authorities changed, and liquidity migration was not begun.

### Reproduce

Use Node 24, the locked Rust dependencies, Agave 2.3.13, SBF platform-tools v1.48.

```
npm ci
npm run build
npm run custody:build
npm run fees:build:local
npm run test:native
npm run test:fees:client
npm run test:local
npx playwright install chromium
npm run test:fees:dashboard
```

`JEET_VALIDATOR_BIN` and `JEET_CHROMIUM_PATH` may point to installed binaries.
The browser test needs headless Chromium; restricted Linux environments may
require the official Chrome headless-shell binary because desktop Chrome's
profile-singleton Unix socket is unavailable. This affects the test runner only.

The **local-fee-test feature is never a production artifact**. It compiles the
same logic under a different program ID:
`8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo`, with disposable treasury
`2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ`. Its public deterministic
fixture seed is only for local tests. The default binary pins the approved
beneficiary and original program ID. Both binaries execute real local-validator
transactions; the production binary verifies accrual to the approved beneficiary
and rejects the disposable signer. Authorized platform claims execute against
the isolated test binary, without needing or asserting control of the approved
wallet. Never deploy the test artifact. Build hashes are recorded in evidence.

The browser test bridges the Devnet RPC/WebSocket transport to a fresh local
validator and supplies a test-only Devnet genesis label. All minting, trades,
liabilities, balances, signatures and claims execute against the real default
SBF binary; financial responses are never fabricated. No live network is funded
or deployed. Wrong-network and undeployed-program cases are explicitly tested.

The full runner always includes all previous allocation/custody/cap/curve/opening
regressions. It then tests fees under both IDs, restarts a separate validator with
public account fixtures containing deliberately inconsistent state, and proves
rejection/rollback without any production bypass or state-edit instruction.

Independent production security review and explicit deployment approval remain
necessary before handling real funds. Sell reserve solvency, migration and
post-migration fees are not implemented or represented as complete.
