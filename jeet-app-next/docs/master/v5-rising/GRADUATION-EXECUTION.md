# Integrated V5 graduation: actual local execution

Starting remote main:07598ee2933781550f6de86807c9693c5bb2efad.
This continuation recovered an older clean local checkout from d53eb51 and
fast-forwarded it without changing frozen baselines. Uncommitted graduation code
and its later logs were absent from this restored workspace and Git objects.
The integration was reconstructed from the continuation record, compiled fresh,
and tested again. No missing prior log is counted as fresh verification.

## Scope and versions

Only disposable local-fee-test builds enable V5 instructions16–22, at
8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo. The default program
7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31 rejects all those instructions
with1514, including real validator checks for the new21/22 operations.
Never deploy local-fee-test publicly: its documented test treasury is not secure.
Production treasury remains HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP.
Creator allocation, fees, legacy handlers and existing V1–V4 obligations are unchanged.

The actual external SBF is official Raydium CPMM source
f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5, compiled unchanged with its Cargo.lock,
Devnet feature and explicit supported SBF v0. Its local program ID is the official
Devnet interface DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb.
AmmConfig, WSOL mint and fee receiver are disclosed local genesis fixtures;
admin initialization is not tested. No AMM instruction, reserve balance or burn
response is mocked. This is not a public Devnet/mainnet migration or independent audit.

## Prospective terms and atomic activation

Instruction21:3 data bytes,9 accounts, maximum initial price gap in u16bps.
Only the existing immutable creator may sign registration. Sequence, sold,
rawIn, rawOut and returned totals must all be zero. A full buy/sell round trip
cannot make a previously traded launch eligible for a new redemption cutoff.
An older V5 launch without terms cannot migrate. Terms cannot be overwritten.

The SDK's activateGraduationInstructions returns a single transaction bundle:
revoke mint authority, revoke freeze authority, register terms. Trading already
requires both authorities revoked. The bundle closes the race between enabling
trading and announcing terms; its failure rolls back both revocations, proved
on-chain. Initialization must precede this bundle while mint authority is held
by the creator. Never split the activation bundle into separate submissions.

Terms at PDA["graduation",mint], JEETGRD1,253 bytes:

|Offset|Field|
|---|---|
|0|8-byte magic|
|8|mint public key|
|40|curve public key|
|72|supported AMM program|
|104|canonical AMM configuration|
|136|system-owned migrator PDA|
|168|verified pool, initially zero|
|200|actual SOL deposited, u64|
|208|migration tokens deposited, u64|
|216|initial LP burned, u64|
|224|immutable maximum initial price gap bps, u16|
|226|registration slot, u64|
|234|migration slot, u64|
|242|migration sequence, u64|
|250|terms bump|
|251|migrator bump|
|252|0 configured /1 migrated|

## Permissionless atomic migration

Instruction22:25 bytes [22,expectedSequence:u64,maxSetupLamports:u64,nonce:u64].
Any ordinary caller may sign and pay the separate setup budget. Eligibility
requires net sold B, reserve G(B), and expiry of both protected opening and any
enabled ordinary wallet-cap phase, using Clock.slot. Graduation cannot open an
AMM early to bypass those restrictions. Terms allow0–100bps; reference tests use60.

The destination is JeeT PDA["amm_pool",mint,nonce_le], signed through CPI using
CPMM's actual custom-pool interface. A nonce permits an uncontaminated retry
rather than trusting a caller-selected arbitrary pool. AMM authority, config,
vaults, observation, LP mint, source ATAs, program IDs, ownership and signer
relationships are validated. Migrator PDA["migrator",mint] becomes the actual
pool creator; the external payer receives no creator entitlement or LP position.

All in one transaction:

1. Validate current eligible state, expiry, immutable terms and initial price ratio.
2. Fund setup from the caller's explicit bounded budget, separately from reserve.
3. Move reserve SOL directly into the migrator's WSOL ATA, never to an unrestricted EOA.
4. Move exactly M reserved tokens using the curve-PDA signature.
5. CPI into genuine CPMM initialization and prove actual pool/vault relationships.
6. Prove deposited token/SOL amounts and LP authority; burn sqrt(M*R)-100 initial LP.
7. Prove mint supply zero, preserve existing donations, refund unused setup budget.
8. Close newly funded empty source ATAs/LP ATA; preserve pre-existing source accounts.
9. Record migrated status2 in JEETCRV5 and1 in terms, with amounts, pool, slot and sequence.

The direct reserve debit and WSOL credit are both carried into the next SyncNative
CPI so the runtime synchronizes both sides. Actual validator testing exposed an
unbalanced-CPI failure before that fix; the corrected real transfer passes.
No substitute external payer finances the reserve.

There is no persistent in-progress/failed state because all steps are atomic.
A failed CPI, failed proof, or a second migration instruction rolls the entire
transaction back, including pool creation and LP burning. Selling still executes
against the original reserve after failure. Retry requires current sequence and,
when necessary, a fresh nonce. Concurrent migration attempts yield one economic
transition; the loser fails1609. No admin early migration or principal release exists.

Successful migration alone ends curve trading; quotes and trades then fail1609.
Eligibility itself leaves redemptions fully funded and can reverse after a sell.
Holders keep their tokens. CPMM uses its own on-chain timestamp opening, normally
current timestamp+1, so a brief pool-opening interval can follow graduation.
The final curve buy is separate from the proven atomic migration transaction;
no untested combined final-buy/migration transaction is advertised as atomic.

## Financial proof and exact fixtures

For K=B/Q, p(i)=a+ceil((z-a)i/(K-1)), define
G(s)=sum(i=0..s/Q-1)p(i). Buys charge G(s+n)-G(s); sells redeem
G(s)-G(s-n). All operations use checked integer intermediates.

While selling is enabled: R=G(s)=rawIn-rawOut. Telescoping makes R independent
of the sequence of prior trades. Migration is allowed only at s=B and moves
exactly G(B), while the same atomic success replaces the prospective redemption
contract with an actual funded AMM. Thus no enforceable liability and migration
fund are counted against the same SOL at any committed intermediate state:

rawIn-rawOut = remaining curve reserve + migrated SOL.

Creator tokens + buyers + unsold trading custody + migration custody + AMM
holdings + any unsolicited residual custody = declared mint supply.
Returned tokens are already represented by net sold and custody, never counted twice.
Fees stay outside R, in separate PDAs not even supplied to migration. Accrued
fees = withdrawn + claimable for each beneficiary. Claims remain authorized and
functional after migration. No rent or fee liability pays pool setup or liquidity.

The reference1b whole-token launch remains10m creator,594m trading,396m migration.
Q=one whole token, prices42→126lamports, gives exactly50,192,999,999lamports
at completion,296,703,003 above the earlier1,000-token-quantum reference. This
ceiling-granularity effect is documented, not a fee increase or hidden subsidy.
Initial AMM price R/M is59.52380932bps above126, within the60bps bound. Smaller
supported purchase quantity is one whole token, not a concealed1,000-token lot.
SOL-budget selection returns maximal affordable integral Q with fees included.

The executed1000-token fixture proves:

- Creator10 + buyers594 + pool396 =1000 immediately after graduation.
- Buyer expenditure53,567 = net redemptions2,813 + migrated SOL50,192 +
  platform fees422 + creator fees140, all raw lamports, excluding sponsor network fees.
- Both fee claims reduce claimable to zero and do not change pool reserves/pricing.
- After actual AMM buys/sells: creator10 + buyers591 + pool399 =1000.
- Wrapped SOL after those swaps: buyer10,157 + pool50,035 =60,192,
  equal to original pool50,192 + separately wrapped trading funds10,000.
- LP supply remains0. A pre-funded migrator donation1,000,000lamports stays intact.

V4/V5 fees remain nominal75bps platform/25bps creator: total=ceil(raw/100),
lifetime platform=ceil(3*totalAccruedFees/4), creator remainder; execution uses
deltas. This conserves entitlements, with less than one lamport aggregate fee
rounding per trade. Tiny trades can exceed nominal1% effective cost; splitting
cannot reduce total fees. Legacy V3 compatibility is unchanged. Post-graduation
CPMM fees follow that AMM, not an unimplemented JeeT75/25 collection mechanism.

## Setup costs, rent and permanence boundaries

The local official-format config charges150,000,000lamports to CPMM's fixed
protocol receiver. Executed net setup debit is190,117,440lamports, including
40,117,440 of retained account rent; network fees are separately sponsored.
This is third-party setup cost paid by a deliberate caller, not a JeeT migration
surcharge or deduction from reserve/beneficiaries. Production still needs a
transparent willing payer/funding policy; test funding proves mechanics, not
guaranteed funding for every future launch.

Unused setup budget is refunded. Only newly funded empty source/LP ATAs are
closed; pre-existing deposits/accounts are preserved. Curve/terms/fee state has
no user/admin closure path. Existing unsolicited residual balances have no
arbitrary recovery/withdrawal backdoor. Prefunded source accounts can leave
additional retained rent within the bounded caller budget; broader donation and
rent-recovery policy merits independent review.

For this tested code path, all initially withdrawable LP is burned, LP supply0,
with CPMM's virtual denominator retained. The prior standalone checkpoint also
rejects LP withdrawal/remint and executes post-burn trades. Neither creator nor
JeeT payer owns an initial principal-withdrawal position. This does not prove
permanence across future external program upgrades. Raydium upgrade/admin
control, future JeeT upgrade governance and public bytecode equivalence remain
trust boundaries. No mainnet permanent-liquidity assurance is made.

## Stable program errors

|Code|Meaning|
|---|---|
|1600|Malformed instruction/account count|
|1601|Invalid account/PDA/program/configuration/ownership relationship|
|1602|Missing signer or wrong terms creator|
|1603|Not completion eligible|
|1604|Stale sequence or late imposition of terms|
|1605|Price gap, tolerance or pool-depth violation|
|1606|Setup funding/refund budget violation|
|1607|Checked arithmetic failure|
|1608|External pool/reserve/LP proof mismatch|
|1609|Already migrated / curve trading closed|
|1610|Protected opening or enabled wallet-cap phase still active|

Existing V5/System/SPL/CPMM errors propagate accurately.

## Verification and remaining work

See graduation-verification.json for command results/tool versions and
graduation-local-evidence.json for genuine local transaction signatures, errors,
proofs, CUs, wire size, exact balances and artifact hashes. Signatures there are
local ledger evidence, not public explorer transactions. Run fresh locked JeeT
builds plus `npm run amm:build:local`, `npm run test:graduation:client` and
`npm run test:graduation:local`, then the full legacy/V5 suites.

Current Devnet read-only observation confirms the official AMM/configuration and
metadata program exist. Devnet's RPC airdrop returned HTTP410 and explicitly
requires the web faucet; no program deployment or Devnet lifecycle is claimed.
The local test artifact cannot safely be used as a public candidate identity.

Still unfinished: public V5 trading/wallet integration, complete metadata/storage
flow, real indexed Explore/integrity pages, public Devnet candidate deployment
and E2E lifecycle, production setup funding and authority governance review.
No mainnet activity or production funds are authorized. Independent audit remains
separate from this internal verification.
