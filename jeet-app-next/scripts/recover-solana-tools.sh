#!/usr/bin/env bash
# Reproducible local build tools; never deploys or changes a Solana authority.
set -euo pipefail
app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tool_root="$app_root/programs/launch-custody/target/toolchain"
mkdir -p "$tool_root"
export RUSTUP_HOME="$tool_root/rustup" CARGO_HOME="$tool_root/cargo"
if [[ ! -x "$CARGO_HOME/bin/rustup" ]]; then
  curl --fail --location --retry 2 https://sh.rustup.rs --output "$tool_root/rustup-init.sh"
  sh "$tool_root/rustup-init.sh" -y --profile minimal --default-toolchain 1.99.1 --no-modify-path
fi
export PATH="$CARGO_HOME/bin:$PATH"
rustup toolchain install 1.99.1 --profile minimal
rustup component add --toolchain 1.99.1 rustfmt
archive="$tool_root/agave.tar.bz2"
# Official GitHub release API asset digest for Agave v2.3.13, x86_64 Linux.
agave_sha=c43539ebdf6942472e8b87635d6ea55f428a51e3d0219f7b6f720fc6b19fade0
if [[ ! -f "$archive" ]]; then
  curl --fail --location --retry 2 https://github.com/anza-xyz/agave/releases/download/v2.3.13/solana-release-x86_64-unknown-linux-gnu.tar.bz2 --output "$archive"
fi
printf '%s  %s\n' "$agave_sha" "$archive" | sha256sum --check
mkdir -p "$tool_root/agave"
tar --no-same-owner -xjf "$archive" -C "$tool_root/agave"
# Stream the validator to completion before making it executable.
tar -xjOf "$archive" solana-release/bin/solana-test-validator > "$tool_root/validator.pending"
chmod +x "$tool_root/validator.pending"
"$tool_root/validator.pending" --version
mv "$tool_root/validator.pending" "$tool_root/validator"
cargo +1.99.1 --version
rustc +1.99.1 --version
printf '%s\n' 'Recovered. Source scripts/solana-tools-env.sh for this shell.'
