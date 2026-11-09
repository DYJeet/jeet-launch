# Private Codespaces mobile preview

Use a separate V6 checkout and a disposable ledger produced by the existing
wallet creation and graduation browser suite. Keep port 3017 **Private** in
GitHub Codespaces. The Codespaces gateway authenticates the viewer. This
development mode requires that gateway and must never be used with a public
tunnel. Bind both the frontend and the validator to loopback. Forward only
3017. No validator RPC, wallet RPC, uploads, creation or fee claim routes
are available through the preview.

Restore the disposable test ledger without resetting it. Use the pinned
validator and the same RPC port as the original harness. Query
`getGenesisHash` over loopback to obtain the configured genesis. Then run:

```sh
JEET_LOCAL_WALLET=0 JEET_LOCAL_TEST=0 \
JEET_PREVIEW_HOST=<exact-private-codespaces-hostname> \
JEET_LOCAL_WALLET_RPC=http://127.0.0.1:9907 \
JEET_LOCAL_WALLET_GENESIS=<local-genesis> \
JEET_MARKET_DB=<isolated-sqlite-path> \
npm run dev -- --hostname 127.0.0.1 --port 3017
```

The same-origin browser calls only the application listing and history GET
routes. Those routes use the verified V6 indexing and attribution logic over
loopback. The hostname is an exact allowlist, never taken from forwarding
headers. The preview is limited to development mode. Real signing remains
disabled. History is paginated and explicitly labeled as local test data.
