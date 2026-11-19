// Offline instruction construction for the Mainnet candidate. No RPC or signer invocation.
import {
  AccountRole,
  address,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';

const SYSTEM = address('11111111111111111111111111111111');
const guarded = new Set([0, 2, 16, 19, 21, 22, 23]);

export type ReleaseMode = 0 | 1 | 2;

export async function mainnetReleaseControl(program: Address) {
  return (await getProgramDerivedAddress({ programAddress: program, seeds: ['release-control'] }))[0];
}

export async function releaseControlInstruction(
  program: Address,
  authority: TransactionSigner,
  action: 'initialize' | ReleaseMode,
): Promise<Instruction> {
  if (action !== 'initialize' && action !== 0 && action !== 1 && action !== 2)
    throw Error('Unknown release mode.');
  const control = await mainnetReleaseControl(program);
  const signer = {
    address: authority.address,
    signer: authority,
    role: action === 'initialize' ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER,
  };
  return {
    programAddress: program,
    data: action === 'initialize' ? Uint8Array.of(24) : Uint8Array.of(25, action),
    accounts: [
      signer,
      { address: control, role: AccountRole.WRITABLE },
      ...(action === 'initialize' ? [{ address: SYSTEM, role: AccountRole.READONLY }] : []),
    ],
  };
}

export async function withMainnetReleaseControl(program: Address, instruction: Instruction): Promise<Instruction> {
  if (instruction.programAddress !== program || !instruction.accounts?.length || !guarded.has(instruction.data?.[0] ?? -1))
    throw Error('Expected a guarded instruction already derived for this Mainnet candidate.');
  const control = await mainnetReleaseControl(program);
  if (instruction.accounts.some(account => account.address === control))
    throw Error('Release-control account already present.');
  return { ...instruction, accounts: [...instruction.accounts, { address: control, role: AccountRole.READONLY }] };
}
