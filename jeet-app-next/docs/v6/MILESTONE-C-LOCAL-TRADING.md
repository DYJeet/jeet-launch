# Milestone C local browser trading evidence

Tested branch head `84f209c9509e87e8b66fc570be2319a884d7ff95` over Milestone B main `176bd474f5156b7c9e699967e2ae35aeeaaa43b5`. The local-only trading panel uses the existing V5 pricing and Wallet Standard executor. No program source or financial parameters changed.

## Browser and validator

The live Pinata launch and trading suite completed with 8 positive and 13 rejection groups. Chromium 156.0.8078.73 exercised 390px and 1440px viewports using disposable Wallet Standard signers. Both viewports created and activated a real token with Pinata-backed metadata, bought and sold through the browser, and reconciled chain state and displayed balances after reload and wallet reconnection.

Local Agave 2.3.13 genesis `Ay63vaCdFRmG48Tb6ErVpg2wzjUcByQJnwT9egvwgYcB`. JeeT local fee-test program `8zhREvLzbAGnMPrQv9nQ4dzvgmq2unFAsLPaX9ZS3zo`, SBF SHA-256 `de162b056a588d075d186833f6e8ad2e355d7c8638ec9fbce8d2976414e11ebe`. Metaplex SBF SHA-256 `bb0842f6d5740eabe8f9fb3b723b9ecd89cadf9f48ef9ad6a9dc6cfa8a9658e4`. These are the unchanged Milestone B binaries.

| Viewport | Buy signature | Sell signature |
| --- | --- | --- |
| 390px | `2Ee5wTpquugfTuqRjjgpKPKSd6qVyLja8tQG1V4czFvaufqp6jW92bMf49h9wZgN2rG29yD2Nrufk1shrnVdQeCw` | `22wVnaMiDxm9oFE2madxHKepSY6383njmgZcyUWqrsmvia3srztHbktpSmQPWcQod1dSLUZ1dU8DsNAzanD9CVow` |
| 1440px | `5HV3bmL3BvjvLcPqEYQHeb9aTJvBk6N3dadiwFct3KqLe4DE8jbe6AA6P3RN6CzBF5BjZTDa5cjtQvDAvHhu4W4L` | `4KbETwR9ey9RHLXEg3pG96XUQiRmvFqSqBHsfEb2AWJZFRwwuiibhmR5A1DWP6TFS4MERWVZrZwpMdZJCBJWCP8o` |

## Exact accounting per launch

All SOL amounts below are test lamports. Tokens have zero decimals.

| State | Wallet lamports | Curve reserve | Platform accrued | Creator accrued | Wallet tokens | Curve custody | Migration custody |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Activated | 964,844,400 | 0 | 0 | 0 | 10 | 594 | 396 |
| After buy | 963,383,784 | 966 | 8 | 2 | 32 | 572 | 396 |
| After sell | 963,379,270 | 475 | 12 | 3 | 21 | 583 | 396 |

The 1,000-lamport budget bought 22 tokens for 976 lamports. That equals 966 curve consideration + 8 platform fee + 2 creator fee. The wallet also funded 1,454,640 lamports of buyer receipt rent and paid a 5,000-lamport network fee. Redemption returned 11 tokens and 486 lamports to the wallet before network fees. The reserve paid 491 lamports, of which 4 went to platform fees and 1 to creator fees. The sale paid another 5,000-lamport network fee. Reserve, fee account balances, accrued balances, wallet balance, and token custody were checked independently. Each phase retained 1,000 issued tokens.

## Verification and scope

- `JEET_CREATION_STORAGE=pinata JEET_BROWSER_TRADE=1 npm run test:wallet:creation:browser` passed against the genuine local programs. The intentionally rejected browser buy left balances and market state unchanged.
- `npm run test:v5:local` passed 25 positive cases, 42 on-chain rejection and rollback checks, and seven additional state integrity cases. This includes stale trades, account substitution, spend and minimum output bounds, cumulative wallet caps, protected opening, concurrent redemption, and reserve solvency.
- Production builds, ESLint, TypeScript, and 89 targeted JavaScript tests passed. The tests cover wallet infrastructure, V5 pricing, quote bounds, activation and migration gating, metadata, graduation client logic, fees, and RPC reads.
- `npm run test:graduation:local` passed 28 positive and 51 rejection checks. The genuine local Raydium transaction used 1,158 bytes and 293,632 compute units. The suite verified graduation, post-migration trading on the AMM, fee claims, initial LP burn, and SOL/token conservation.
- `npm run test:wallet:browser` passed 8 positive and 5 rejection groups across both viewports. It verified real signing, duplicate submission protection, rejected signatures, network mismatch, reload/reconnect, and cross-origin rejection.
- Reused Milestone B’s locked native Rust, legacy financial, and SBF build evidence for unchanged sources. This run verified the SBF hashes and executed them on a fresh validator.
- Installed wallet extensions, native mobile wallets, Devnet and browser AMM swaps were outside the executed evidence. The Chromium test uses a disposable Wallet Standard harness. No production funds or endpoints were used.
