# Opening wallet-cap checkpoint

Parent: `d90567c03f6b8bcadad638d2517e387aa1579a6f`. Development is confined to
`jeet-app-next`; the frozen baseline is unchanged.

## Enforced rule

The existing creator allocation formula, creator ATA, mint-specific custody seeds,
custody program address, inventory ATA authority and 89-byte custody state are preserved.
New state is separate from custody:

| State | PDA seeds | Purpose |
| --- | --- | --- |
| Opening configuration | `opening`, mint bytes | Immutable cap, phase and distributed total |
| Wallet receipt | `buyer`, mint bytes, wallet bytes | Cumulative launch inventory received by this wallet |

The protected phase starts in the initialization slot. It is active when `enabled` is
true and `Clock.slot < endSlot`. At `endSlot` the cap expires. Start/end slots and enabled
status are recorded on chain; clients cannot choose a phase when requesting inventory.
Only the mint-authority signer can initialize configuration, and it can be initialized
once. The API does this before the existing authority-revocation step.

The cap is `floor(totalSupplyBaseUnits * capBasisPoints / 10000)`. Configuration supports
0–10000 basis points (0–100%). While protected, a successful distribution must satisfy
`walletReceived + amount <= cap`. A 0% protected cap rejects every positive distribution;
it does not disable protection. An explicitly disabled or expired phase permits amounts
above the cap, bounded by remaining inventory. Cumulative receipts remain recorded.

Receipts are keyed by wallet, not destination token account. Any initialized standard SPL
token account of the correct mint owned by the signed buyer can receive inventory. Using
another token account or sending previously received tokens away does not reset allowance.
Different wallets have separate allowances. This is a per-address distribution rule.

Standard SPL secondary transfers remain unrestricted. This is not an aggregate wallet
holdings limit or a one-person/one-wallet rule. The initial creator allocation is separate
from purchase receipts and is not deducted from a creator wallet's purchase allowance.

## Instructions and state

Existing custody instructions 0 and 1 are preserved. Instruction 2 initializes the opening
PDA; its 12-byte input is opcode, cap basis points (u16 LE), enabled (0/1), duration slots
(u64 LE). Duration is bounded to 1,000,000 slots and must be positive when enabled.
Instruction 3 requests inventory; its input is opcode plus amount (u64 LE). It requires a
signed buyer, canonical custody/vault/opening/receipt accounts, correct mint and executable
program IDs, a buyer-owned destination, positive amount and sufficient inventory.

The program validates the original minted supply against custody's initial allocation.
It transfers inventory via the existing custody PDA's `invoke_signed` authority and
updates the wallet receipt and global distributed count in the same transaction. It
does not trust an API balance check for cap enforcement. Account locks serialize concurrent
requests; a transaction that fails after an earlier distribution rolls back the entire batch.

Opening state is 108 bytes:

| Offset | Encoding | Value |
| --- | --- | --- |
| 0 | 8 bytes | `JEETOPN1` |
| 8 | 32 bytes | Mint |
| 40 | 32 bytes | Custody PDA |
| 72 | u64 LE | Wallet cap in base units |
| 80 | u64 LE | Start slot |
| 88 | u64 LE | End slot |
| 96 | u8 | Enabled |
| 97 | u64 LE | Total inventory distributed |
| 105 | u8 | Canonical opening bump |
| 106 | u16 LE | Configured cap basis points |

A wallet receipt is 81 bytes: `JEETBUY1` (8), mint (32), wallet (32), cumulative received
(u64 LE), canonical bump (u8). Prefunded PDAs are supported without a state-reset path.

## Deterministic errors

These custom codes apply to the new opening instructions. Existing custody error behavior
and standard SPL Token errors are preserved.

| Code | Meaning |
| --- | --- |
| 1000 | Invalid instruction encoding |
| 1001 | Incorrect account count or writable privileges |
| 1002 | Missing buyer/initializer signature or unauthorized initializer |
| 1003 | Invalid account identity, ownership, PDA, mint, destination or program |
| 1004 | Invalid opening configuration or changed mint supply |
| 1005 | Cumulative wallet cap exceeded |
| 1006 | Zero distribution amount |
| 1007 | Insufficient inventory or distributed total exceeds initial inventory |
| 1008 | Arithmetic overflow |
| 1009 | Opening state already initialized |

## Local API and UI

The local creation API accepts `maxWalletPercent` (string, at most two decimal places,
default `1`), `openingEnabled` (boolean, default `true`) and `openingDurationSlots`
(safe integer, default `150`). The existing form's wallet-cap setting is passed through to
the local API. Creation verifies the opening state's owner, identity, bump, cap, phase
settings and initial distributed count on chain. Results display the configured cap and
opening state address alongside the preserved allocation/custody results.

## Verification

```bash
cd jeet-app-next
npm run custody:build
npm run build
npm run test:local
```

The full suite retains all creator allocation and custody regression tests and adds:

- Exact cap, one base unit over, repeated purchases and atomic repeated-buy rollback.
- Multiple token accounts for one wallet and independent allowances for different wallets.
- Sending acquired tokens away without restoring allowance.
- Zero-percent protected, explicitly disabled, and slot-expired phases.
- Substituted wallet receipts, recipients, mint, custody PDA, vault, opening state and Token Program.
- Missing buyer signature, malformed input, direct unauthorized inventory movement,
  zero amount and insufficient inventory.
- Invalid basis points, enabled flag and duration, plus rejection of an authorized attempt
  to reset the configured phase; eight invalid API configurations.
- Independent token/state snapshots before and after rejected transactions. Wallet-cap
  failures are submitted to the validator with preflight/estimation disabled in the test
  clients so runtime failure and rollback are exercised. Fees can be charged on rejected
  transactions; the unchanged-balance assertions cover SPL tokens and program state.
- Exact conservation across creator, remaining vault inventory and all tracked buyer
  token accounts. A representative active launch reconciles `20 + 780 + 200 = 1000`.

Tested on Agave 2.3.13 with SBF platform-tools v1.48, Node 24 and transaction version 0.
Focused ESLint and Rust formatting checks pass. Previously documented whole-project lint
issues remain outside this feature. The toolchain's previously documented syscall-name
warning remains; validator execution passes.

Evidence is in `opening-wallet-caps-local-evidence.json` and `opening-wallet-caps-test-results.txt`.
These contain disposable local-validator records. Each fixture records the final opening
and receipt state plus reconciled balances. For custom binary paths use `JEET_VALIDATOR_BIN`;
`JEET_WALLET_EVIDENCE` selects the cap evidence output file.

## Feature boundary

Instruction 3 is a local test distribution operation with no SOL price. Bonding-curve
pricing has not been implemented. Its later integration must add payment/pricing checks
to the same atomic cap-and-custody distribution path and test that unpaid entry cannot
remain available. This local program is loaded at genesis into a fresh disposable ledger;
the previous immutable local program is not upgraded or migrated in place. Devnet and
mainnet deployment remain later checkpoints.
