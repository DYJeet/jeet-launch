#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# No signing, RPC writes, dependency installation, or old artifact replacement.
export JEET_DEVNET_PROGRAM_ID=Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D
export JEET_DEVNET_TREASURY=HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP
export CARGO_INCREMENTAL=0
python3 -c 'import shutil; assert shutil.disk_usage(".").free >= 512*1024*1024, "Need at least 512 MiB free before building"'
cargo build-sbf --manifest-path programs/launch-custody/Cargo.toml --sbf-out-dir .fee-migration/devnet-artifact -- --features devnet --locked --offline
sha256sum .fee-migration/devnet-artifact/jeet_launch_custody.so
