#!/usr/bin/env bash
# Official, pinned CPMM source; builds for local testing only. Never deploys.
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$app_root"
source scripts/solana-tools-env.sh
amm_root="$app_root/programs/launch-custody/target/amm-research"
amm_source="$amm_root/cp-swap"
amm_commit=f4b9b26342afe9122d5ff67cd7a4f19ded4ac0a5
mkdir -p "$amm_root"
if [[ ! -d "$amm_source/.git" ]]; then
  git clone https://github.com/raydium-io/raydium-cp-swap.git "$amm_source"
  git -C "$amm_source" checkout --detach "$amm_commit"
fi
[[ "$(git -C "$amm_source" rev-parse HEAD)" == "$amm_commit" ]]
[[ -z "$(git -C "$amm_source" status --porcelain)" ]]
archive="$jeet_tool_root/agave44.tar.bz2"
if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 2 https://github.com/anza-xyz/agave/releases/download/v4.4.0/solana-release-x86_64-unknown-linux-gnu.tar.bz2 --output "$archive"
fi
printf '%s  %s\n' 3363f4728fe786ac7036e342a20df928aa2e3e43f807fbdce67814840538c574 "$archive" | sha256sum --check
if [[ ! -x "$jeet_tool_root/agave44/solana-release/bin/cargo-build-sbf" ]]; then
  mkdir -p "$jeet_tool_root/agave44"
  tar --no-same-owner -xjf "$archive" -C "$jeet_tool_root/agave44"
fi
# Modern Rust dependencies, with an explicit older SBF ABI supported in this sandbox.
CARGO_TARGET_DIR="$app_root/programs/launch-custody/target/amm-build-v0" "$jeet_tool_root/agave44/solana-release/bin/cargo-build-sbf" --arch v0 --tools-version v1.57 --manifest-path "$amm_source/programs/cp-swap/Cargo.toml" --sbf-out-dir "$amm_root/devnet-v0" -- --locked --features devnet
