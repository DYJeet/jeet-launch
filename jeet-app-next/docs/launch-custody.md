# Local launch inventory custody

Parent checkpoint: `c9b2d9b962c6c79428f652adf733a892a8a3f766`.
All source changes are inside `jeet-app-next`.

## Custody model

The local mint API preserves the creator's separate ATA, integer basis-point allocation,
rounding, and mint/freeze authority choices. Inventory is now minted directly to the ATA
whose authority is the PDA derived from `["launch", mint public-key bytes]` under
`7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31`.

| Account | Solana account owner | Token spending authority |
| --- | --- | --- |
| Custody state PDA | JeeT custody program | The program signs through `invoke_signed` |
| Launch inventory ATA | Standard SPL Token Program | Custody state PDA |
| Creator ATA | Standard SPL Token Program | Existing temporary local-test creator |

The inventory authority has no wallet private key. The custody program is compiled from
`programs/launch-custody` and loaded as an executable at local validator genesis. The program
provides two instructions:

- Initialize: validates the canonical PDA and ATA, SPL ownership, the mint-authority signer,
  creator identity and actual balance, inventory balance, supply conservation, a maximum 5%
  creator share, and the absence of inventory delegates and alternate close authority. It
  creates the state PDA with rent-exempt storage and records the launch allocation. Existing
  state cannot be reinitialized. Prefunded System-owned PDAs can be initialized safely.
- Prove control: validates state and vault identities, then performs an idempotent SPL Token
  revoke through a PDA-signed CPI. It moves no tokens and grants no delegation. A different
  fee payer can call it; transaction inner instructions prove that the program signed.

State is 89 bytes: `JEETCST1` (8), mint (32), creator (32), creator base units (u64 LE),
initial inventory base units (u64 LE), canonical bump (u8). Instruction 0 is 49 bytes:
opcode, creator public key, creator amount, inventory amount. Instruction 1 is one byte.
Other instruction encodings are rejected.

## API and failure handling

The API checks for an executable custody program before funding or creating a launch.
After minting the separate allocations, it initializes custody and proves signing control,
applies the existing authority settings, and reads back custody state, vault authority,
delegate/close settings, mint state, and exact token balances before reporting success.

Failures report the stage and the mint address when mint creation has been attempted.
Since mint creation, funding, custody initialization and authority configuration span
transactions, a later failure can leave partial local state. Inspect the returned mint
before retrying. The API does not report partial completion as success.

## Reproduce

Tested with Node 24, Agave CLI 2.3.13, SBF platform-tools v1.48, transaction version 0.
The committed Cargo lockfile pins dependencies compatible with this SBF compiler.

```bash
cd jeet-app-next
npm ci
npm run custody:build
npm run build
npm run test:custody
```

The integration runner starts the production app and two successive disposable validators:
one without the program to test early failure, then one with the compiled program. It
uses temporary ledgers and stops the processes it started. Ports 3000, 8899, 8900 and 9900
must be available. `JEET_VALIDATOR_BIN` can select an explicit validator executable;
`JEET_TEST_EVIDENCE` selects the JSON evidence output path.

For manual use, `npm run validator` loads the program into a dedicated `.local-ledger-custody`
ledger, and `npm run start` starts the built app. The validator script does not reset a
ledger. Select a fresh `JEET_CUSTODY_LEDGER` when changing the genesis-loaded program.

## Checkpoint verification

- Production Next.js build and locked SBF compilation passed.
- Six API launches verify unchanged creator allocation and exact inventory/supply
  reconciliation: 0%, 2%, 5%, 2.51%, zero-decimal rounding, and retained authority choices.
- Independent JSON-RPC reads verify executable program, state account owner, state layout,
  canonical PDA derivation/bump, token-account owner and authority, and the inner signed CPI.
- Twelve program-execution rejection tests cover unauthorized withdrawals, substituted
  accounts, unknown instructions, reinitialization, invalid seeds, supply/balance mismatch,
  creator identity, missing initializer signature, and wrong Token Program.
- A seventh launch fixture verifies failed initialization leaves no state, then successfully
  initializes a prefunded PDA and reconciles `20 + 980 = 1000`.
- Nine invalid API parameter cases and the missing-program early-failure case pass.
- After rejected operations, independent reads confirm original creator balance, inventory,
  and supply are unchanged.
- Focused ESLint checks cover the custody module, API and test scripts; Rust formatting is
  checked. Existing whole-project lint issues documented in the allocation checkpoint remain.

`launch-custody-local-evidence.json` records disposable local addresses, signatures and state
bytes. `launch-custody-test-results.txt` records the passing run. The Agave 2.3.13 build
postprocessor emits a syscall-name warning; actual validator execution, including signed
CPIs and rent/syscall use, passes with standard preflight/resource estimation enabled.

## Scope of this checkpoint

This is local custody infrastructure. The genesis-loaded program has no upgrade authority,
withdrawal, purchase, delegate-setting, arbitrary CPI, pricing or wallet-cap instruction.
Adding purchase enforcement requires a new local program build and fresh test ledger.
Creator keys remain temporary as in the verified allocation checkpoint. The Devnet wallet
flow remains separate and unchanged. Public deployment, state migration and production
creator signing require their later feature passes and security review.

Wallet caps have not been started.
