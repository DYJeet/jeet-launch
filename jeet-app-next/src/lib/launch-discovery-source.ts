import { getAddressDecoder, getBase58Encoder, getBase64Encoder } from "@solana/kit";
import { programEvents } from "./curve-history.ts";

type Instruction = { programIdIndex: number; accounts: readonly number[]; data: string };
type ActivationTransaction = {
  transaction: { message: { accountKeys: readonly string[]; instructions: readonly Instruction[] } };
  meta: {
    logMessages?: readonly string[] | null;
    loadedAddresses?: { writable: readonly string[]; readonly: readonly string[] };
    innerInstructions?: readonly { instructions: readonly Instruction[] }[] | null;
  };
};

const base64 = getBase64Encoder();
const base58 = getBase58Encoder();
const text = new TextDecoder();
const address = getAddressDecoder();

export function activationMints(tx: ActivationTransaction, program: string) {
  const { message } = tx.transaction;
  const { loadedAddresses, innerInstructions, logMessages } = tx.meta;
  const keys = [...message.accountKeys, ...loadedAddresses?.writable ?? [], ...loadedAddresses?.readonly ?? []];
  const mints = new Set<string>();
  for (const instruction of [...message.instructions, ...innerInstructions?.flatMap(group => group.instructions) ?? []]) {
    if (keys[instruction.programIdIndex] !== program || instruction.accounts.length !== 9) continue;
    const data = base58.encode(instruction.data);
    const mint = keys[instruction.accounts[1]];
    if (mint && data.length === 3 && data[0] === 21) mints.add(mint);
  }
  // The program's event also covers CPI where the RPC retains logs but omits inner instructions.
  for (const fields of programEvents(logMessages ?? [], program)) {
    if (fields.length !== 3) continue;
    const [tag, mint, bps] = fields.map(field => base64.encode(field));
    if (text.decode(tag) === "JEET_GRAD_TERMS_V1" && mint.length === 32 && bps.length === 2)
      mints.add(address.decode(mint));
  }
  return [...mints];
}
