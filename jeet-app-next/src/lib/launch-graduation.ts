/** Disposable local V5 graduation SDK; no mainnet or public test deployment. */
import {
  AccountRole,
  getAddressEncoder,
  getAddressDecoder,
  getProgramDerivedAddress,
  address,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  AuthorityType,
  getSetAuthorityInstruction,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { V5_PREVIEW_PROGRAM } from "./launch-v5-preview.ts";
export const GRADUATION_SIZE = 253;
export const CPMM_TEST_PROGRAM = address(
  "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
);
export const NATIVE_MINT = address(
  "So11111111111111111111111111111111111111112",
);
const SYSTEM = address("11111111111111111111111111111111"),
  ASSOCIATED = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  RENT = address("SysvarRent111111111111111111111111111111111"),
  CP_FEE = address("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy");
const b = (k: Address) => new Uint8Array(getAddressEncoder().encode(k));
const meta = (key: Address, w = false, signer?: TransactionSigner) => ({
  address: key,
  role: signer
    ? w
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER
    : w
      ? AccountRole.WRITABLE
      : AccountRole.READONLY,
  ...(signer ? { signer } : {}),
});
function u(n: bigint) {
  if (typeof n !== "bigint" || n < 0n || n > (1n << 64n) - 1n)
    throw Error("Graduation u64");
  return n;
}
const seed = (s: string) => new TextEncoder().encode(s);
const derive = (program: Address, s: string, ...parts: Uint8Array[]) =>
  getProgramDerivedAddress({
    programAddress: program,
    seeds: [seed(s), ...parts],
  });
export async function graduationAddresses(mint: Address, nonce: bigint) {
  const n = new Uint8Array(8);
  new DataView(n.buffer).setBigUint64(0, u(nonce), true);
  const [terms] = await derive(V5_PREVIEW_PROGRAM, "graduation", b(mint)),
    [migrator] = await derive(V5_PREVIEW_PROGRAM, "migrator", b(mint)),
    [pool] = await derive(V5_PREVIEW_PROGRAM, "amm_pool", b(mint), n);
  const [config] = await derive(
      CPMM_TEST_PROGRAM,
      "amm_config",
      new Uint8Array([0, 0]),
    ),
    [authority] = await derive(
      CPMM_TEST_PROGRAM,
      "vault_and_lp_mint_auth_seed",
    ),
    [lpMint] = await derive(CPMM_TEST_PROGRAM, "pool_lp_mint", b(pool)),
    [observation] = await derive(CPMM_TEST_PROGRAM, "observation", b(pool));
  const x = b(mint),
    y = b(NATIVE_MINT);
  let mintFirst = false;
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) {
      mintFirst = x[i] < y[i];
      break;
    }
  }
  const mint0 = mintFirst ? mint : NATIVE_MINT,
    mint1 = mintFirst ? NATIVE_MINT : mint;
  const [vault0] = await derive(
      CPMM_TEST_PROGRAM,
      "pool_vault",
      b(pool),
      b(mint0),
    ),
    [vault1] = await derive(CPMM_TEST_PROGRAM, "pool_vault", b(pool), b(mint1));
  const ata = async (m: Address) =>
    (
      await findAssociatedTokenPda({
        owner: migrator,
        mint: m,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
    )[0];
  return {
    terms,
    migrator,
    pool,
    config,
    authority,
    lpMint,
    observation,
    mint0,
    mint1,
    vault0,
    vault1,
    migratorToken: await ata(mint),
    migratorSol: await ata(NATIVE_MINT),
    migratorLp: await ata(lpMint),
  };
}
export type GraduationAddresses = Awaited<
  ReturnType<typeof graduationAddresses>
>;
type Launch = {
  mint: Address;
  custody: Address;
  opening: Address;
  curve: Address;
  vault: Address;
  migrationVault: Address;
};
export function initializeGraduationInstruction(
  l: Launch & {
    creator: TransactionSigner;
    terms: Address;
    maxPriceGapBps: number;
  },
) {
  if (
    !Number.isInteger(l.maxPriceGapBps) ||
    l.maxPriceGapBps < 0 ||
    l.maxPriceGapBps > 100
  )
    throw Error("Graduation price tolerance");
  const data = new Uint8Array(3);
  data[0] = 21;
  new DataView(data.buffer).setUint16(1, l.maxPriceGapBps, true);
  return {
    programAddress: V5_PREVIEW_PROGRAM,
    data,
    accounts: [
      meta(l.creator.address, true, l.creator),
      meta(l.mint),
      meta(l.custody),
      meta(l.opening),
      meta(l.curve),
      meta(l.vault),
      meta(l.migrationVault),
      meta(l.terms, true),
      meta(SYSTEM),
    ],
  };
}
/** Submit this complete bundle as one transaction while the creator controls both authorities.
 * Trading cannot start before revocation; terms failure also rolls back both revocations.
 */
export function activateGraduationInstructions(
  l: Parameters<typeof initializeGraduationInstruction>[0],
) {
  return [
    getSetAuthorityInstruction({
      owned: l.mint,
      owner: l.creator,
      authorityType: AuthorityType.MintTokens,
      newAuthority: null,
    }),
    getSetAuthorityInstruction({
      owned: l.mint,
      owner: l.creator,
      authorityType: AuthorityType.FreezeAccount,
      newAuthority: null,
    }),
    initializeGraduationInstruction(l),
  ];
}
export function graduateInstruction(
  l: Launch &
    GraduationAddresses & {
      caller: TransactionSigner;
      sequence: bigint;
      nonce: bigint;
      maxSetupLamports: bigint;
    },
) {
  const data = new Uint8Array(25);
  data[0] = 22;
  const v = new DataView(data.buffer);
  [l.sequence, l.maxSetupLamports, l.nonce].forEach((x, i) =>
    v.setBigUint64(1 + 8 * i, u(x), true),
  );
  return {
    programAddress: V5_PREVIEW_PROGRAM,
    data,
    accounts: [
      meta(l.caller.address, true, l.caller),
      meta(l.mint),
      meta(l.custody),
      meta(l.opening),
      meta(l.curve, true),
      meta(l.vault),
      meta(l.migrationVault, true),
      meta(l.terms, true),
      meta(l.migrator, true),
      meta(l.config),
      meta(l.authority),
      meta(l.pool, true),
      meta(NATIVE_MINT),
      meta(l.lpMint, true),
      meta(l.migratorToken, true),
      meta(l.migratorSol, true),
      meta(l.migratorLp, true),
      meta(l.vault0, true),
      meta(l.vault1, true),
      meta(CP_FEE, true),
      meta(l.observation, true),
      meta(TOKEN_PROGRAM_ADDRESS),
      meta(ASSOCIATED),
      meta(SYSTEM),
      meta(RENT),
      meta(CPMM_TEST_PROGRAM),
    ],
  };
}
export function decodeGraduation(data: Uint8Array) {
  if (
    data.length !== GRADUATION_SIZE ||
    new TextDecoder().decode(data.subarray(0, 8)) !== "JEETGRD1"
  )
    throw Error("Graduation state");
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength),
    read = (n: number) => v.getBigUint64(n, true),
    key = (n: number) => getAddressDecoder().decode(data.subarray(n, n + 32));
  const result = {
    mint: key(8),
    curve: key(40),
    ammProgram: key(72),
    config: key(104),
    migrator: key(136),
    pool: key(168),
    solDeposited: read(200),
    tokensDeposited: read(208),
    lpBurned: read(216),
    maxPriceGapBps: v.getUint16(224, true),
    createdSlot: read(226),
    migratedSlot: read(234),
    sequence: read(242),
    migrated: data[252] === 1,
  };
  if (
    data[252] > 1 ||
    result.ammProgram !== CPMM_TEST_PROGRAM ||
    result.maxPriceGapBps > 100 ||
    (result.migrated &&
      (!result.solDeposited || !result.tokensDeposited || !result.lpBurned))
  )
    throw Error("Inconsistent graduation state");
  return result;
}
