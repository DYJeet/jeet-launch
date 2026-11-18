# Devnet Phantom acceptance and operator setup

The approved live program remains `Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D`. Its approved deployed artifact SHA-256 is `13e0a87c97ba5b670bc2fd358a145618bff4be7fda5460b533e2dc1e3ac424fa`. The successful JEETTEST lifecycle at `ff8d7174498935ab3fb1a181da0a5ddc4c17fd31` is preserved. No additional public-network transaction is authorized by this readiness work.

## Runtime configuration

Build with `NEXT_PUBLIC_JEET_WALLET_NETWORK=devnet`; it is a build-time choice, not a browser-selected RPC URL. At server runtime set `JEET_DEVNET_WALLET=1` and `JEET_DEVNET_WALLET_ORIGIN` to the exact HTTPS application origin. Default local and public signing gates remain available when Devnet mode is not selected.

An optional `JEET_DEVNET_WALLET_RPC` selects an existing authorized HTTPS Devnet endpoint on the server. Keep provider credentials out of `NEXT_PUBLIC_*`, source files, screenshots and Git. Mainnet selection is unsupported and each wallet request verifies the expected Devnet genesis. HTTP RPC is accepted only by the separate loopback local-validator configuration.

For public token metadata, use `JEET_METADATA_STORAGE=pinata` with the existing `PINATA_JWT` injected as a server secret. Devnet creation rejects temporary workspace metadata URIs. The server verifies public retrieval and exact uploaded bytes before allowing mint preparation; it does not silently accept inaccessible metadata. Provider records and current retrieval do not guarantee indefinite pinning. This phase does not authorize a new token or a new live upload acceptance run.

Codespaces forwards HTTPS to `localhost:<port>`. Forwarded host handling is allowed only when the server is running in the exact named Codespace, the loopback port matches its configured `<codespace>-<port>.app.github.dev` origin, and `x-forwarded-host` matches that origin. An arbitrary forwarded header is insufficient. Cross-origin and cross-site requests still fail. Normal direct Host matching remains supported.

The launch and market-history indexes use server-side RPC pacing. For a persistent deployment, configure an existing authorized Devnet provider and durable `JEET_MARKET_DB` storage. A Codespace and `/tmp` are temporary preview infrastructure. The history API deliberately marks possible archival gaps; it must not be advertised as a guaranteed complete historical index.

## Owner acceptance checklist

Use `https://symmetrical-adventure-544vrwjwxppcv7wx-3019.app.github.dev/` while the Codespace is running. Cloud-browser external HTTPS acceptance is blocked and must be checked in the owner's browser. A private forwarded port may require GitHub sign-in. Do not make the port public merely to bypass authentication.

1. Desktop: open the URL in a browser with the actual installed and unlocked Phantom extension. Select Devnet in Phantom. Connect your existing wallet, verify the displayed public address and balance, disconnect, reload and reconnect.
2. iPhone: open the same HTTPS URL inside Phantom's in-app browser, using its existing wallet. Repeat connection, address, balance, disconnect and reconnect checks. Responsive desktop emulation is not native iPhone acceptance.
3. Open Explore and the existing JEETTEST page for mint `7NwQ6njcXzujG8CTpzqoeyBDAXYjuAMNQUi9bibE4tfM`. Check name, image, metadata, price, reserves, existing buy/sell history and creator earnings. Browsing requires no signature.
4. Open Create and verify the wallet form, creator allocation/opening-cap inputs, fee disclosures and network labels. Do not create another token under the current authorization.
5. Transaction acceptance remains a separate, explicitly authorized Devnet step. Do not approve a buy, sell, claim or creation until its spending authorization is confirmed. Verify wallet prompts, cancellation, simulation, confirmation and reconnect recovery with an agreed minimal transaction plan. Never use Mainnet or real SOL.

Do not export or import Codespace test-wallet private keys into a browser. No seed phrase, private key or treasury secret is needed to connect an existing Phantom wallet. The application uses Wallet Standard signing, verifies the returned signer/signature and broadcasts the saved transaction wire through the configured network. Pending signatures and launch recovery records contain public state, not wallet secrets. A rejected signature or account change must not broadcast.

Automated disposable Wallet Standard signing tests are genuine local-validator tests, but are not installed Phantom acceptance. The previous browser inspection detected no Wallet Standard wallet; desktop Phantom and native iPhone acceptance remain untested until the owner performs them.

## Fees and claims

Bonding-curve fees remain 100 bps nominal total: 65 bps platform and 35 bps creator. The implementation rounds the total once with `ceil(raw / 100)`, assigns `ceil(totalFee * 65 / 100)` to platform, and assigns the exact remainder to creator. This conserves the total; small trades can have effective rates above the nominal percentages. Buy fees are added to consideration; sell fees are deducted from proceeds. Claims do not count again as trading volume.

Platform beneficiary: `HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP`. Creator entitlement is the immutable creator recorded by custody. Claim UI and on-chain checks require that exact beneficiary to sign, use the canonical fee vault, and reject overclaims or redirected recipients. Neither the deployment payer nor upgrade authority substitutes for the treasury signer.

The last read-only JEETTEST platform quote showed 1,342 lamports claimable and a 5,000-lamport network fee, with no treasury account yet present on Devnet. This is not economical to claim and cannot be paid by an unfunded beneficiary. Any future funding and treasury signature require separate owner authorization, fresh balance/rent checks and a secure owner-controlled wallet. No treasury private key is to be imported into a server or Codespace. The creator previously claimed all 722 accrued lamports; that prior claim remains preserved.

## Graduation boundary

The SyncNative correction is a separate undeployed candidate. It places the existing Rent sysvar in the optional second CPI account position and retains the curve account afterward for lamport synchronization. It changes neither stored account layouts nor outer instruction formats. Candidate hashes and fresh local evidence belong under `artifacts/readiness`; they do not replace the approved live artifact.

The Devnet application hides migration controls and rejects public-network graduation planning before RPC/signing. This application guard is not an on-chain pause: the already deployed Devnet program includes creator opt-in graduation terms and permissionless completion once its conditions are met. External clients can invoke supported instructions. We cannot assert that public migration is cryptographically disabled by a frontend guard.

No public migration was executed or authorized in this phase. Do not enable it until the corrected candidate has completed review, the owner separately authorizes any required program upgrade and costs, and public-network integration has been explicitly approved. Existing curve trading and redemption remain available under the unchanged deployed program. After migration, Raydium's configured swap fees are separate from JeeT's 65/35 bonding-curve fees; do not advertise automatic 65/35 collection on external AMM swaps.
