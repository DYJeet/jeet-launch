# Devnet and installed-wallet acceptance

Baseline: main `2eb12a91af071ef23f313a28e864c25a49fbe712`; release `dad808cb8c2dc83d9a33f5964d1a53db10849baa`. Existing browser and financial evidence is in [release readiness](RELEASE-READINESS.md) and [Milestone D](MILESTONE-D-LOCAL-GRADUATION.md).

## Read-only preflight

Run from `jeet-app-next` with locked npm dependencies installed.

```sh
node scripts/check-devnet.mjs
```

The default endpoint is the public Devnet RPC. An operator can set `JEET_DEVNET_RPC_URL` to an HTTPS endpoint. The script checks the Devnet genesis before querying accounts and never sends a transaction. The optional `JEET_DEVNET_PROGRAM_ID`, `JEET_DEVNET_UPGRADE_AUTHORITY`, `JEET_DEVNET_PAYER`, and `JEET_DEVNET_TREASURY` values are distinct disposable **public addresses**. Program inspection checks the executable bit and, for the upgradeable loader, reads the ProgramData authority. A supplied treasury address is configuration only. Verify the deployed artifact and fee vault recipient before considering the treasury verified.

At Devnet slot 519692587, the Raydium CPMM program `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb`, Metaplex, SPL Token and the Associated Token Program were executable. At slot 519693307 the expected index-0 CPMM configuration and WSOL fee receiver also passed the account checks. Pool creation was enabled, with a 2,500-millionths trade fee and 150,000,000-lamport pool creation fee. Presence does not establish that the deployed Raydium implementation, pool configuration, fee receiver, or pool initialization behavior matches the locally pinned integration. Check those before funding or signing a migration.

## Build a Devnet artifact

Keep separate disposable program, treasury, payer and upgrade-authority keys in operator-controlled storage outside Git, browser code and build output. Export only the program and treasury **public addresses** into the build shell. Source `scripts/solana-tools-env.sh` after recovering the pinned toolchain if needed.

```sh
cargo test --locked --manifest-path programs/launch-custody/Cargo.toml --features devnet
cargo-build-sbf --tools-version v1.48 \
  --manifest-path programs/launch-custody/Cargo.toml \
  --sbf-out-dir programs/launch-custody/target/devnet -- --locked --features devnet
JEET_DEVNET_ESTIMATE_ELF=programs/launch-custody/target/devnet/jeet_launch_custody.so \
  node scripts/check-devnet.mjs
```

The Devnet feature enables the same V5 handlers as the local fixture, with separately compiled program and fee beneficiary identities. The build refuses missing identities, known local and production addresses, and a combination with `local-fee-test`. Solana public keys are cluster agnostic, so build-time checks cannot prove which cluster a key will be used on. Use explicit Devnet endpoint and genesis verification for every future deployment. The standard build keeps the approved treasury and its existing V5 gate.

Preflight reports a conservative funding envelope for the program account, twice the ELF length plus the ProgramData header, and a separate upload buffer. The 308,776-byte reference artifact quoted 4.708296400 test SOL for that envelope, excluding fees. This is a sizing estimate, not a quote for a future deployment. Recalculate with the exact approved binary and chosen max length. Separately budget transaction fees, mint and associated accounts, launch PDAs, storage, and any verified Raydium pool creation fee and temporary account funding. The local Raydium setup charged 0.190117440 test SOL before the network fee, including a 0.150000000 pool fee. Re-quote against the actual Devnet configuration.

## Funding and deployment gate

The prior disposable RPC airdrop returned HTTP 410. No authorized funded Devnet payer was available. The operator can use the [Solana Devnet faucet](https://faucet.solana.com/) with a disposable public address, or reuse already available Devnet SOL from a disposable account. Follow the faucet limits. Share public addresses only.

Before deployment, confirm the funding envelope and signer control, record the exact ELF digest and expected program, treasury and upgrade authority, and obtain authorization for the specific Devnet deployment. Use the [Solana deployment procedure](https://solana.com/docs/tools/deploying-programs) with an explicit Devnet URL. Verify ProgramData, confirmed deployment signatures and on-chain program bytes before enabling a browser signer. A public-cluster V5 frontend and cluster-scoped production discovery still need wiring. Local loopback signing and the local fixture must never be enabled for Devnet or mainnet users.

## Installed-wallet acceptance

Use separate disposable wallet profiles. Once a verified Devnet frontend is available, repeat these checks in Phantom desktop, Solflare desktop, Phantom mobile and Solflare mobile.

1. Connect, verify the displayed address and Devnet, then deliberately test a wrong-network attempt before restoring Devnet.
2. Create a token using real IPFS metadata. Reject one signature and confirm the failed step makes no on-chain change. Confirm the successful creation and reload the token page.
3. Execute a small curve buy and sell. Reload during confirmation, reconnect, and verify the saved signature and on-chain balances before retrying anything.
4. Verify fees and creator claim, then exercise graduation, initial LP burn, and a swap in each direction once the actual Devnet CPMM configuration is verified.
5. Record device, wallet/version, program ID, network, transaction signatures, balance reconciliation, and failures. A Wallet Standard harness run is separate evidence.

## Dependency review

The npm production audit at the starting checkpoint reported zero advisories. The eight moderate findings in the full audit are in the lint toolchain (`eslint-config-next`, TypeScript ESLint and its `minimatch` dependency). They are relevant to developer/CI handling of untrusted lint input. The audit's proposed top-level fix switches to Next ESLint configuration 15.x and is marked breaking. No downgrade was applied.
