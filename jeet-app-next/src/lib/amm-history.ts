import { getBase58Encoder, type Address } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { CPMM_TEST_PROGRAM, NATIVE_MINT, graduationPoolAccounts, type decodeGraduation } from "./launch-graduation.ts";

type Instruction = { programIdIndex: number; accounts: readonly number[]; data: string };
type Transaction = {
  transaction: { message: { accountKeys: readonly string[]; instructions: readonly Instruction[] } };
  meta?: {
    err: unknown;
    loadedAddresses?: { writable: readonly string[]; readonly: readonly string[] };
    innerInstructions?: readonly { index: number; instructions: readonly Instruction[] }[] | null;
  } | null;
};

type Terms = Pick<ReturnType<typeof decodeGraduation>, "mint" | "migrated" | "pool" | "config" | "migrator" | "ammProgram">;
export async function ammHistoryPool(mint: Address, terms: Terms) {
  if (!terms.migrated || terms.mint !== mint || terms.ammProgram !== CPMM_TEST_PROGRAM ||
      terms.pool === "11111111111111111111111111111111")
    throw Error("Unrecognized graduation pool.");
  const canonical = await graduationPoolAccounts(mint, terms.pool);
  if (terms.config !== canonical.config || terms.migrator !== canonical.migrator)
    throw Error("Unrecognized graduation pool.");
  return canonical;
}

type Pool = Awaited<ReturnType<typeof ammHistoryPool>>;
const decode = getBase58Encoder();
const swapBaseInput = [143, 190, 90, 218, 196, 30, 51, 222];

function checkedTransfer(ix: Instruction, keys: readonly string[], expected: readonly string[]) {
  if (keys[ix.programIdIndex] !== TOKEN_PROGRAM_ADDRESS || ix.accounts.length !== expected.length ||
      expected.some((key, index) => keys[ix.accounts[index]] !== key)) return null;
  const bytes = decode.encode(ix.data);
  if (bytes.length !== 10 || bytes[0] !== 12) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(1, true);
}

/** Read only attributable top-level base-input swaps and their scoped SPL CPIs. */
export function ammTradeEvents(tx: Transaction, pool: Pool) {
  if (!tx.meta || tx.meta.err || !tx.meta.innerInstructions) return [];
  const message = tx.transaction.message;
  const keys = [...message.accountKeys, ...tx.meta.loadedAddresses?.writable ?? [],
    ...tx.meta.loadedAddresses?.readonly ?? []];
  return message.instructions.flatMap((ix, index) => {
    if (keys[ix.programIdIndex] !== CPMM_TEST_PROGRAM || ix.accounts.length !== 13) return [];
    try {
      const [wallet, authority, config, poolKey, userIn, userOut, vaultIn, vaultOut, tokenIn, tokenOut,
        mintIn, mintOut, observation] = ix.accounts.map(key => keys[key]);
      const forward = mintIn === pool.mint0 && mintOut === pool.mint1;
      const reverse = mintIn === pool.mint1 && mintOut === pool.mint0;
      if ((!forward && !reverse) || !wallet || !userIn || !userOut || authority !== pool.authority ||
          config !== pool.config || poolKey !== pool.pool || observation !== pool.observation ||
          tokenIn !== TOKEN_PROGRAM_ADDRESS || tokenOut !== TOKEN_PROGRAM_ADDRESS ||
          vaultIn !== (forward ? pool.vault0 : pool.vault1) ||
          vaultOut !== (forward ? pool.vault1 : pool.vault0)) return [];
      const data = decode.encode(ix.data);
      if (data.length !== 24 || !swapBaseInput.every((value, offset) => data[offset] === value)) return [];
      const scope = tx.meta!.innerInstructions!.filter(group => group.index === index);
      if (scope.length !== 1 || scope[0].instructions.length !== 2) return [];
      const [deposit, payout] = scope[0].instructions;
      const input = checkedTransfer(deposit, keys, [userIn, mintIn, vaultIn, wallet]);
      const output = checkedTransfer(payout, keys, [vaultOut, mintOut, userOut, authority]);
      const amounts = new DataView(data.buffer, data.byteOffset, data.byteLength);
      if (!input || !output || input !== amounts.getBigUint64(8, true) ||
          output < amounts.getBigUint64(16, true)) return [];
      const sell = mintOut === NATIVE_MINT;
      return [{ index, wallet, sell, tokens: sell ? input : output, raw: sell ? output : input }];
    } catch {
      return [];
    }
  });
}
