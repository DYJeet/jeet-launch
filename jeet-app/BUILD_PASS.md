# JeeT Launch build pass

## Added
- Shared launch data/types/integrity helpers in `src/lib/launches.ts`
- Reusable launch card in `src/components/LaunchCard.tsx`
- Shared site header in `src/components/SiteHeader.tsx`
- `/explore` page with launch-stage filtering and search
- `/token/[mint]` token detail route
- Token detail layout with launch stats, integrity report, bonding progress, chart placeholder, and disabled trade panel ready for wallet/transaction wiring

## Refactored
- Homepage now consumes the shared launch model instead of maintaining duplicated card logic/data
- Homepage launch cards now link to token detail pages
- CTA links route to `/create` and `/explore`
- Metadata updated for JeeT Launch

## Intentionally not wired yet
- Wallet adapter / wallet signing
- SPL token creation
- Bonding-curve program logic
- Buy/sell transaction execution
- Live RPC/indexer data
- Liquidity migration

Trading controls on token pages stay disabled until the on-chain layer is implemented and tested.

## Validation note
`npm ci` could not complete in the current execution environment because dependency installation timed out. Static file/layout checks passed, but run `npm install` (or use existing Codespace dependencies) followed by `npm run build` in the Codespace before merging/deploying.
