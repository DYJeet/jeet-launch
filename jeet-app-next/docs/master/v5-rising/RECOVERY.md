# Recovered verification environment

The previous HTTP403 dependency blocker is resolved in this Work session. Direct
requests to the official Rust distribution, crates.io index/download endpoints,
and official Agave GitHub release now succeed. No dependency source was replaced,
checksum disabled, lockfile relaxed, or program dependency upgraded.

Verified host: Node24.22.1, npm11.9.0, rustc1.99.1(58cf8f9c3), Cargo1.99.1
(5f94df478). Legacy SBF builder: Agave2.3.13, platform-tools1.48, SBF rustc1.84.1.
Validator: Agave2.3.13. All JeeT native/SBF builds use Cargo.lock and --locked.
The first native/SBF attempts reused incompatible cached proc-macro artifacts
(E0460/E0463). Fresh CARGO_TARGET_DIR directories resolved those failures. The
fresh builds, not saved .so artifacts, are used for final local verification.

## Repeatable setup

From jeet-app-next on x86_64 Linux with official download access:

```bash
bash scripts/recover-solana-tools.sh
source scripts/solana-tools-env.sh
cargo test --locked --manifest-path programs/launch-custody/Cargo.toml
cargo test --locked --manifest-path programs/launch-custody/Cargo.toml --features local-fee-test
cargo fmt --manifest-path programs/launch-custody/Cargo.toml -- --check
CARGO_TARGET_DIR="$PWD/programs/launch-custody/target/fresh-sbf" cargo-build-sbf --tools-version v1.48 --manifest-path programs/launch-custody/Cargo.toml --sbf-out-dir programs/launch-custody/target/deploy -- --locked
CARGO_TARGET_DIR="$PWD/programs/launch-custody/target/fresh-sbf" cargo-build-sbf --tools-version v1.48 --manifest-path programs/launch-custody/Cargo.toml --sbf-out-dir programs/launch-custody/target/local-fee-test -- --locked --features local-fee-test
npm run build
npm run lint
node node_modules/typescript/bin/tsc --noEmit
npm run test:local
npm run test:v5:local
```

Run the production build **before** validator/browser suites that use .next;
do not rebuild that shared directory while a Next test server uses it. Tests
must start app, validator and RPC clients in the same execution network namespace.
V5's standalone validator uses RPC9907, WebSocket9908, faucet9909 and a distinct
ledger; never reuse the frozen baseline's ledger. The legacy suite uses8899.
A completion marker and counts must be checked as well as process exit status;
an earlier exploratory retry ended before the final PASS marker and is not counted.
No prior assertion was removed/weakened to get a passing retry.

The recovery script pins the official Agave archive digest reported by its release
API: c43539ebdf6942472e8b87635d6ea55f428a51e3d0219f7b6f720fc6b19fade0.
It installs under ignored target/toolchain, not a frozen source directory. SBF's
own verified platform cache may be maintained by cargo-build-sbf. Environment
exports affect only the sourced shell; no global profile or production settings
are modified. Recovery needs network access and is not an offline build guarantee.

Agave2.3 postprocessing reports known Solana syscall imports against its packaged
list. This warning was not suppressed; actual local SBF transactions exercise
logging, sysvars, PDA derivation, CPI, return data and memory syscalls successfully.
It is not evidence for unimplemented external migration paths.

## Browser verification

Playwright1.64.1's requested Chrome156.0.8078.4 archive returned an unavailable HTML
page. Official Chrome-for-Testing stable metadata instead supplied156.0.8078.73;
its official linux64 headless-shell archive downloaded/extracted successfully.
Set JEET_CHROMIUM_PATH to that executable, then run:

```bash
npm run test:fees:dashboard
node scripts/test-v5-ux.mjs
node --test scripts/test-public-gating.mjs
```

The first command uses a real browser and local SBF execution with the historical
Devnet-transport/genesis test bridge. It does not fabricate trades/revenue, but
is not public Devnet execution. UX checks use actual Chromium at390px/1440px,
not screenshots alone. Chrome stable differs from Playwright's bundled revision;
these specific passing runs do not establish every wallet/browser combination.

## AMM toolchain boundary

The pinned current Raydium source is separate from JeeT's historical build. Its
locked base64ct1.8.3 dependency requires edition2024, which legacy SBF Cargo1.84
cannot parse. An attempt to request platform-tools1.58 through the old builder
fell back to1.48; that is not a modern-toolchain success. A separate official
Agave4.4.0 recovery/build investigation is recorded in the verification evidence.
Do not downgrade Raydium dependencies or alter JeeT's lockfile to hide this issue.

The separate modern build now succeeds without dependency downgrades. Official
Agave v4.4.0 archive SHA2563363f4728fe786ac7036e342a20df928aa2e3e43f807fbdce67814840538c574
reports cargo-build-sbf4.5.0; its selected platform-tools1.57 reports
rustc1.95.0-dev(ae660768a) and Cargo1.95.0. Record the reported versions rather
than inferring them from the release tag. The pinned Raydium locked source build
finished successfully with its dedicated target/output directory; default/mainnet
program-ID feature was compiled locally, never deployed. Its artifact SHA256 is
9e8b612bac22a1de528b564778670015a1d6ae6020feb4bb1081ccdd8affa09c.
JeeT's final .so artifacts remain those freshly built with the historical tools.
This resolves source compilation only, not external CPI/pool/permanence verification.

The ignored target directory now contains generated Rust artifacts, recovered
tools and an external research checkout. ESLint and TypeScript explicitly exclude
programs/**/target/**; first-party src/scripts/tests remain fully checked.
