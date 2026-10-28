# JeeT Launch — Canonical Devnet Rescue Build

This is the single canonical project build after consolidating the earlier overlays.

## What changed
- Uses Solana Kit `solanaDevnetRpc()` directly. No local validator, 8899/8900 forwarding, or `.env.local` is required.
- The Create page now uses the same real Wallet Standard connect button as the rest of the app.
- Token creation remains Devnet-only and sends no real SOL.
- Live balance/mint reads are pinned to Solana Devnet.
- Webpack is used for Next dev/build to avoid the Turbopack runtime crash seen in Codespaces.
- Tailwind v4 is configured through PostCSS so styling works under Webpack.
- The wallet-balance TypeScript narrowing fix is baked in.

## Clean test path
1. `npm install`
2. `npm run build`
3. `npm run dev`
4. Open the app, connect a Wallet Standard wallet, and use Devnet SOL for the test mint.

Do not run `solana-test-validator`; do not expose 8899/8900; do not create `.env.local` for the basic Devnet test.
