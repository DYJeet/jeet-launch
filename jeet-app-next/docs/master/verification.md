# Reproducing the financial checkpoint

Run inside jeet-app-next, with the locked npm dependencies installed (`npm ci`),
Rust, rustfmt, Agave 2.3.13, its SBF v1.48 platform tools and a supported Chromium.
Configure PATH for cargo-build-sbf and solana-test-validator. If Chromium is not
Playwright's default installation, set JEET_CHROMIUM_PATH to its executable.

```
bash scripts/verify-financial.sh
```

The harness stops on the first failed command. It builds both the default program
and the explicitly local-only fee-test artifact. The full local suite starts its
own validators and application, executes all old financial regressions plus V4,
and creates additional deliberately inconsistent genesis fixtures for rejection
tests. The browser regression signs real transactions against the local SBF
program; its Devnet transport bridge is not evidence of a Devnet deployment.

Logs, local transaction references and raw-unit conservation evidence are saved
under programs/launch-custody/target/financial-verification. They contain only
public test evidence; disposable build/validator keys stay ignored and must not
be staged. Independent runs have different signatures and can have different
race winners; both outcomes must satisfy the same assertions.

This is a **financial-phase verifier**, not a complete master-readiness gate.
Full frontend lint, V4 browser flows, metadata, migration, Devnet, remaining
security findings and operational preparation still require their own evidence.
No failed check may be waived by calling this harness a complete CI pipeline.

An activated GitHub Actions workflow requires repository-root .github/workflows,
which is outside this assignment's authorized directory. This in-scope harness
can be invoked by a future approved workflow. No workflow has been activated or
claimed to run remotely during this phase.

The installed SBF postprocessor in this environment reports standard Solana
syscalls as unknown because its syscall catalog is empty. The executable builds
successfully and real validator tests exercise Clock, Rent, CPI, logging, memory
operations, PDA derivation and return data. This warning is recorded, not treated
as a clean release-toolchain attestation; reproduce with a complete reviewed
syscall catalog before production artifact promotion.
