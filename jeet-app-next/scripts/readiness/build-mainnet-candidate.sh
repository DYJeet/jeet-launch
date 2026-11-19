#!/usr/bin/env bash
# Build only. Output includes the executable and checksums, never keypairs.
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${JEET_MAINNET_PROGRAM_ID:?Set the intended public program address}"
: "${JEET_MAINNET_CONTAINMENT_AUTHORITY:?Set the intended public containment authority}"
: "${1:?Provide an unused output directory}"

output="$1"
source_commit="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain --untracked-files=all -- .)" ]]; then
  echo 'Build from a clean project checkout.' >&2
  exit 1
fi
tool_version="$(cargo build-sbf --version)"
if ! grep -Fxq 'cargo-build-sbf 4.4.0' <<<"$tool_version"; then
  echo 'Use the pinned cargo-build-sbf 4.4.0 toolchain.' >&2
  exit 1
fi
if test -e "$output"; then
  echo 'The output path already exists.' >&2
  exit 1
fi

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
for n in first second; do
  CARGO_TARGET_DIR="$scratch/$n-target" cargo build-sbf --arch v0 --tools-version v1.57 \
    --manifest-path programs/launch-custody/Cargo.toml --sbf-out-dir "$scratch/$n" \
    -- --locked --no-default-features --features mainnet
done
cmp "$scratch/first/jeet_launch_custody.so" "$scratch/second/jeet_launch_custody.so"
mkdir "$output"
cp "$scratch/first/jeet_launch_custody.so" "$output/"
(
  cd "$output"
  sha256sum jeet_launch_custody.so > SHA256SUMS
  sha256sum -c SHA256SUMS
  JEET_BUILD_SOURCE="$source_commit" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync('jeet_launch_custody.so');
writeFileSync('build-manifest.json', JSON.stringify({
  sourceCommit: process.env.JEET_BUILD_SOURCE,
  program: process.env.JEET_MAINNET_PROGRAM_ID,
  containmentAuthority: process.env.JEET_MAINNET_CONTAINMENT_AUTHORITY,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  byteLength: bytes.length,
  profile: { feature: 'mainnet', builder: '4.4.0', platformTools: 'v1.57', arch: 'v0', matchingBuilds: 2 },
}, null, 2) + '\n', { flag: 'wx' });
NODE
)
