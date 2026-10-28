# V4 financial checkpoint results

Start: e8bce11ad81f287bef5f3949b73df6c03f771040. The commit containing this document
is the first master-completion financial checkpoint. The full master assignment
remains **INCOMPLETE**; see remaining-work.md. No mainnet or Devnet deployment was
performed and no production SOL or authority was used.

## Executed verification

| Gate | Result |
| --- | --- |
| Next production build / TypeScript | Passed |
| Default and local-only SBF builds | Passed; rebuilt hashes equal tested artifacts |
| Rust formatting | Passed |
| Native Rust | 9 passed per build, default and local-only |
| Existing fee SDK unit tests | 8 passed |
| New market mathematical tests | 5 passed |
| V4 default validator suite | 62 positive checks, 37 on-chain rejections |
| V4 local-only validator suite | 62 positive checks, 37 on-chain rejections |
| V4 corrupted-state fixtures | 5 on-chain rejections |
| Prior local regressions | All passed: allocation, custody, caps, pricing, protected opening, fees and claims |
| Prior fee suite specifically | 46 positive checks, 108 on-chain rejections including integrity fixtures |
| Prior protected opening specifically | 14 positive checks, 28 on-chain rejections, 9 invalid API cases |
| Prior real SBF browser fee flow | 7 positive checks, 4 pre-signing rejection checks |
| New SDK ESLint | Passed |
| Full frontend ESLint | Existing findings remain, explicitly not a passed gate |

The complete final validator run includes the new alternate-account and correctly
sequenced multi-instruction cap tests. Its local treasury fixture waits for its
faucet signature to confirm before measuring an exact claim payout. An earlier
run exposed that harness funding race; no payout assertion was weakened.

The V4 rejection count is 79 = 37 + 37 + 5. Positive check counts may differ by
one between independently repeated runs because concurrent seller winners can
leave one or two nonzero accounts to redeem during cleanup; every race outcome
has the same economic assertions. The recorded final run executed 124 positives.

## Exact financial reconciliation

All amounts below are lamports, across eight distinct launches **per build**:

```
buy consideration paid = net sell proceeds + curve reserves + all accrued fees
33,296,957 = 18,016,266 + 14,769,021 + 383,755 + 127,915
```

Default beneficiary accounting:

```
platform accrued 383,755 = withdrawn 0 + claimable 383,755
creator accrued 127,915 = withdrawn 654 + claimable 127,261
```

Separate local-only test-beneficiary accounting:

```
platform accrued 383,755 = withdrawn 1,963 + claimable 381,792
creator accrued 127,915 = withdrawn 654 + claimable 127,261
```

These equations exclude network fees and separately funded account rent. Every
successful trade additionally asserts the buyer's actual SOL change including
new receipt rent, or the seller's actual net SOL increase. The sponsor pays
network fees. Every curve/fee account's actual balance equals its rent floor plus
its accounted reserve/liability in these fixtures. Fee claims do not change the
curve account. One fractional-denomination round trip retains exactly one
lamport of documented curve rounding surplus.

All eight launches in each build conserve tokens **individually**: seven have
supply 1,000 base units and one has supply 100,000 base units (two decimals).
Creator allocation + actual custody + all tracked buyer accounts equals that
mint's supply, including ordinary transfers between buyers. Different mints'
base units are not an interchangeable asset. Full per-launch raw balances,
parameters, fees, local signatures and exact equations are in
financial-verification.json. Rejected transactions preserve all snapshotted
business accounts, excluding the separate sponsor's unavoidable network fee.

## Scope preserved and remaining

Creator allocation, custody PDAs, gross wallet/opening receipts and all V1/V2/V3
instructions/economics remain unchanged. V4 is opt-in for new launches only.
Its fee total is ceil(raw/100); cumulative carry allocates 3:1 with less than one
lamport of allocation error. Existing V3 independent component ceilings remain.
The default treasury remains HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP.

New V4 redemptions are real funded on-chain operations. Sell fees use the same
approved nominal 75/25 bps model and separate fee custody. Completion permanently
closes buys at net inventory exhaustion; funded sells remain available. No
migration, LP policy, metadata workflow or finished V4 browser trade flow is
claimed. No reserves or liabilities were released for an unapproved migration.

The frozen baselines are unchanged. All changed source, tests and documentation
are confined to jeet-app-next. Internal testing does not establish independent
audit status or production security.
