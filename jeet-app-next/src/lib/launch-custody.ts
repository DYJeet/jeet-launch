import {
  AccountRole, address, getAddressEncoder, getProgramDerivedAddress,
  type Address, type TransactionSigner,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

// Local test program, loaded from programs/launch-custody by the validator runner.
export const CUSTODY_PROGRAM_ADDRESS = address("7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31");
export const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
export const CUSTODY_STATE_SIZE = 89;

export function findLaunchCustodyPda(mint: Address) {
  return getProgramDerivedAddress({
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    seeds: [new TextEncoder().encode("launch"), getAddressEncoder().encode(mint)],
  });
}

export function initializeCustodyInstruction(input: {
  payer: TransactionSigner; mint: Address; creator: Address;
  creatorTokenAccount: Address | null; custody: Address; vault: Address;
  creatorAmount: bigint; inventoryAmount: bigint;
}) {
  const data = new Uint8Array(49);
  data.set(getAddressEncoder().encode(input.creator), 1);
  const view = new DataView(data.buffer);
  view.setBigUint64(33, input.creatorAmount, true);
  view.setBigUint64(41, input.inventoryAmount, true);
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    accounts: [
      { address: input.payer.address, role: AccountRole.WRITABLE_SIGNER, signer: input.payer },
      { address: input.mint, role: AccountRole.READONLY },
      { address: input.creatorTokenAccount ?? TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: input.custody, role: AccountRole.WRITABLE },
      { address: input.vault, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

export function proveCustodyInstruction(custody: Address, mint: Address, vault: Address) {
  return {
    programAddress: CUSTODY_PROGRAM_ADDRESS,
    accounts: [
      { address: custody, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: vault, role: AccountRole.WRITABLE },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]),
  };
}
