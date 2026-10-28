# Financial candidate authority and threat model

Scope: V1–V4 custody, purchases, V4 redemptions and fee claims. This is an
internal review inventory, not an independent audit or a production certificate.

## Authority inventory

| Authority | Actual control | Production preparation |
| --- | --- | --- |
| Mint authority | Creator signs custody/opening/curve initialization while authority is active; tested workflows revoke after initialization | Read the actual mint on every integrity report; never infer revocation from a UI checkbox |
| Freeze authority | SPL mint field; tested workflows revoke it | Verify actual field; no silent irreversible revocation |
| Custody authority | Mint-specific launch PDA signs only validated token transfers | No private key or generic inventory withdrawal instruction |
| Curve reserve | Curve PDA owned by JeeT program; V4 sell can debit only its accounted reserve | No sweep, migration or administrator reserve withdrawal implemented |
| Treasury beneficiary | Compile-time approved HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP | Beneficiary must sign; destination equals beneficiary; no rotation instruction; wallet control not established by knowing address |
| Creator entitlement | Immutable identity stored at custody initialization, then bound into creator fee PDA | Creator must sign and receive their own claim; no reassignment instruction |
| Program upgrade | Loader deployment authority, outside application PDA authorization | Inspect actual ProgramData before deployment; establish approved multisig policy; do not assume immutable or single-key safe |
| Opening configuration | Written once at initialization; Clock slot enforced on-chain | No runtime early-buy, reset or cap exemption authority |
| Metadata update | No verified integrated metadata authority workflow in this phase | Must be implemented and reported accurately; never label immutable without chain verification |
| Migration / LP | No migration or LP authority implemented | Token allocation, LP ownership and redemption resolution require explicit policy |

The local-fee-test build deliberately has a separate program ID and public,
disposable test beneficiary. Never deploy that artifact to a public network.
The default program ID and a generated build key do not establish matching
program deployment authority. No production authority was changed in this phase.

## Trust boundaries and attack surface

The browser and RPC transport are untrusted quote providers. The program validates
canonical PDA seeds, owners, lengths, discriminators, mint relationships, token
owners, executable SPL/System programs, signer privileges, current economic state,
exact raw consideration, full buy maximum or sell minimum, and trade sequence.
Any writable-account/CPI failure rolls back the whole Solana transaction.

The token owner can use alternate token accounts, delegate ordinary SPL transfers
or receive secondary transfers. Buys always charge cumulative wallet receipts;
sells require the token owner signer and never restore gross opening/cap allowance.
Ordinary SPL transfers are neither taxed nor prohibited. These are opening purchase
limits, not a promise to cap all secondary holdings or to prevent Sybil wallets.

Program upgrade authority can replace program logic. An RPC/compromised frontend
can mislead users or deny service but cannot waive program checks. Users must
inspect the program, network, accounts and signed spending conditions. No hidden
emergency administrator or suspension backdoor has been added.

## Financial boundaries

Each mint has independent platform and creator fee PDAs. Fees cannot fund sells;
claims cannot debit the curve account. Rent floors remain in program accounts.
There is no account closure/rent-recovery instruction. Unsolicited deposits do not
create claim entitlement or alter the pricing cursor. Surplus curve rounding SOL
remains reserved; no owner sweep is implied.

V4 redemptions consume the final marginal interval of the net pricing cursor.
Creator allocation and secondary holdings are fungible SPL tokens, not separately
redeemable entitlements: no redemption can exceed aggregate net sold inventory or
funded reserve. A creator can sell eligible fungible tokens after launch start
subject to those same rules. This is a material economic property for disclosure.

A completed V4 curve cannot reopen purchases. Redemptions remain available and
funded; migration is not implemented and must not seize their backing. A future
migration must resolve this obligation explicitly before moving reserve assets.

## Review priorities

1. Independently prove path-independent curve solvency under every segmentation
   of integer buy/sell intervals, donations and concurrent transaction ordering.
2. Review V4 fee carry across buys, sells and claims and finite u64 lifetime limits.
3. Review initialize-through-V3 then atomic V4 resize; no existing record upgrade.
4. Review all legacy entry paths, ownership/signature checks and account aliasing.
5. Review upgrade/deployment supply chain, RPC/frontend compromise and signer UX.
6. Reassess dependencies and BPF reachability of recorded Rust advisories.
7. Finish metadata, discovery, V4 UI and Devnet evidence before claiming readiness.
