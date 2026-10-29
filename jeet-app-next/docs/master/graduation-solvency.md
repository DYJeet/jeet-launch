# Graduation solvency: V4 incompatibility and minimum versioned design

Inspected parent: 2190321faf0d4167bc60c6097b5ba107c8f167d8.
The approved permissionless graduation and permanent initial liquidity policy is
accepted. It does not supply a migration allocation or terminate existing claims.
No migration instruction or liquidity permanence claim is implemented here.

## Existing V4 proof

Let S be minted supply, A creator allocation, I=S-A initial custody inventory,
s net curve units sold and q=10^decimals. Define
F(s)=(P*s*q+D*s*(s-1)/2)/q², without intermediate rounding.
Each buy pays ceil(F(s+n)-F(s)) into reserves; each sell debits
floor(F(s)-F(s-n)). Thus reserve R >= F(s), with excess from integer rounding.
Gross cap receipts never decrease. Fees are separate liabilities and never R.

At first completion s=I, canonical remaining custody inventory is I-s=0.
Consequently the existing allocation provides **zero** migration tokens.
Unsolicited token donations are not a deterministic migration allocation. Creator
or holder tokens cannot be reassigned to fix this shortage.

The gross full-redemption obligation is floor(F(s)), assuming an economically
valid nonzero net redemption. Sell fees are part of that gross debit, not spare
reserve. Conservatively reserve floor(F(s)) even for dust cases. At completion,
R-floor(F(I)) is at most rounding surplus on a single initial buy, and can be
exactly zero. For integral whole-unit fixtures it is exactly zero. Arbitrarily
many round trips cannot establish a guaranteed migration budget: an adversary
can simply choose the zero-surplus path. Rent and fee liabilities add no available
budget. Burning an LP token cannot remedy either initial funding deficit.

V4 completion permanently closes buys, but explicitly permits funded sells.
Closing those sells to export backing would change existing redemption behavior.
Permissionless migration must therefore remain unavailable for existing V4.
This is a mathematical incompatibility, not a discretionary approval gate.

## Minimum new-launch version proposal — not approved economics

A new discriminator/initializer must explicitly partition S=A+B+M, with B the
curve-sale inventory and M>0 designated migration inventory. Preserve A, existing
launch records and all old entrypoints. M cannot be chosen silently; decreasing
B changes launch economics and needs approval of the allocation/formula.

While trading, retain the same funded inverse and gross caps. For a new version
only, approval must explicitly establish whether reaching B atomically replaces
curve redemption eligibility with permanently committed AMM liquidity. Without
that change, retain gross redemption backing L=floor(F(B)); migration SOL X must
satisfy X <= R-L, and may be zero. Additional explicitly funded SOL is an
alternative; it must not come from fees or from rent.

If a new-version terminal settlement is approved, the transition must be atomic
with verified pool creation and permanent LP disposition, or retain a recoverable
backed state while no assets have left custody. Merely setting a completion flag
must not remove existing redemption access. Do not create a timeout/admin path
that can release committed LP or consume reserved liabilities.

For no spot-price jump, the token/SOL seed ratio must satisfy X*q/M = p_final,
where p_final is an explicitly chosen marginal-price boundary convention. The
last purchased base unit has price (P*q+D*(B-1))/q² lamports per base unit; the
next marginal unit has (P*q+D*B)/q². With integer X and M, exact equality may be
impossible. The new policy must state the convention and bounded rounding rule;
residual tokens/SOL remain accounted and cannot be swept by an administrator.
Neither M, terminal settlement, external pool costs nor ratio tolerance is yet
approved. No concrete percentage or supply reallocation is proposed as fact.

## Integration status

Raydium cp-swap remains a venue candidate, not a selected/proven integration.
Its actual deployed interface, token support, fees, LP mint authority and permanent
LP burn/lock semantics need pinned official-source verification and executable
CPI tests. No pool, migrated state, LP position or burn evidence exists yet.

Executable fixtures: scripts/test-graduation-solvency.mjs. They prove the zero-token
and zero-surplus counterexample, reserve inequalities under mixed sequences,
integer rounding surplus and the symbolic new-allocation conservation constraint.
These are mathematical fixtures, not an external AMM simulation or Devnet proof.
