# Creator allocation: local validator proof

Development target: `jeet-app-next`. Frozen baseline checkpoint: `8d6b1b1063e56a8548bd56e2dbfdf9c49fa537e0`.

The existing creation form sends Dev Allocation to the local mint API. Percentages are parsed as integer basis points (0–500), with at most two decimal places. Creator base units are `total * bps / 10000` rounded down; all remaining base units go to launch inventory. No floating point supply arithmetic is used.

The API fetches minted supply, checks each token balance and total conservation, and reads back authority revocation, initialization and decimals before reporting success. Invalid request types and ranges fail before chain writes.

## Validation

- `npm run build`: passed.
- Agave `solana-test-validator 2.3.13`, transaction version 0.
- `node scripts/test-creator-allocation.mjs`: passed six launches plus nine invalid-input cases. The test independently reads parsed SPL accounts via JSON-RPC and asserts balances, owners, mint, supply, decimals, and both authority states.
- Tested 0%, 2%, 5%, 2.51%, zero-decimal rounding, and retained authorities.
- Exact addresses and signatures are in `creator-allocation-local-evidence.json`; these are disposable local-validator accounts, not Devnet/mainnet records.
- Whole-project lint currently reports existing errors in create-page effects/navigation, local validator health effects, and wallet balance effects, plus image warnings. No lint configuration or rules were disabled.

To reproduce, build the app, start a compatible local validator on 8899/8900, start the production app on 3000, then run the test script. Optional `JEET_TEST_APP_URL` selects the application origin, and `JEET_TEST_EVIDENCE` writes the successful launch responses to a JSON file.

## Limits and next feature

The original allocation checkpoint below used temporary owners. The subsequent [custody checkpoint](launch-custody.md) replaces only the inventory owner with program-controlled custody.

At the original allocation checkpoint, creator and launch-inventory owners were temporary generated test keypairs; their keys are not returned or persisted. The launch inventory is not a program-controlled escrow. The Devnet wallet path remains a separate full-supply test and does not implement this split.

Wallet caps require an on-chain purchase instruction and program-controlled inventory. A browser-only or API-only cap cannot enforce purchases on-chain. That program is the next architectural prerequisite; pricing, opening rules and migration must use the same enforceable custody model.
