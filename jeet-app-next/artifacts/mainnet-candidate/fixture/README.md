# Local fixture executable

**Local replay only. Do not deploy.** This executable uses the Mainnet instruction profile with public fixture identities. The approved 65/35 curve split and treasury are compiled into the program. These bytes contain no signer key.

| Build input | Value |
| --- | --- |
| Program fixture | `36VASLSKLFD2KokjXG7V28veZvXEsyHRKefLonPaAKzv` |
| Containment authority fixture | `5oEzAP4izB65uRm2yDAEf9oALGwHpWkDfyKb8zBY3euC` |
| Cargo feature | `mainnet` only |
| Builder | `cargo-build-sbf 4.4.0`, platform tools `v1.57`, SBF `v0`, locked crates |
| Host Cargo toolchain | `1.89.0` |
| Executable bytes | 277,624 |
| SHA-256 | `f3870160fbcdfc3040dde20d63a2b7918db77f1b2dac0648d5f79b76bdee7b1a` |

Two isolated build directories produced identical bytes. Reproduce with [the build script](../../../scripts/readiness/build-mainnet-candidate.sh) and the public fixture inputs above. Keep the separate, future owner-controlled program and containment identities out of fixture deployments. The read-only verifier rejects this artifact and both fixture identities.
