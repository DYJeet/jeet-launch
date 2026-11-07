# Milestone D local graduation and Raydium evidence

The verified Milestone C baseline was `151d4991a42f20f258cd3fd89c822993fcd94015`. The first complete WIP was `bcb4846b8cc5da6140af32e36615b48e8a935419`. Final code and tests were run from `69936bf8c7cac1515872a117a82064190087b6fd` on `development/v6-milestone-d`.

## Local browser lifecycle

Chromium 156.0.8078.73 at 390px and 1440px used disposable Wallet Standard signers, live Pinata metadata, and Agave 2.3.13. Each viewport created and activated a mint, bought and sold on the curve, filled curve inventory, showed eligibility before migration, approved caller-funded setup, signed migration, verified pool and burn state, and signed both Raydium swap directions. The page restored the confirmed migration signature, AMM routing, and balances after reload and wallet reconnection. It waited for Raydium's on-chain opening time without manual refresh.

| Viewport | Pool | Migration | AMM buy | AMM sell |
| --- | --- | --- | --- | --- |
| 390px | `8pSWxxMwtQQqcwGuqS419hWyPdCLMPDiQVutDxNLtHgu` | `2VM9tqKA9CoLf8TkuxrKvrwHvvpUAGwW5ZMmYsJnsvqdCPnpMPu6RaXnVLbdFs3Akan8tG7mdfteVtMqtDn8iiyX` | `2tEvp7Lir7vA1Y6BnA5XNzcd54qVgnFWq9kmdDWEcoGjWT6ytSSfLDKu31nb1kXbgg5PD65TqtEhQNhpLMaB5h5e` | `57sNZTcsVJ1WgDqtsxYY5AVzC44LHbnNyCNSTWZ5CEvzkZc8ey9cwnB5y7Vzhw4cqimMzCfAv9eXVTXNvjpGnNk4` |
| 1440px | `G87zFJPygoCobfWoXFQJtddsV1dQ2mc8nLYy6FLSoYKT` | `4xVaL8mg7xPKeJytccYDHKHYDKuMhCSMX8wQ8FLnJu2fvhh3ACex6JBB1sU3n2bnzoL1RzTfnQpBaS36yNgn77kC` | `51Jg59ymAoSmZHg517aj6ZL4aCTZ1X51ZMCEWwuXtNcXkQgEQDN8Vd9JJMpo43sYK2E6RJUKuyEk25LCPP9RM7AC` | `3M4B87QyojJrtaEdYAS51TLqZUn8fyKAknem3Tms8zoXDX9NCuAvqM9FRw6qKo7BqpnmVtt6xjy1EoiTULvPWaAL` |

Local genesis `2BsvadyA2gKeRKpAYsJqDdxeG9EMeYfYnW32vbSbqHrU`. JeeT test program `8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo`. Raydium CPMM `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`, pinned [source](https://github.com/raydium-io/raydium-cp-swap/tree/f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5), SBF SHA-256 `4a04a78dbe3c643acdb1a4c20166c18b2e1391522a794f670a77bd305a0d4433`.

## Exact reconciliation per launch

Eligibility followed full net sale of 594 curve tokens, after opening restrictions expired. Migration deposited 396 migration tokens and exactly 50,192 reserve lamports into the verified token/WSOL pool. The curve reserve and both inventory balances ended at zero. The migrator token, wrapped SOL, and LP accounts were closed. The migration burned 4,358 initial LP units and SPL LP supply read zero. Initial LP burn evidence does not cover later issuance or external program controls. The wallet paid 190,117,440 lamports of setup costs excluding its network fee. Raydium received 150,000,000 of that amount. The creator and platform fee accounts were byte-for-byte unchanged by migration and both swaps. The two migration transactions were 1,062 bytes and used 311,632 and 304,132 compute units.

| Point | Wallet lamports | Wallet tokens | Pool WSOL lamports | Pool tokens |
| --- | ---: | ---: | ---: | ---: |
| After migration | 773,201,615 | 604 | 50,192 | 396 |
| After AMM buy | 773,190,615 | 611 | 51,192 | 389 |
| After AMM sell | 773,181,772 | 601 | 50,035 | 399 |

The 1,000-lamport buy delivered 7 tokens with a 7-token minimum and 3 lamports of Raydium input fees. The 10-token sell delivered 1,157 lamports with a 1,152-lamport minimum and a 1-token Raydium input fee. Each swap cost 10,000 network lamports. Temporary WSOL account rent was returned within the swap transaction. Wallet and pool held all 1,000 issued tokens throughout. Raydium fees and JeeT curve fees were accounted for separately.

## Test results and scope

- `JEET_CREATION_STORAGE=pinata JEET_BROWSER_GRADUATION=1 npm run test:wallet:creation:browser` passed 16 positive and 19 rejection groups. Wallet rejection left graduation funding, custody, fees and pool balances unchanged. The suite also checked wrong genesis, failed provider requests, duplicate launch attempts, and failed curve signatures.
- `npm run test:graduation:local` passed 28 positive and 52 rejection checks, including premature graduation, opening and cap enforcement, low setup and compute budgets, initialization failure, account/program substitution, concurrent and duplicate migration, post-migration curve buy/sell rejection, fee isolation, and exact conservation.
- `npm run test:amm:cpmm` passed 4 positive and 8 rejection checks. A genuine pool initialization rolled back when SPL rejected an oversized LP burn. The suite also rejected stale reserves, too-high minimum output, insufficient wrapped SOL, and withdrawal or remint attempts against the burned initial position.
- Production builds, TypeScript, ESLint, and 93 targeted JavaScript/SDK tests passed. The SDK suite covers bounded quotes, malformed config, transaction size, wallet disconnect, expiry, duplicate submissions, and uncertain confirmation recovery. Injected wallet/RPC failure cases are distinct from genuine successful browser transactions.
- The unchanged financial programs, pinned SBF and V5, legacy, and native Rust suites retain their Milestone B/C evidence. D ran the pinned programs on fresh ledgers. It did not rebuild the unchanged Rust programs.
- Verification is local with a disposable wallet harness. Installed Phantom/Solflare and native mobile wallets, Devnet, mainnet, and independent audit remain unverified.
