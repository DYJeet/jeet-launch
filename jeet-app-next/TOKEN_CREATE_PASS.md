# JeeT Launch — Devnet token creation pass

This pass adds a deliberately isolated Devnet integration test for the SPL Token transaction path.

## What is real now
- Wallet signs real Devnet transactions.
- Creates a real SPL mint account.
- Creates/resolves the connected wallet's associated token account.
- Mints the configured test supply to that Devnet wallet.
- Optionally revokes mint authority and freeze authority.
- Reads the mint back from Devnet and verifies supply/decimals/authority state.
- Surfaces mint address, token account, transaction signatures, and Solana Explorer link.

## What this intentionally does NOT pretend to do
This is NOT the production fair-launch flow. The test supply goes to the connected wallet only to prove the transaction integration.

Production still needs the JeeT Launch program/bonding-curve vault to enforce:
- launch inventory custody
- opening wallet caps
- bonding-curve price math
- creator allocation handling
- anti-sniper rules
- migration/liquidity rules
- ticker reservation
- production fee simulation

## Metadata
Name, ticker, description, website, X, Telegram and logo filename are shown in the review/test UI, but are not published to Metaplex metadata yet. A durable metadata URI/storage strategy should be chosen before on-chain metadata is committed.

## New dependency
Run:

```bash
npm install @solana-program/token
```

Then:

```bash
npm run build
```
