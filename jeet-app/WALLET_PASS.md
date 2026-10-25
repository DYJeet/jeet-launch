# JeeT Launch — wallet foundation pass

This pass adds a Devnet-only Solana wallet foundation using the current Solana Kit plugin stack.

## Included
- Wallet Standard discovery via `@solana/kit-plugin-wallet`
- Wallet discovery warm-up gate to avoid false "no wallet" flashes
- Connect/disconnect UI in the shared site header
- Connected address display
- Devnet RPC client via `@solana/kit-plugin-rpc`
- v1 transaction-capable client configuration for later launchpad transactions
- Previous `/token/[mint]` static build fix preserved
- Trading remains intentionally disabled

## Important install step
The source package versions are pinned in `package.json`, but the generated ZIP intentionally does not claim a verified dependency lock refresh because package downloads are unavailable in the build environment used to prepare this pass.

In the Codespace, run:

```bash
npm install
npm run build
```

Only proceed to live Devnet interaction after the build succeeds.

## Safety
- Default network: Solana Devnet
- `NEXT_PUBLIC_SOLANA_RPC_URL` may be set to a custom **Devnet** RPC endpoint.
- Do not put private keys or seed phrases into environment variables or source files.
- No buy, sell, token-creation, or SOL-moving transaction is enabled in this pass.
