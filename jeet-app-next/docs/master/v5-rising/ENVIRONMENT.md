Current recovery and fresh compilation results are documented in [EXECUTION.md](EXECUTION.md) and [RECOVERY.md](RECOVERY.md). The following describes the previous checkpoint, not the current tool availability.

# Historical environment at 3427966

Node 24.22.1/npm 11.9.0 available. Rust/Cargo 1.99.1 executables were recovered
under the ignored programs/launch-custody/target/toolchain directory. Native
compilation cannot resolve uncached dependencies: online Cargo requests return
CONNECT tunnel HTTP 403; offline resolution fails for solana-program. Fresh native
and SBF builds are therefore not claimed for this checkpoint.

Agave 2.3.13 archive extraction initially left an incomplete validator executable
(segmentation fault and missing ELF section headers). Re-extracting the single
validator through tar stdout produced a complete executable; --version succeeds.
The fresh local regression run uses that explicit JEET_VALIDATOR_BIN and the
unchanged default/local-only SBF artifacts after checking their recorded SHA256s.
This is fresh transaction execution, not a fresh Solana compilation. Production
program source is untouched. Historical native/SBF results remain historical.

Next production build, full lint/type checks, all runnable JS economic/client/RPC
tests and real HTTP frontend capability-gating checks run separately. Browser
mobile/wallet-layout testing and modern public Devnet migration are not claimed.
No V5 financial code, program deployment, AMM CPI or permanent LP lock is present.
