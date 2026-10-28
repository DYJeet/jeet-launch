#!/usr/bin/env bash
# Run from this checkout; no deployment, airdrop outside local validator or git mutation.
set -euo pipefail
cd "$(dirname "$0")/.."
for command in node npm cargo cargo-build-sbf solana-test-validator; do
  command -v "$command" >/dev/null || { echo "Missing tool: $command" >&2; exit 1; }
done
verification_dir="$PWD/programs/launch-custody/target/financial-verification"
mkdir -p "$verification_dir"
export JEET_MARKET_EVIDENCE="$verification_dir/market"
export JEET_PROTECTED_EVIDENCE="$verification_dir/protected.json"
run_check() {
  local check_name="$1"
  shift
  echo "Running $check_name"
  "$@" 2>&1 | tee "$verification_dir/$check_name.log"
}
run_check format cargo fmt --manifest-path programs/launch-custody/Cargo.toml -- --check
run_check lint npx --no-install eslint
run_check rpc-reads npm run test:rpc:reads
run_check build npm run build
run_check native cargo test --locked --manifest-path programs/launch-custody/Cargo.toml
run_check native-local cargo test --locked --manifest-path programs/launch-custody/Cargo.toml --features local-fee-test
run_check client npm run test:fees:client
run_check market-math npm run test:market:math
# Install the matching SBF platform tools before running. Do not download a
# mutable toolchain implicitly in a verification job.
run_check program cargo-build-sbf --skip-tools-install --offline --manifest-path programs/launch-custody/Cargo.toml -- --locked
run_check program-local cargo-build-sbf --skip-tools-install --offline --manifest-path programs/launch-custody/Cargo.toml --sbf-out-dir programs/launch-custody/target/local-fee-test -- --locked --features local-fee-test
run_check validator npm run test:local
run_check browser npm run test:fees:dashboard
echo "Financial verification passed. Evidence: $verification_dir"
