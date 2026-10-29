# Source this file from Bash. This changes this shell only, not global profiles.
jeet_app_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
jeet_tool_root="$jeet_app_root/programs/launch-custody/target/toolchain"
export RUSTUP_HOME="$jeet_tool_root/rustup"
export CARGO_HOME="$jeet_tool_root/cargo"
export PATH="$CARGO_HOME/bin:$jeet_tool_root/agave/solana-release/bin:$PATH"
export JEET_VALIDATOR_BIN="$jeet_tool_root/validator"
# Old targets can contain incompatible host proc-macro artifacts. Do not reuse them.
export CARGO_TARGET_DIR="$jeet_app_root/programs/launch-custody/target/fresh-native"
