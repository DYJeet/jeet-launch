/** Local-only adapter for the pinned Raydium CPMM interface. */
import {
  AccountRole, address, generateKeyPairSigner, getAddressEncoder, getAddressDecoder,
  getBase64Encoder, getBase64Decoder, getProgramDerivedAddress, compileTransaction,
  createTransactionMessage, appendTransactionMessageInstructions,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  getTransactionEncoder, getBase64EncodedWireTransaction,
  type Address, type Instruction, type TransactionSigner, type TransactionMessageBytesBase64,
} from "@solana/kit";
import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeAccount3Instruction, getSyncNativeInstruction, getCloseAccountInstruction,
} from "@solana-program/token";
import { CPMM_TEST_PROGRAM, NATIVE_MINT, graduationAddresses, graduateInstruction } from "./launch-graduation.ts";
import { readWalletLaunch, type WalletLaunchSnapshot } from "./wallet-launch-flow.ts";
import { potential } from "./v5-pricing.ts";
import type { WalletTransactionExecutor } from "./wallet-transactions.ts";

const SYSTEM = address("11111111111111111111111111111111");
const timeout = () => ({ abortSignal: AbortSignal.timeout(12000) });
const u64max = (1n << 64n) - 1n;
function bounded(n: bigint) {
  if (typeof n !== "bigint" || n < 0n || n > u64max) throw Error("AMM amount exceeds u64.");
  return n;
}
export const readU64 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(at, true);
const keyAt = (b: Uint8Array, at: number) => getAddressDecoder().decode(b.subarray(at, at + 32));
const bytes = (s: Address) => getAddressEncoder().encode(s);
const discr = (b: Uint8Array, expected: number[]) => expected.every((v, i) => b[i] === v);
const compute = { programAddress: address("ComputeBudget111111111111111111111111111111"), accounts: [], data: new Uint8Array([2, 64, 66, 15, 0]) };
export function decodeCpmmConfig(b: Uint8Array) {
  if (b.length !== 236 || !discr(b, [218,244,33,104,203,203,43,111]) || b[9] > 1)
    throw Error("Unsupported Raydium configuration.");
  const trade = readU64(b, 12), protocol = readU64(b, 20), fund = readU64(b, 28);
  if (trade >= 1000000n || protocol + fund > 1000000n) throw Error("Invalid Raydium fee configuration.");
  return { trade, protocol, fund, setupFee: readU64(b, 36), disabled: b[9] === 1 };
}
export function cpmmQuote(input: bigint, reserveIn: bigint, reserveOut: bigint, rate: bigint, slippageBps: bigint) {
  for (const n of [input, reserveIn, reserveOut, rate]) bounded(n);
  if (!input || !reserveIn || !reserveOut || rate >= 1000000n || slippageBps < 0n || slippageBps > 1000n)
    throw Error("Invalid swap amount, liquidity, or slippage (0–10%).");
  // Pinned CurveCalculator::swap_base_input with creator fees disabled by graduation.
  const fee = (input * rate + 999999n) / 1000000n;
  const net = input - fee;
  if (!net) throw Error("Amount is too small after Raydium fees.");
  const output = bounded(net * reserveOut / (reserveIn + net));
  if (!output || output >= reserveOut) throw Error("Swap output is too small or exhausts liquidity.");
  const minimum = output * (10000n - slippageBps) / 10000n;
  return { input, output, fee, minimum: minimum || 1n, rate };
}
type Account = { owner: Address; executable: boolean; data: readonly [string, string]; lamports: bigint } | null;
function owned(a: Account, owner: Address, size?: number) {
  if (!a || a.owner !== owner || a.executable) throw Error("Missing or substituted AMM account.");
  const b = new Uint8Array(getBase64Encoder().encode(a.data[0]));
  if (size !== undefined && b.length !== size) throw Error("Unexpected AMM account layout.");
  return b;
}
function token(a: Account, mint: Address, owner: Address) {
  const b = owned(a, TOKEN_PROGRAM_ADDRESS, 165);
  if (keyAt(b, 0) !== mint || keyAt(b, 32) !== owner || b[108] !== 1 ||
      new DataView(b.buffer).getUint32(72, true) !== 0 || new DataView(b.buffer).getUint32(129, true) !== 0)
    throw Error("Token vault identity, authority, or state mismatch.");
  return readU64(b, 64);
}
async function poolAddresses(launch: WalletLaunchSnapshot) {
  const a = await graduationAddresses(launch.addresses.mint, 0n);
  const pool = launch.terms!.pool;
  const derive = async (seed: string, ...parts: Address[]) => (await getProgramDerivedAddress({
    programAddress: CPMM_TEST_PROGRAM, seeds: [seed, ...parts.map(bytes)],
  }))[0];
  return { ...a, pool, lpMint: await derive("pool_lp_mint", pool),
    vault0: await derive("pool_vault", pool, a.mint0), vault1: await derive("pool_vault", pool, a.mint1),
    observation: await derive("observation", pool) };
}
export async function readAmmMarket(executor: WalletTransactionExecutor, mint: Address, creator: Address, wallet: Address) {
  const launch = await readWalletLaunch(executor, mint, creator);
  if (!launch.terms?.migrated || !launch.state?.migrated || !launch.mint || launch.state.reserve !== 0n)
    throw Error("Confirmed migration is required for AMM trading.");
  const a = await poolAddresses(launch);
  const [destination] = await findAssociatedTokenPda({ mint, owner: wallet, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const response = await executor.rpc.getMultipleAccounts([
    a.pool, a.config, a.vault0, a.vault1, a.lpMint, a.observation, CPMM_TEST_PROGRAM, destination, wallet,
  ], { encoding: "base64", commitment: "confirmed", minContextSlot: launch.slot }).send(timeout());
  const [pool, config, v0, v1, lp, observation, program, user, owner] = response.value;
  if (!program?.executable) throw Error("Raydium program is unavailable.");
  const b = owned(pool, CPMM_TEST_PROGRAM, 637);
  const cfg = decodeCpmmConfig(owned(config, CPMM_TEST_PROGRAM, 236));
  for (const [at, key] of [[8,a.config],[40,a.migrator],[72,a.vault0],[104,a.vault1],[136,a.lpMint],
    [168,a.mint0],[200,a.mint1],[232,TOKEN_PROGRAM_ADDRESS],[264,TOKEN_PROGRAM_ADDRESS],[296,a.observation]] as const)
    if (keyAt(b, at) !== key) throw Error("Substituted Raydium pool identity.");
  if (!discr(b,[247,237,227,245,215,195,222,70]) || b[390] !== 0 || b[389] > 2)
    throw Error("Unsupported pool or creator fee model.");
  const oracle = owned(observation, CPMM_TEST_PROGRAM, 4075);
  if (!discr(oracle,[122,174,197,53,129,9,165,132]) || keyAt(oracle, 11) !== a.pool)
    throw Error("Pool observation identity mismatch.");
  const balance0 = token(v0, a.mint0, a.authority), balance1 = token(v1, a.mint1, a.authority);
  const fees0 = readU64(b,341)+readU64(b,357)+readU64(b,397), fees1 = readU64(b,349)+readU64(b,365)+readU64(b,405);
  if (fees0 > balance0 || fees1 > balance1) throw Error("Pool liabilities exceed reserves.");
  const lpBytes = owned(lp, TOKEN_PROGRAM_ADDRESS, 82);
  if (lpBytes[45] !== 1 || keyAt(lpBytes,4) !== a.authority || readU64(b,333) === 0n)
    throw Error("Invalid LP mint or liquidity accounting.");
  const clock = await executor.rpc.getAccountInfo(address("SysvarC1ock11111111111111111111111111111111"), {
    encoding:"base64", commitment:"confirmed", minContextSlot: response.context.slot,
  }).send(timeout());
  const clockBytes = clock.value ? new Uint8Array(getBase64Encoder().encode(clock.value.data[0])) : null;
  if (!clockBytes || clockBytes.length !== 40) throw Error("On-chain clock is unavailable.");
  const now = new DataView(clockBytes.buffer).getBigInt64(32,true);
  const setup = await executor.rpc.getMinimumBalanceForRentExemption(165n).send(timeout());
  return { launch, a, wallet, destination, slot: response.context.slot, cfg,
    poolData: b, balance0, balance1, reserve0:balance0-fees0, reserve1:balance1-fees1,
    swapOpen: !(b[329]&4) && now >= readU64(b,373), openTime:readU64(b,373),
    lpSupply: readU64(lpBytes,36), lpAccounting:readU64(b,333), initialLpBurned:launch.terms.lpBurned,
    tokens: user ? token(user,mint,wallet) : 0n, needsAta:!user, sol:owner?.lamports??0n, setup };
}
export type AmmMarket = Awaited<ReturnType<typeof readAmmMarket>>;
export function ammPreview(m: AmmMarket, amount: bigint, sell: boolean, slippage: bigint) {
  if (!m.swapOpen) throw Error("Raydium swaps are temporarily unavailable or awaiting the on-chain opening time.");
  if (sell && amount > m.tokens) throw Error("Insufficient tokens.");
  const zeroForOne = sell ? m.a.mint0 === m.launch.addresses.mint : m.a.mint0 === NATIVE_MINT;
  const q = cpmmQuote(amount, zeroForOne?m.reserve0:m.reserve1, zeroForOne?m.reserve1:m.reserve0, m.cfg.trade, slippage);
  return { ...q, sell, zeroForOne, setup: m.setup + (!sell && m.needsAta ? m.setup : 0n),
    reserve0:m.reserve0, reserve1:m.reserve1 };
}
export type AmmPreview = ReturnType<typeof ammPreview>;
export async function ammInstructions(m: AmmMarket, q: AmmPreview, payer: TransactionSigner) {
  if (payer.address !== m.wallet) throw Error("Wallet changed. Review the swap again.");
  const wrapped = await generateKeyPairSigner();
  const ix: Instruction[] = [compute, getCreateAccountInstruction({ payer, newAccount:wrapped,
    lamports:m.setup, space:165n, programAddress:TOKEN_PROGRAM_ADDRESS }),
    getInitializeAccount3Instruction({ account:wrapped.address, mint:NATIVE_MINT, owner:payer.address })];
  if (!q.sell) {
    if (m.needsAta) ix.push(await getCreateAssociatedTokenIdempotentInstructionAsync({payer,mint:m.launch.addresses.mint,owner:payer.address}));
    ix.push(getTransferSolInstruction({source:payer,destination:wrapped.address,amount:q.input}),getSyncNativeInstruction({account:wrapped.address}));
  }
  const meta = (key: Address, write=false) => ({address:key,role:write?AccountRole.WRITABLE:AccountRole.READONLY});
  const a = m.a, input=q.sell?m.destination:wrapped.address, output=q.sell?wrapped.address:m.destination;
  const data = new Uint8Array(24);data.set([143,190,90,218,196,30,51,222]);
  new DataView(data.buffer).setBigUint64(8,bounded(q.input),true);
  new DataView(data.buffer).setBigUint64(16,bounded(q.minimum),true);
  const signedPayer = {address:payer.address,role:AccountRole.READONLY_SIGNER as const,signer:payer};
  ix.push({programAddress:CPMM_TEST_PROGRAM,data,accounts:[signedPayer,
    meta(a.authority),meta(a.config),meta(a.pool,true),meta(input,true),meta(output,true),
    meta(q.zeroForOne?a.vault0:a.vault1,true),meta(q.zeroForOne?a.vault1:a.vault0,true),meta(TOKEN_PROGRAM_ADDRESS),meta(TOKEN_PROGRAM_ADDRESS),
    meta(q.zeroForOne?a.mint0:a.mint1),meta(q.zeroForOne?a.mint1:a.mint0),meta(a.observation,true)]},
    getCloseAccountInstruction({account:wrapped.address,destination:payer.address,owner:payer}));
  return ix;
}
export async function graduationPreview(executor: WalletTransactionExecutor, launch: WalletLaunchSnapshot, wallet: Address) {
  const s = launch.state;
  if (!s || !launch.terms || launch.terms.migrated || s.migrated || !s.eligible || s.sold !== s.inventory ||
      !launch.curveData || !launch.openingData || launch.mint?.mintAuthority || launch.mint?.freezeAuthority)
    throw Error("Launch is not eligible for graduation.");
  if (launch.slot < readU64(launch.curveData,178) || (launch.openingData[96] && launch.slot < readU64(launch.openingData,88)))
    throw Error("Opening restrictions must expire before graduation.");
  if (potential(s,s.sold) !== s.reserve || launch.vaultTokens !== 0n || launch.migrationTokens !== s.migrationInventory)
    throw Error("Graduation inventory or redemption backing is inconsistent.");
  const a = await graduationAddresses(launch.addresses.mint,0n);
  const r = await executor.rpc.getMultipleAccounts([a.config,CPMM_TEST_PROGRAM,a.pool,a.migratorToken,a.migratorSol,a.migratorLp],
    {encoding:"base64",commitment:"confirmed",minContextSlot:launch.slot}).send(timeout());
  const cfg = decodeCpmmConfig(owned(r.value[0],CPMM_TEST_PROGRAM,236));
  if (cfg.disabled || cfg.trade !== 2500n || !r.value[1]?.executable || r.value.slice(2).some(Boolean))
    throw Error("Unsupported setup configuration or destination accounts already exist. Refresh the launch.");
  const rents = await Promise.all([0n,165n,82n,637n,4075n].map(size=>executor.rpc.getMinimumBalanceForRentExemption(size).send(timeout())));
  const maximum = bounded(cfg.setupFee + rents[0] + rents[1]*5n + rents[2] + rents[3] + rents[4]);
  const build = (caller:TransactionSigner) => [compute,graduateInstruction({...launch.addresses,...a,caller,sequence:s.sequence,nonce:0n,maxSetupLamports:maximum})];
  return { wallet, launch, a, maximum, setupFee:cfg.setupFee, tokens:s.migrationInventory, sol:s.reserve, build };
}
export async function inspectTransaction(executor:WalletTransactionExecutor, instructions:readonly Instruction[], payer:TransactionSigner) {
  const {value:lifetime} = await executor.rpc.getLatestBlockhash({commitment:"confirmed"}).send(timeout());
  const tx = compileTransaction(appendTransactionMessageInstructions(instructions,setTransactionMessageLifetimeUsingBlockhash(lifetime,
    setTransactionMessageFeePayerSigner(payer,createTransactionMessage({version:0})))));
  const size=getTransactionEncoder().encode(tx).length;
  if (size>1232) throw Error("Transaction exceeds Solana's 1232-byte limit.");
  const simulation = await executor.rpc.simulateTransaction(getBase64EncodedWireTransaction(tx),{encoding:"base64",commitment:"confirmed",sigVerify:false,replaceRecentBlockhash:false}).send(timeout());
  if (simulation.value.err) throw Error("Simulation rejected: "+JSON.stringify(simulation.value.err));
  const fee=(await executor.rpc.getFeeForMessage(getBase64Decoder().decode(tx.messageBytes) as TransactionMessageBytesBase64,{commitment:"confirmed"}).send(timeout())).value;
  if (fee===null) throw Error("Network fee is unavailable.");
  return {fee,size,computeUnits:simulation.value.unitsConsumed??0n};
}
