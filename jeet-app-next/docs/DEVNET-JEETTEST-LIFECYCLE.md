# JEETTEST: finalized 65/35 Devnet lifecycle

**PASS for the authorized single-token lifecycle.** Ten transactions finalized successfully; zero failed on-chain transactions. Verification used an independent finalized public Devnet RPC audit in addition to the Codespace harness. No further transactions follow this report.

Approved deployment checkpoint: `559468d2d46643026f5d6776d5449c64ad642347`, branch `repair/fees-65-35`. The original release, main checkout, recovery archive, repair checkpoints, credentials, and preserved 75/25 artifact were not modified. The new checkpoint adds public evidence only within `jeet-app-next`; it does not change application/program source or the approved artifact.

## Token and deployment

- [JEETTEST mint](https://explorer.solana.com/address/7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM?cluster=devnet): `7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM`.
- Program: `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D`; Devnet genesis verified. Program executable; post-lifecycle binary matches the approved 261840-byte artifact exactly, with zero trailing capacity bytes.
- Artifact SHA-256: `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa`.
- Approved treasury remains `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`, embedded once in the binary and recorded as the platform vault's beneficiary.
- Upgrade authority unchanged: `DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW`.
- Supply: 1,000,000,000 tokens, 9 decimals; creator allocation: 10,000,000 tokens (1%). Mint and freeze authorities revoked.
- After redemption: custody trading inventory 594,000,000 tokens, migration inventory 396,000,000 tokens, trader tokens zero. Their sum with creator allocation equals the entire supply. No new supply was minted after activation.
- Metadata name/symbol/URI verified on chain; immutable metadata, creator update authority. The public HTTPS document returned 200 with SHA-256 `52c5c5938983a47408df9c14cf431d74eaa73b9c3fd63e5119f990baa03f466f` before execution. No authenticated gateway request or paid service was used.
- Final independent audit slot: 523452309.

## Lifecycle results

| Check | Result |
|---|---|
| Single token creation and activation | Passed; mint, supply, custody, opening, curve, fee vaults, metadata and immutable terms initialized |
| Creator allocation | Exact 1%; creator entitlement immutable |
| Opening wallet cap | 100 bps / 1%; oversized simulation rejected with 1005 |
| Pre-opening protection | Simulated buy rejected with 1200 |
| Protected-window cumulative limit | 50 bps; oversized simulation rejected with 1201 |
| Rejection integrity | All protected accounts unchanged; rejection tests were read-only simulations, not failed on-chain transactions |
| Buy | 2,400 tokens received; 103199 lamports curve consideration plus 1032 lamports fees |
| Sell | Entire 2,400-token test lot redeemed; 103199 lamports gross, 102167 lamports net |
| Reserves and supply | Reserve 0 → 103199 → 0; sold cursor 0 → 2400 tokens → 0; sequence 2; supply conserved |
| Creator claim | 722 lamports claimed by the existing disposable creator; claimable zero |
| Platform fees | 1342 lamports accrued and still claimable; zero withdrawn; no platform claim signed or submitted |
| Migration | Not performed; migration inventory untouched |

Protected-opening and wallet-cap negative checks were performed through public Devnet simulations against the genuine initialized accounts. The successful buy occurred after the protected window ended naturally, while the ordinary cap remained configured. No safeguard was bypassed.

## Exact fee accounting

| Trade | Gross curve lamports | Platform lamports | Creator lamports | Total fee lamports | Trader consideration lamports |
|---|---:|---:|---:|---:|---:|
| Buy | 103199 | 671 | 361 | 1032 | 104231 paid |
| Sell | 103199 | 671 | 361 | 1032 | 102167 received |
| Total | — | 1342 | 722 | 2064 | Net trading cost 2064 |

Nominal fees remain 65 bps platform, 35 bps creator, 100 bps total. Integer rounding matches the deployed lifetime carry: total fee = ceil(raw/100), cumulative platform entitlement = ceil(total accrued fees × 13/20), creator remainder. Both executable quote simulations and finalized trade event values matched. These integer amounts conserve every lamport; they are not represented as fractional lamports.

Conservation: 104231 paid = 102167 redeemed + 1342 platform fees + 722 creator fees + 0 remaining reserve. Creator accrued 722 = withdrawn 722 + claimable 0. Platform accrued 1342 = withdrawn 0 + claimable 1342.

## Financial reconciliation

| Item | Native Devnet SOL |
|---|---:|
| Initial payer | 1.604723880 |
| Initial creator / trader | 0 / 0 |
| Funding transferred internally | 0.045400000 |
| Total payer debit, including payer-paid fees | 0.045415000 |
| Final payer | 1.559308880 |
| Final disposable creator | 0.013626922 |
| Final disposable trader | 0.000837776 |
| Unspent test-wallet funding | 0.014464698 |
| SOL held in 13 launch/token/metadata/receipt accounts | 0.030890302 |
| All lifecycle network fees | 0.000060000 |
| Actual net wallet expenditure | 0.030950302 |
| Remaining total lifecycle budget, including unspent test-wallet funds | 0.019049698 |
| Additional payer-funding headroom under conservative 0.05 cap | 0.004585000 |

Account-held SOL includes rent, metadata-related deposits and the unclaimed platform fees; it is not all asserted to be refundable. No accounts were closed. Transfers between authorized wallets are counted once as funding allocation, not added again to rent/trade expenditures. Both the total payer debit and the net expenditure remain below 0.05 SOL.

Independent conservation: initial payer minus all three final wallet balances = 30950302 lamports = 30890302 held in launch accounts + 60000 network fees. Unexplained difference: 0.

## Safely resolved interruptions

1. The previous attempt stopped before signing on public RPC HTTP 429, with zero spending. Original state and logs were preserved. Recovery confirmed zero creator/trader history, unchanged payer balance, and no mint account. No alternate configured URL explicitly marked Devnet was available. The resumed harness paced requests at 1.5 seconds and implemented at most four exponential-backoff retries, honoring bounded Retry-After values. Any submitted retry reuses the same signed wire.
2. After creation, the first buy simulation correctly rejected because it would leave the trader SOL account below its rent-exempt minimum. No failed buy was broadcast. A separate preserved continuation combined a 400000-lamport top-up with the one buy atomically. The full combined transaction was simulated successfully before signing; trader post-buy balance 740609 exceeded the 650240-lamport minimum. The atomic transaction's two signatures cost 10000 lamports. Total lifecycle fees became 60000 lamports, and payer debit 45415000 remained within authorization. No additional token was created, and completed creation/protection checks were reused.

The Codespace stores the private mint signer, signed wires, raw transaction receipts, simulation reports, original stops and continuation logs securely in the ignored lifecycle directory. They were not published. No private keys, seed phrases, API credentials or platform treasury signature are included in this checkpoint.

## Finalized receipts

| Stage | Solana Explorer (Devnet) | Fee SOL |
|---|---|---:|
| funding | [3gh5kBuX…](https://explorer.solana.com/tx/3gh5kBuXBwrjL5JvDVre6N7VduE8rVZXL7LMFnk1AiDasjxRUFA3UJ4C1d1zu7efuVy1vf51h6NHhxbDwTrCiSrm?cluster=devnet) | 0.000005000 |
| mint | [4tRmXyHy…](https://explorer.solana.com/tx/4tRmXyHyiV978va3YDJqTn6DF47X7kgpi8nBbVmgxDn8A6tijcbJqm2CC19HLLi7E8R3v5Mb1io1WzEURaGvBkaA?cluster=devnet) | 0.000010000 |
| supply | [2Pa3M53L…](https://explorer.solana.com/tx/2Pa3M53LAhfPuQSVZoCu8KYp7t1vvkPkePgHtZXqXpygpeSv6nNVzTCc2LKPez38yrn3zKwcBA8SWhR4ZExyLzNn?cluster=devnet) | 0.000005000 |
| custody | [3BfXvfTF…](https://explorer.solana.com/tx/3BfXvfTFKG3pDGijUJEbCbhFjj5eHWsSpN2ervBUqeh9EjgnPMkF1mM76wrZrFev38J8HtswjvDBfXeiQNBLibH9?cluster=devnet) | 0.000005000 |
| metadata | [5YBKfda7…](https://explorer.solana.com/tx/5YBKfda7HVfbpwt3T4ymFnpxXyeyQV2JJ6yLNWzH65EwkVq4rtb9boo8WsYiAWg4vJcYrpBAUV1Vca8MKJQUFCP5?cluster=devnet) | 0.000005000 |
| activation | [5RRumiRo…](https://explorer.solana.com/tx/5RRumiRobaePtNFh8TEP6RG1KyhrjQhbC8SyCveR6Z6BGzykGzUmNtLPkzma6ME79t4ENsrHuFMwT26H21pa28uj?cluster=devnet) | 0.000005000 |
| trader-ata | [4J4xpj5Z…](https://explorer.solana.com/tx/4J4xpj5ZorztEKMcStqZawXWzUpXdG1joayUYuLP6ZZAgddMCCmsqQwSkuaQwrEEZR57far2Dde9mHjRRRkhzhr1?cluster=devnet) | 0.000005000 |
| buy | [3v7Gc9RC…](https://explorer.solana.com/tx/3v7Gc9RCRjrgiCw7yBbc65HPT25ndZUXG5s1sMuuwX7FT4AoMLYVjXjBHr2zv9PRSGmh5rdnUhuAtZyz2HyjxobZ?cluster=devnet) | 0.000010000 |
| sell | [5zJQCav4…](https://explorer.solana.com/tx/5zJQCav4hB83YhgugryyjZpv3F1c3ETNTcE5yKBS7Xvx5sBSH8JbU69MGRaAdkvyVXFCic3pu4RJWKcHEf5ou4Eg?cluster=devnet) | 0.000005000 |
| creator-claim | [2ukDH2Wk…](https://explorer.solana.com/tx/2ukDH2WkwejbkSvSFbs8Rg3pwQAvWEvXxiDHqLBr3B7zTKRjreEY5NeHWjzH4F6GHgyBbpeHG3z5PL7ekNEwa2oJ?cluster=devnet) | 0.000005000 |

All complete signatures and Explorer links are also in [receipts.csv](../artifacts/devnet/fee-65-35/lifecycle-jeettest/receipts.csv). Public final states, fees and reconciliation are in [summary.json](../artifacts/devnet/fee-65-35/lifecycle-jeettest/summary.json).

## Owner review and remaining release gates

The tested genuine Devnet create/buy/sell/creator-claim lifecycle has no remaining failure. The safe pre-broadcast funding/RPC issues are recorded above. Installed Phantom/native mobile acceptance was not exercised by this command-line lifecycle and remains a public-release gate. Platform claim signing remains separately restricted to the approved beneficiary owner. Public release and any additional deployment, liquidity migration or Mainnet activity require separate owner authorization. No additional transactions are authorized by this report.
