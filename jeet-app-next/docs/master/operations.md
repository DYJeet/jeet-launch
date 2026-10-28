# Candidate operations and deployment hold

No mainnet deployment, production transfer, real tradable-token creation or
irreversible authority change is authorized. This document prepares operators;
it is not an instruction to perform those actions now.

## Incident procedures supported by the current implementation

| Incident | Safe response | Limitation |
| --- | --- | --- |
| RPC outage/rate limiting | Stop requesting signatures, show error, verify provider genesis and program before retrying; use a known correct endpoint | Current frontend retry/fallback work remains incomplete |
| Frontend outage or suspected compromise | Disable compromised hosting, preserve logs/build hashes, distribute verified program/ABI and transaction evidence through trusted channels | Frontend shutdown does not pause permissionless on-chain trading |
| Transaction timeout | Query the original signature and blockhash expiry before rebuilding; show unknown/pending until chain outcome is established | Never label a timeout a confirmed failure or automatically duplicate a financial instruction |
| Rejected/stale trade | Read current state and request a new program quote; require a new explicit signature | V4 sequence, raw-price and spending/output conditions reject stale execution |
| Failed claim | Read fee PDA and confirmed signature; retry only the actual remaining liability | Treasury and creator destinations cannot be redirected by the caller |
| Failed/partial deployment | Verify loader ProgramData, deployment buffer and executable hash before deciding whether to resume | No program deployment or recovery authority is assumed from its public address |
| Incorrect treasury | Do not activate the build; compare immutable beneficiary and artifact | There is no implemented treasury rotation or recovery backdoor |
| Suspected program vulnerability | Preserve state/transactions, notify independent reviewers and the approved upgrade-authority holders; disable risky frontend actions | No on-chain emergency pause exists; an upgrade is an explicit authority action requiring approval |
| Compromised upgrade authority | Escalate to the established custody/governance procedure and stop promotion | A future multisig/incident policy must be approved before production |
| Treasury key loss | Preserve liabilities and seek approved governance/recovery design | Current immutable beneficiary cannot be reassigned by an application administrator |
| Creator key loss | Preserve the launch's liabilities | No creator entitlement rotation or delegated recovery is implemented |
| Migration failure | Do not transfer assets or mark migrated; retain all backing and claims | Migration is currently absent; no retry instruction or resulting pool is claimed |

Record network/genesis, program ID, transaction signatures, account snapshots,
slots, artifact hash and observed errors. Never collect or publish private keys.

## Mainnet preparation checklist — not executable approval

- [ ] Finish all items in remaining-work.md; satisfy the complete master verifier.
- [ ] Complete professional independent security review and resolve findings.
- [ ] Approve migration allocation, LP ownership, redemption terminal policy and external costs.
- [ ] Verify maintained external protocol programs, pinned interfaces and cluster support.
- [ ] Establish matching deployment authority and secure multisig upgrade governance.
- [ ] Confirm approved treasury address and demonstrated authorized signer control.
- [ ] Exclude local-fee-test artifacts and every disposable key/fixture from deployment.
- [ ] Reproduce and hash default SBF artifact with reviewed locked toolchain/dependencies.
- [ ] Verify cluster-specific RPC/program configuration; no accidental mainnet fallback.
- [ ] Complete real Devnet lifecycle and record its distinct evidence/limitations.
- [ ] Review metadata update authority and accurately disclose mutability.
- [ ] Provision production RPC, hosting, domains, monitoring and alert ownership.
- [ ] Rehearse deployment, RPC outage, pending transaction and frontend recovery.
- [ ] Obtain explicit owner approval before mainnet deployment or real-fund use.

Rollback means returning the frontend to a previously reviewed artifact and
stopping promotion. It does not reverse confirmed on-chain trades or rewind
state. Any program upgrade must be separately reviewed for layout compatibility
and authorized by the actual loader authority; never rewrite Git history or
restore a database snapshot as a substitute for chain accounting.
