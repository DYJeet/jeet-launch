// Official Raydium CPMM interface pinned in docs/master/v5-rising/AMM-READINESS.md.
import { createHash } from "node:crypto";
import {
  address,
  AccountRole,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";
export const CPMM = address("DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb");
export const WSOL = address("So11111111111111111111111111111111111111112");
export const TOKEN = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN22 = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const ATA = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const SYSTEM = address("11111111111111111111111111111111");
export const RENT = address("SysvarRent111111111111111111111111111111111");
export const MEMO = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const FEE = address("3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy");
export const bytes = (k) => getAddressEncoder().encode(k);
export const discriminator = (name) =>
  new Uint8Array(
    createHash("sha256")
      .update("global:" + name)
      .digest()
      .subarray(0, 8),
  );
export const meta = (key, w = false, signer) => ({
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
export function instruction(name, accounts, values) {
  const data = new Uint8Array(8 + 8 * values.length);
  data.set(discriminator(name));
  values.forEach((v, i) =>
    new DataView(data.buffer).setBigUint64(8 + 8 * i, v, true),
  );
  return { programAddress: CPMM, data, accounts };
}
export const pda = (seed, ...keys) =>
  getProgramDerivedAddress({
    programAddress: CPMM,
    seeds: [new TextEncoder().encode(seed), ...keys.map(bytes)],
  });
export async function poolAddresses(mint0, mint1) {
  const [config] = await getProgramDerivedAddress({
    programAddress: CPMM,
    seeds: [new TextEncoder().encode("amm_config"), new Uint8Array([0, 0])],
  });
  const [authority] = await pda("vault_and_lp_mint_auth_seed"),
    [pool] = await pda("pool", config, mint0, mint1),
    [lpMint] = await pda("pool_lp_mint", pool),
    [vault0] = await pda("pool_vault", pool, mint0),
    [vault1] = await pda("pool_vault", pool, mint1),
    [observation] = await pda("observation", pool);
  return {
    config,
    authority,
    pool,
    lpMint,
    vault0,
    vault1,
    observation,
    mint0,
    mint1,
  };
}
export function initializePool(a, creator, token0, token1, lpAccount, n0, n1) {
  return instruction(
    "initialize",
    [
      meta(creator.address, true, creator),
      meta(a.config),
      meta(a.authority),
      meta(a.pool, true),
      meta(a.mint0),
      meta(a.mint1),
      meta(a.lpMint, true),
      meta(token0, true),
      meta(token1, true),
      meta(lpAccount, true),
      meta(a.vault0, true),
      meta(a.vault1, true),
      meta(FEE, true),
      meta(a.observation, true),
      meta(TOKEN),
      meta(TOKEN),
      meta(TOKEN),
      meta(ATA),
      meta(SYSTEM),
      meta(RENT),
    ],
    [n0, n1, 0n],
  );
}
export function withdrawPool(a, owner, lpAccount, t0, t1, n) {
  return instruction(
    "withdraw",
    [
      meta(owner.address, false, owner),
      meta(a.authority),
      meta(a.pool, true),
      meta(lpAccount, true),
      meta(t0, true),
      meta(t1, true),
      meta(a.vault0, true),
      meta(a.vault1, true),
      meta(TOKEN),
      meta(TOKEN22),
      meta(a.mint0),
      meta(a.mint1),
      meta(a.lpMint, true),
      meta(MEMO),
    ],
    [n, 0n, 0n],
  );
}
export function swapPool(a, payer, input, output, zeroForOne, n, min) {
  return instruction(
    "swap_base_input",
    [
      meta(payer.address, false, payer),
      meta(a.authority),
      meta(a.config),
      meta(a.pool, true),
      meta(input, true),
      meta(output, true),
      meta(zeroForOne ? a.vault0 : a.vault1, true),
      meta(zeroForOne ? a.vault1 : a.vault0, true),
      meta(TOKEN),
      meta(TOKEN),
      meta(zeroForOne ? a.mint0 : a.mint1),
      meta(zeroForOne ? a.mint1 : a.mint0),
      meta(a.observation, true),
    ],
    [n, min],
  );
}
export function systemTransfer(payer, to, n) {
  const data = new Uint8Array(12),
    v = new DataView(data.buffer);
  v.setUint32(0, 2, true);
  v.setBigUint64(4, n, true);
  return {
    programAddress: SYSTEM,
    data,
    accounts: [meta(payer.address, true, payer), meta(to, true)],
  };
}
export const computeBudget = {
  programAddress: address("ComputeBudget111111111111111111111111111111"),
  accounts: [],
  data: new Uint8Array([2, 64, 66, 15, 0]),
};
