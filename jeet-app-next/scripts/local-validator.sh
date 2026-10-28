#!/usr/bin/env bash
set -euo pipefail

SOLANA_BIN="${HOME}/.local/share/solana/install/active_release/bin/solana-test-validator"

if [[ ! -x "$SOLANA_BIN" ]]; then
  echo "Solana test validator was not found at: $SOLANA_BIN" >&2
  echo "Install the Solana CLI first, then rerun: npm run validator" >&2
  exit 1
fi

exec "$SOLANA_BIN" --reset
