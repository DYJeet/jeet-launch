# JEETCRV5 proposal — not an implemented launch contract

Parent checkpoint: 2190321faf0d4167bc60c6097b5ba107c8f167d8.
Status: designed but unimplemented; allocation and terminal settlement pending
owner approval. No legacy state or program instruction is modified.

## Partition and prospective contract

Require checked u64 parameters S, A, B, M with S=A+B+M, B>0, M>0,
and the existing creator maximum A/S<=5%. No default M or percentage is selected.
B is net curve inventory capacity; M is isolated, never purchasable inventory.
Creator-owned tokens remain ordinary SPL tokens and retain their owner.
Returned tokens increase tradable custody; they are not a fourth independent
allocation. Before migration the exact equation is A+netOutside+tradeCustody+M=S,
where netOutside=B-tradeCustody. Ordinary transfers between holders do not change
this aggregate. Per-wallet gross purchase receipts never decrease on sells.

Proposed distinct migration vault: canonical ATA owned by a mint-specific PDA
with seeds ["migration", mint]. Separate it from ordinary launch inventory;
validate token owner, mint, delegate, close authority and token program. Proposed
state seed ["graduation", mint] binds the V5 curve, both vaults, pinned venue,
canonical pool and LP disposition. These are proposed seeds, not deployed PDAs.
V1–V4 entrypoints must reject the V5 discriminator before any transfer.

## Reserve and cutoff alternatives

While Active, retain V4 raw buy ceil(delta F) and sell floor(delta F), fixed
75/25 nominal fee carry, opening/cap rules and monotonic trade sequence. Record
actual reserve R and gross redemption backing L=floor(F(netSold)); fee liabilities
and rent remain separate. R-L is rounding surplus, not a dependable pool budget.
No separately designated migration SOL exists merely because a curve completes.

For new launches only, the proposed terminal policy is a pre-disclosed replacement
of curve redemption by AMM trading. It needs explicit acceptance before launch:
completion at netSold=B closes further buys, but does not by itself authorize
exporting redemption backing. Preferred safety: retain sells until an atomic
migration transaction both terminates curve redemption and establishes usable,
permanently committed liquidity. If a sell lands first, netSold<B and migration
must fail stale eligibility; completion state must distinguish historical threshold
from current migration eligibility. A later buy may reach the threshold again
only under explicitly approved V5 reopening semantics. Do not copy V4's irreversible
buy-close flag while promising this recoverability without resolving that conflict.

Alternative: the final buy atomically initializes the AMM and permanently commits
LP. Failure rolls back that buy; completion cannot strand holders in a closed,
unmigrated state. This requires measured transaction size/compute feasibility,
prevalidated pool accounts and funding of external setup costs. The alternative
is not selected or claimed implemented. Neither alternative changes V4.

## Price continuity derivation

At B, let R be actual raw reserve and p_last=(P*q+D*(B-1))/q² lamports per
base unit; p_next=(P*q+D*B)/q². The final bulk execution average is
ceil(F(B)-F(B-n))/n, which differs from either marginal price for nonzero slope.
A proposed pool deposit X lamports and M base units has ratio X/M. For continuity
at p_last, require X*q²=M*(P*q+D*(B-1)). This is an integer divisibility condition,
not a license to round away liabilities. At zero slope, no-rounding full-sale
reserve implies M=B if X=R. For a large slope-dominated linear curve, matching
M is approximately B/2, not an arbitrary copied platform percentage.

For approved B and M, report signed discontinuity exactly as the rational
(X*q²-M*(P*q+D*(B-1))) / (M*(P*q+D*(B-1))). Report pool fees, protocol minimum LP,
initial reserved LP, setup deductions and trade slippage separately: actual
post-initialization vault balances determine the verified AMM ratio. Never label
the pre-CPI transfer ratio the verified pool price. Choosing B, M, a cutoff policy,
setup funding and permitted price deviation remains an economic approval task.

## Migration transaction requirements

Permissionless caller pays explicitly disclosed external setup/rent costs; no
additional JeeT migration fee or implicit deduction from fee liabilities. Pin
approved executable AMM program and reviewed account derivations. Verify token
standards, wrapped SOL lifecycle and exact deposit deltas. Burn all withdrawable
initial fungible LP only if the protocol's actual withdrawal authorization proves
that burning removes every withdrawal right. NFT destruction alone is insufficient.
No administrator sweep, LP rescue or discretionary early migration instruction.

On atomic failure, original state and assets remain intact. Proposed conceptual
states: Active, Completed, Eligible, InProgress (transaction-local if atomic),
Migrated and RecoverableFailure (diagnostic only unless on-chain persistence is
safe without losing redemption). Failed Solana instructions cannot persist a
failure flag while also rolling back all writes. A permissionless diagnostic or
preparation instruction must not freeze trading, take funds or grant LP access.

All terminal states require real pool verification and permanent LP evidence.
Until an external integration passes these checks, no successful migration or
irreversible terminal transition may be enabled. Fee claims remain independently
valid after migration with their immutable beneficiaries and isolated balances.

## Approval / implementation gates

1. Approve B/M policy and final-price convention/tolerance; no concrete allocation
   has been approved by merely approving permanent liquidity policy goals.
2. Approve one explicit prospective redemption cutoff/recovery contract.
3. Pin maintained official AMM source/IDL/program IDs and prove LP permanence.
4. Reproduce baseline native/SBF/validator tests with restored toolchain.
5. Add versioned state/ABI and differential V1–V4 regressions before activation.
6. Verify external CPI, atomic completion/recovery, all race paths, claims and
   exact post-CPI conservation on local validator and real Devnet where supported.

No V5 program, pool initialization, LP burn, Devnet lifecycle or permanent lock
is claimed by this design document. See graduation-solvency.md and its executable
fixtures for the demonstrated V4 incompatibility.
