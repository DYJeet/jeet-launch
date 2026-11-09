# V6 release gates

- [x] Keep the approved economics and on-chain programs unchanged while repairing preview access.
- [x] Reuse the existing verified listing and history readers for private preview rendering. Search, filters, cursor links and charts render on the server, so the read-only journey can work before JavaScript hydration.
- [ ] Verify the exact updated checkpoint on the authenticated HTTPS tunnel and on a physical phone.
- [ ] Deploy and verify a distinct Devnet program and authority with an authorized funded test payer. Bind the frontend to the verified cluster/program and validated CPMM configuration. See [Devnet acceptance](DEVNET-ACCEPTANCE.md).
- [ ] Exercise the entire lifecycle with installed Phantom and Solflare wallets on desktop and mobile against the shared test cluster. Verify sign, reject, reload, balances, both fee claims, migration and both swap directions. The disposable local-wallet harness has separate evidence in [release candidate](RELEASE-CANDIDATE.md).
- [ ] Complete independent contract and deployment review and verify operational controls before requesting explicit mainnet authorization.

Public trending data is a separate read-only experience. Defer unrelated V2 features and visual changes while closing the shared-cluster and wallet gates.
