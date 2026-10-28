# Protected-opening checkpoint

Parent: `1755e6fba5f59c735e6c8f96a7d29e93111f32ba`.

This is an opt-in, versioned extension. Existing JEETCRV1 launches remain 153 bytes and use
their verified behavior. A new instruction 6 initializes a protected JEETCRV2 curve record.
There is no in-place upgrade or runtime enable/disable operation. The creator allocation,
custody PDA/ATA and 89-byte custody layout, 108-byte ordinary-cap layout, 81-byte wallet
receipt layout, 33-byte paid buy instruction, pricing formula, and quote format are preserved.

## On-chain state and boundaries

A protected record remains at the same canonical `["curve", mint bytes]` PDA and is owned
by the existing program. It is 204 bytes. Its identity, pricing parameters and counters
retain their original offsets through byte 152; the discriminator is JEETCRV2 instead of
JEETCRV1. The appended opening metadata is:

| Offset | Field | Encoding |
| --- | --- | --- |
| 153 | protectedEnabled | u8, fixed to 1 for this version |
| 154 | createdSlot | u64 LE |
| 162 | startSlot | u64 LE |
| 170 | durationSlots | u64 LE |
| 178 | endSlot | u64 LE |
| 186 | limitBaseUnits | u64 LE |
| 194 | delaySlots | u64 LE |
| 202 | limitBps | u16 LE |

`createdSlot` is obtained from `solana_program::clock::Clock::get()?.slot` during authorized
initialization. `startSlot = createdSlot + delaySlots` and `endSlot = startSlot + durationSlots`,
using checked addition. There is no caller-supplied current slot or client wall-clock input.
The program reads the same on-chain Clock source during every buy.

- Before start (`slot < startSlot`): reject purchases.
- Protected phase (`startSlot <= slot < endSlot`): apply the stricter cumulative opening limit.
- At expiry (`slot == endSlot`) and later: apply the original ordinary-cap and curve rules.

The duration is 1–1,000,000 slots and delay is 0–1,000,000 slots. Zero protected duration
is invalid, rather than an implicit bypass. When the ordinary cap is enabled, protection
must end no later than that cap's existing end slot. Its original expiry semantics do not
change. When the ordinary cap is disabled, protection still imposes its own inventory-bound
limit. Existing v1 records have no protected extension and remain unchanged.

## Cumulative purchase rule

`limitBaseUnits = floor(totalSupplyBaseUnits * limitBps / 10000)`, with checked integer math.
During the protected phase, `walletReceipt.received + amount <= limitBaseUnits` must hold.
This uses the existing canonical receipt keyed by mint and buyer wallet. The same counter
is updated once by the existing atomic purchase path; no separate counter is reset at expiry.
Multiple instructions see previous instructions' updates within their transaction, so they
cannot bypass the limit. Different token accounts of the same wallet share that receipt.

The limit must be strictly below initial inventory and, when the enabled ordinary cap is
positive, strictly below that cap. If the enabled ordinary cap is zero, the protected limit
must also be zero. Ordinary cap validation remains in force before payment, followed by
protected-opening validation and the unchanged deterministic quote/payment checks.

There is no issuer whitelist, privileged early buy, state reset, or downgrade path. The
original mint authority can initialize parameters once; it cannot replace a protected
record with v1 or reset its start/allowance. Creator allocation remains separate and unchanged.
As in the previous checkpoints, these are per-address launch-distribution rules; ordinary
SPL transfers and the creation of independent wallets are not identity-based bot detection.

## ABI and API

Instruction 6 uses the existing seven initialization accounts and a 35-byte payload:
opcode, base price P (u64), slope D (u64), delay slots (u64), duration slots (u64), limit
basis points (u16), all little endian. Legacy instruction 4 retains its 17-byte payload
and behavior. Existing quotes remain read-only and are allowed before start; they release
no inventory. Purchases enforce actual phase state and the existing fresh sold-counter quote.

The local create API adds:

- `protectedOpeningEnabled`: boolean; omitted/false retains the verified v1 initialization.
- `protectedDelaySlots`: safe integer, default 0 when enabled.
- `protectedDurationSlots`: safe integer, default 50 when enabled.
- `protectedLimitPercent`: percentage string with at most two decimals, default `0.50`.

The existing UI anti-sniper selection now selects this local protected mode. Its test panel
exposes delay, duration and percentage, and displays the verified start/end slots and base-unit
limit. Normal cap defaults remain 150 slots and 1%; invalid combinations fail before creating
a mint. API creation reads back and verifies protected settings. On-chain initialization and
buy validation enforce critical constraints independently of this client validation.

## Error codes

| Code | Meaning |
| --- | --- |
| 1200 | Purchase before the launch start slot |
| 1201 | Protected cumulative wallet limit exceeded |
| 1202 | Invalid protected duration, delay, percentage, strictness or cap-window configuration |
| 1203 | Inconsistent protected metadata, including encoded start/end/limit relationships |
| 1204 | Checked slot or protected-limit arithmetic overflow |

The existing signature/account/cap/curve errors are preserved: e.g. 1002 for unsigned buyer,
1003 for substituted account identities, 1005 for ordinary cap exceeded, 1102 for inconsistent
cap/curve state, 1104 for a stale quote, and 1109 for initialization/reset/downgrade attempts
against an initialized record. Malformed initialization encoding still uses 1100.

## Verification approach

```bash
cd jeet-app-next
npm run custody:build
npm run build
cargo test --locked --manifest-path programs/launch-custody/Cargo.toml
npm run test:local
```

The full runner always executes every previous regression suite, then tests protected
opening on a fresh Agave validator with 256 ticks per slot. Boundary transactions are signed
before submission. The harness schedules from processed-bank slots and asserts the actual
confirmed transaction execution slot equals its target. It proves rejection at start−1,
success at start, normal behavior exactly at expiry, and normal behavior at expiry+1.
Production enforcement is exclusively the on-chain Clock; the test scheduler does not
provide a clock or privileged phase override to the program.

Other cases cover exact and one-unit-over limits, repeated buys, alternate token accounts,
independent wallets, multi-instruction atomic acceptance and rollback, token transfers not
restoring allowance, ordinary cap enforcement during and after protection, substitutions,
stale quotes, zero allowance, invalid duration/configuration, and issuer reset/downgrade
rejections. Successful buys and batches assert exact quoted price, buyer/escrow SOL deltas,
receipt rent, tokens, receipt counts, opening totals and curve progression.

To exercise inconsistent on-chain data without adding a test-only program instruction,
the runner loads public account snapshots into a separate disposable validator genesis.
One fixture has a corrupted protected end; another has mismatched cap/curve distributed
counts. Signed buy transactions must fail and leave those snapshots unchanged. Only the
test validator's genesis loader can introduce those fixtures; the program exposes no such
mutation operation. Submission uses a fresh blockhash for the new genesis.

Every rejected transaction is executed, with a separate sponsor paying unavoidable network
fees. Snapshots verify unchanged buyer SOL, curve SOL, buyer tokens, inventory, original
wallet receipts, ordinary-cap state, and complete protected curve bytes. API invalid-input
tests fail before mint creation. Rust unit tests use the production slot arithmetic and
phase functions to cover u64 overflow, invalid durations and exact boundaries.

Evidence and exact counts are recorded in `protected-opening-local-evidence.json` and
`protected-opening-test-results.txt`. Main valid-fixture conservation is
`20 creator + 950 custody inventory + 30 buyer tokens = 1000`. The expiry fixture reaches
`20 + 960 + 20 = 1000`, with its original receipt counter preserved through expiry.

Tested with Agave 2.3.13, SBF platform-tools v1.48 and Node 24. Focused ESLint, Rust format,
production build, SBF build, native tests and the full validator suite are required. Previously
documented whole-project lint issues and the toolchain's syscall-name warning are unchanged;
runtime validator execution is the verification for that tooling warning.

No liquidity migration is implemented in this checkpoint.
