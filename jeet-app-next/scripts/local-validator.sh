#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
SOLANA_BIN="${JEET_VALIDATOR_BIN:-$(command -v solana-test-validator || true)}"
if [[ -z "$SOLANA_BIN" ]]; then
  SOLANA_BIN="${HOME}/.local/share/solana/install/active_release/bin/solana-test-validator"
fi

if [[ ! -x "$SOLANA_BIN" ]]; then
  echo "Solana test validator was not found at: $SOLANA_BIN" >&2
  echo "Install the Solana CLI first, then rerun: npm run validator" >&2
  exit 1
fi

PROGRAM_SO="programs/launch-custody/target/deploy/jeet_launch_custody.so"
if [[ ! -f "$PROGRAM_SO" ]]; then
  echo "Build the custody program first: npm run custody:build" >&2
  exit 1
fi

# Dedicated ledger; never reset or overwrite the frozen baseline's ledger.
# Use a new JEET_CUSTODY_LEDGER after rebuilding the genesis-loaded program.
exec "$SOLANA_BIN" --log --bind-address 127.0.0.1 \
  --ledger "${JEET_CUSTODY_LEDGER:-.local-ledger-custody}" \
  --bpf-program 7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31 "$PROGRAM_SO" "$@"
