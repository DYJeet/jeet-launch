# V6 milestone A: local wallet transaction infrastructure

Starting GitHub main: `7f5a8cccca6aa1eff33533aa488fcd627781d1ec`.
This runtime restored an older **clean** checkout at d53eb51. It was fetched and
fast-forwarded to the actual main before editing. No uncommitted work was lost.
The verified 6224974 financial ancestor is present and unchanged.

## What this checkpoint implements

The local-only `/local-wallet` workspace uses the existing maintained Solana
Wallet Standard plugin for discovery, connection, reconnection and signing.
The executor calls `signTransactionMessageWithSigners`, never a wallet's
sign-and-send feature. Read-only/send-only wallets cannot silently broadcast.
No private keys, seed phrases or server signing credentials enter this path.

Explicit server configuration is required:

```
JEET_LOCAL_WALLET=1
JEET_LOCAL_WALLET_RPC=http://127.0.0.1:8899
JEET_LOCAL_WALLET_GENESIS=<the running local validator's actual genesis hash>
```

Start Next on a loopback host. The environment endpoint and RPC proxy reject
disabled mode, known Devnet/mainnet genesis identifiers, non-loopback upstream URLs,
remote Host authorities and cross-origin requests. No fallback to mainnet or
Devnet occurs. The public/default V5 program gate remains unchanged.

Wallet Standard requests use `solana:devnet` as a compatibility label for the
disposable local cluster. This **does not identify or change a wallet extension's
global network setting**. The account must support the requested chain/version;
RPC genesis and the expected executable local program are checked separately
before preparation, after signing, and during confirmation. The workspace
explicitly labels actual balances as local, not Devnet.

Transactions are simulated, checked against 1,232 bytes, and have their network
fees and available SOL checked before signing. Callers remain responsible for
putting economic spend/slippage limits into the real program instruction; the
executor's balance check is not a replacement for on-chain expenditure bounds.
All authoritative amounts use bigint. Wallet message modifications are rejected.
Disconnects, identity/chain changes, cancellation and expired signing cannot
broadcast the reviewed transaction afterward.

The signature and last valid block height are saved before sending. Storage
failure prevents submission. Module locks and browser Web Locks coordinate
actions and reconciliation across components/tabs. A confirmation callback
cannot erase a newer saved signature. Browsers without Web Locks fail closed.
Confirmation uses bounded HTTP polling, so WebSocket availability is not needed.
Transport failure after broadcast is classified as uncertain until the known
signature is reconciled; it is never reported as a successful transaction.
An unresolved record blocks another submission, including after a reload.

The application issues one send RPC, with at most three server retries of the
**same signed wire**. It never automatically rebuilds, re-signs or submits a new
transaction. Finalized height beyond validity and a second history lookup are
required before declaring an unobserved transaction expired. Reconciliation
does not store or reconstruct signed wire bytes.

The loopback proxy preserves raw JSON numeric lexemes for Kit's bigint parser.
It rejects batches, arbitrary methods, faucet/deployment operations, unbounded
program scans, oversized wires, skipped preflight and excessive retry requests.
There are request-size/concurrency limits and bounded upstream timeouts.
This is a local development endpoint, not a production public RPC service.

## Actual browser evidence

`wallet-browser-evidence.json` records the completed run, actual validator
genesis, signatures, artifact hash, transaction sizes and exact balances.
Eight positive groups and five rejection groups passed at 390px and 1440px.
The tests cover discovery, connection, real local SOL reads, genuine signing,
confirmation, disabled duplicate clicks, cross-tab lock exclusion, wallet
rejection, injected wrong-RPC genesis, reconnect after reload, disconnect,
cross-origin rejection, client errors and horizontal overflow.

The adapter is a disposable Wallet Standard wallet with genuine Ed25519 keys
and real local transactions. A wallet response or financial success is not
fabricated. Installed Phantom/Solflare extensions, native mobile deep links
and hardware wallet interaction have **not** been manually accepted.

The deliberate connection check moves one test lamport to the same account;
there are no platform/creator trade fees on this ordinary System transfer.
Each transaction is 185 bytes. Exact per-wallet lamports:

```
1,000,000,000 before = 999,995,000 after + 5,000 network fee
```

Across both wallets: 2,000,000,000 = 1,999,990,000 + 10,000 network fees.
Rejected wallet/network attempts did not change SOL. This test creates no
token supply and is not proof of a browser token launch or trade lifecycle.
Faucet setup explicitly waits for finalized funding before opening the wallet
journey; an airdrop request response alone is not confirmation.

## Fresh verification and recovery corrections

Twenty-two state-machine/security unit tests pass, separately identified from
validator evidence. They include exact decimal/u64 bounds, configuration and
RPC rejection, missing program, insufficient funds, simulation failure,
expired signing, duplicate actions, wallet substitution, storage failure,
lost response, unresolved reload, on-chain failure, interrupted signing,
read-only/send-only wallets, changed genesis and reconciliation races.
With existing deterministic SDK/math/HTTP tests: 83 pass, none skipped.
Production build, TypeScript and ESLint pass.

Rust/native tests: 13 default / 17 local. Fresh JeeT default/local SBF builds
and the pinned official Raydium CPMM build pass. Tools were restored from
trusted pinned sources: Node 24.22.1, Rust/Cargo 1.99.1; Agave 2.3.13 with
platform 1.48 for JeeT, builder 4.5.0/platform 1.57 and explicit ABI v0 for CPMM.
The known old SBF undefined-syscall warning remains; genuine validator execution
is independently tested. The two SBF SDK installers are run sequentially.

The first V5 regression exposed an output-directory mismatch, not a financial
source change: CARGO_TARGET_DIR directed fresh compilation to fresh-native/deploy
while runners still read target/deploy. `custody:build` now explicitly specifies
its output directory. Fresh artifact hash:
`4691dffcbf4907d1826e386a1736b86d0779bc60511e37bd6095cf5efbf7ecb3`.
The affected suites were rerun using that freshly compiled default executable;
the earlier stale-default run is not counted as fresh verification.

- Full legacy runner: final PASS marker. Fees 46 positive / 108 rejection
  including integrity; V4 125 positive / 79 rejection including integrity;
  protected opening 14 positive, 28 chain and 9 API rejections. Allocation,
  custody, cumulative caps and pricing also pass. Positive race cleanup counts
  can vary without weakening rejection assertions.
- V5: 25 positive, 42 transaction and 7 integrity rejections.
- Graduation: 28 positive / 51 rejection; actual CPMM pool/LP burn and swaps,
  duplicate migration, atomicity and fee claims. Fresh migration measures
  1,158 bytes / 310,132 compute units.
- Metadata: 6 positive / 21 rejection. Exact token units remain
  10,000,000,000 + 75,000,000,000 + 519,000,000,000 + 396,000,000,000
  = 1,000,000,000,000. Exact lamports remain
  5,000 = 1,357 seller receipts + 3,579 reserve + 48 platform + 16 creator,
  excluding separately sponsored rent/network fees.
- Existing revenue browser: 7 positive / 4 rejected; responsive route checks: 10.

See wallet-verification-results.txt for command-log excerpts and companion JSON
for fresh transaction evidence. Existing financial tests/expectations were not
removed or weakened. All Rust financial sources are unchanged from starting main.

## Remaining work and durable continuation

Milestone A is local wallet infrastructure, **not complete V6**. Browser V5
creation, metadata upload/activation, buy/sell panel, live token pages/indexing
and post-graduation AMM routing remain to be connected and accepted end to end.
Token-account balance integration and installed-wallet/mobile acceptance also
remain unfinished. The existing revenue browser's real claims do not establish
a complete new V5 trading user journey.

Unfinished creation work is separately preserved on
`development/v6-creation-recovery-20261030` at
`56e66eab2680703f207e31e2679376f10981d6fa`: local content-addressed upload
preparation and wallet-side instruction assembly. It is not included in this
verified milestone and is not advertised as a finished creation path. Four
additional launch-plan unit tests pass locally, but that is not browser or
on-chain acceptance of the new assembler. Do not discard it or repeat financial
engineering. Resume by declaring the pinned sharp dependency, testing actual
asset storage/decoding, then connecting a resumable signed creation flow that
verifies metadata before the existing atomic authority/terms activation bundle.

Devnet: read-only metadata-program recovery succeeded, but no deployment or
funded Devnet lifecycle was executed. RPC faucet HTTP 410 directs users to the
official interactive faucet; no limit bypass, production treasury key or real
funding was used. A funded disposable deployment identity/cost budget and an
independent security review remain deployment boundaries. No mainnet operation
is authorized or performed.
