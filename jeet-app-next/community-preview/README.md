# JeeT Launch community preview

This deployable project is separate from the V6 app runtime. It reuses JeeT Launch's mascot, palette, brand, and landing-page copy, with dedicated read-only Explore, market detail, and creation preview views. It has no wallet, RPC, program, database, or secret configuration.

## Local check

Use Node.js 24. Run `npm test`, `npm run build`, then `npm start` from this directory. Open `http://127.0.0.1:4173`. The local server mirrors the public static files and the only API endpoint.

## Vercel project

Create a **new, separate** Vercel project from `DYJeet/jeet-launch`. Use the `community-preview` branch as the new project's production branch, `jeet-app-next/community-preview` as the root, and the **Other** framework preset. The checked-in configuration builds `dist` and runs the GET-only `api/market.js` function. Leave environment variables empty. Use an eligible existing hosting account and make only this project's share URL public. Check it from a fresh browser session before sharing. A project's deployment URL can require a login even when its canonical project domain is public.

## Market data

- GeckoTerminal's free Solana trending-pools endpoint supplies the first page in 24-hour provider order. The first pool per base mint wins. Search, minimum liquidity, and sorting apply to the current snapshot.
- The browser polls after 30 seconds, excluding request time and provider backoff. Responses carry the time the preview fetched and validated the snapshot. The provider controls its own data update cadence.
- Detail views use up to 48 hourly USD candles for the same pool's base token. Gaps stay empty. OHLCV is cached for 120 seconds. Links open the provider, market, and mint.
- Server memory coalesces concurrent refreshes per snapshot or pool. The Vercel CDN also caches successful responses. The warm function limits new chart fetches to 18 per rolling minute to leave room for trending. Instance-local limits are best-effort across cold starts. Upstream 429s trigger a cooldown that honors Retry-After, and recent cached data is clearly marked when served.
- A missing market cap stays missing. Liquidity and volume apply to the selected pool. Detail views stop serving when a pool rotates out of the feed. The preview shows no JeeT launch activity, wallet actions, or submissions.

Provider documentation and terms are available at https://api.geckoterminal.com/docs/ and https://www.coingecko.com/en/api_terms.
