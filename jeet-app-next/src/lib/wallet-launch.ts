/** Wallet-side assembly for the verified local V5/V6 instructions. No server signer. */
import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  initializeCustodyInstruction,
  initializeOpeningInstruction,
} from "./launch-custody.ts";
import {
  initializeV5PreviewInstruction,
  V5_PREVIEW_PROGRAM,
} from "./launch-v5-preview.ts";
import {
  activateGraduationInstructions,
  graduationAddresses,
} from "./launch-graduation.ts";
import { potential, validateV5 } from "./v5-pricing.ts";
import { parseUnits } from "./wallet-environment.ts";
import { validateMetadataFields } from "./launch-metadata.ts";

export type WalletLaunchInput = {
  name: string;
  symbol: string;
  uri: string;
  supply: string;
  decimals: number;
  creatorPercent: string;
  capPercent: string;
  capEnabled: boolean;
  capDuration: bigint;
  openingDuration: bigint;
  openingDelay: bigint;
  openingLimitBps: number;
};
export function walletLaunchParameters(input: WalletLaunchInput) {
  validateMetadataFields(input.name, input.symbol, input.uri, true);
  if (
    !Number.isInteger(input.decimals) ||
    input.decimals < 0 ||
    input.decimals > 9
  )
    throw Error("Supported decimals are 0–9.");
  const supply = parseUnits(input.supply, input.decimals),
    quantum = 10n ** BigInt(input.decimals);
  const creatorBps = parseUnits(input.creatorPercent, 2),
    capBps = parseUnits(input.capPercent, 2);
  if (!supply || supply % quantum || creatorBps > 500n || capBps > 10000n)
    throw Error(
      "Use a whole-token supply, creator allocation 0–5% and wallet cap 0–100%.",
    );
  const creatorAmount = (supply * creatorBps) / 10000n,
    inventory = supply - creatorAmount;
  if (creatorAmount % quantum)
    throw Error(
      "This supply/allocation pair creates fractional creator tokens; choose a compatible whole-token allocation.",
    );
  const tradingInventory = (((inventory / quantum) * 3n) / 5n) * quantum;
  const migrationInventory = inventory - tradingInventory;
  const curve = validateV5({
    inventory: tradingInventory,
    quantum,
    start: 42n,
    end: 126n,
  });
  if (!migrationInventory || migrationInventory % quantum)
    throw Error("Migration inventory must contain whole tokens.");
  if (
    input.capDuration < 0n ||
    input.capDuration > 1000000n ||
    (input.capEnabled && !input.capDuration) ||
    input.openingDelay < 0n ||
    input.openingDelay > 1000000n ||
    input.openingDuration <= 0n ||
    input.openingDuration > 1000000n ||
    !Number.isInteger(input.openingLimitBps) ||
    input.openingLimitBps < 0 ||
    input.openingLimitBps > 10000 ||
    (input.capEnabled && BigInt(input.openingLimitBps) > capBps)
  )
    throw Error("Invalid cumulative cap or protected-opening parameters.");
  const reserve = potential(curve, tradingInventory),
    finalPoolValue = curve.end * (migrationInventory / quantum);
  const gap =
    reserve > finalPoolValue
      ? reserve - finalPoolValue
      : finalPoolValue - reserve;
  if (gap * 10000n > finalPoolValue * 60n)
    throw Error(
      "This rounded partition exceeds the fixed 60-bps graduation price tolerance. Increase supply.",
    );
  if (creatorAmount + tradingInventory + migrationInventory !== supply)
    throw Error("Supply does not reconcile.");
  return {
    ...input,
    supply,
    quantum,
    creatorBps: Number(creatorBps),
    capBps: Number(capBps),
    creatorAmount,
    inventory,
    tradingInventory,
    migrationInventory,
    curve,
    graduationReserve: reserve,
    maxPriceGapBps: 60,
    nonce: 2n,
  };
}
export type WalletLaunchParameters = ReturnType<typeof walletLaunchParameters>;
export async function walletLaunchAddresses(mint: Address, creator: Address) {
  const derive = (s: string, ...parts: Uint8Array[]) =>
    getProgramDerivedAddress({
      programAddress: V5_PREVIEW_PROGRAM,
      seeds: [
        new TextEncoder().encode(s),
        new Uint8Array(getAddressEncoder().encode(mint)),
        ...parts,
      ],
    });
  const [custody] = await derive("launch"),
    [opening] = await derive("opening"),
    [curve] = await derive("curve");
  const [platformVault] = await derive("fee", new Uint8Array([0])),
    [creatorVault] = await derive("fee", new Uint8Array([1]));
  const ata = async (owner: Address) =>
    (
      await findAssociatedTokenPda({
        mint,
        owner,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
    )[0];
  return {
    mint,
    creator,
    custody,
    opening,
    curve,
    platformVault,
    creatorVault,
    vault: await ata(custody),
    creatorAta: await ata(creator),
    migrationVault: await ata(curve),
    ...(await graduationAddresses(mint, 2n)),
  };
}
export type WalletLaunchAddresses = Awaited<
  ReturnType<typeof walletLaunchAddresses>
>;
/** Explicit compute-unit ceiling, with no priority-fee instruction or hidden payment. */
export function launchComputeLimit(units = 600000): Instruction {
  if (!Number.isInteger(units) || units < 1000 || units > 1400000)
    throw Error("Compute limit");
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return {
    programAddress: address("ComputeBudget111111111111111111111111111111"),
    data,
  };
}
export function createWalletMintInstructions(
  payer: TransactionSigner,
  mint: TransactionSigner,
  rent: bigint,
  p: WalletLaunchParameters,
): Instruction[] {
  if (rent <= 0n || rent > (1n << 64n) - 1n)
    throw Error("Invalid mint rent quote.");
  const data = new Uint8Array(52),
    v = new DataView(data.buffer);
  v.setUint32(0, 0, true);
  v.setBigUint64(4, rent, true);
  v.setBigUint64(12, 82n, true);
  data.set(getAddressEncoder().encode(TOKEN_PROGRAM_ADDRESS), 20);
  const createAccount = {
    programAddress: address("11111111111111111111111111111111"),
    data,
    accounts: [
      {
        address: payer.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: payer,
      },
      {
        address: mint.address,
        role: AccountRole.WRITABLE_SIGNER,
        signer: mint,
      },
    ],
  };
  return [
    launchComputeLimit(),
    createAccount,
    getInitializeMint2Instruction({
      mint: mint.address,
      decimals: p.decimals,
      mintAuthority: payer.address,
      freezeAuthority: payer.address,
    }),
  ];
}
export async function createWalletSupplyInstructions(
  payer: TransactionSigner,
  l: WalletLaunchAddresses,
  p: WalletLaunchParameters,
): Promise<Instruction[]> {
  if (payer.address !== l.creator) throw Error("Creator signer changed.");
  const instructions: Instruction[] = [launchComputeLimit()];
  for (const owner of [l.creator, l.custody, l.curve])
    instructions.push(
      await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer,
        mint: l.mint,
        owner,
      }),
    );
  for (const [token, amount] of [
    [l.creatorAta, p.creatorAmount],
    [l.vault, p.inventory],
  ] as const) {
    if (amount)
      instructions.push(
        getMintToCheckedInstruction({
          mint: l.mint,
          token,
          mintAuthority: payer,
          amount,
          decimals: p.decimals,
        }),
      );
  }
  return instructions;
}
export function initializeWalletLaunchInstructions(
  creator: TransactionSigner,
  l: WalletLaunchAddresses,
  p: WalletLaunchParameters,
): Instruction[] {
  if (creator.address !== l.creator) throw Error("Creator signer changed.");
  const local = (ix: Instruction) => ({
    ...ix,
    programAddress: V5_PREVIEW_PROGRAM,
  });
  return [
    launchComputeLimit(),
    local(
      initializeCustodyInstruction({
        payer: creator,
        ...l,
        creatorTokenAccount: p.creatorAmount ? l.creatorAta : null,
        creatorAmount: p.creatorAmount,
        inventoryAmount: p.inventory,
      }),
    ),
    local(
      initializeOpeningInstruction({
        payer: creator,
        ...l,
        capBps: p.capBps,
        enabled: p.capEnabled,
        durationSlots: p.capDuration,
      }),
    ),
    initializeV5PreviewInstruction({
      ...l,
      creator,
      payer: creator,
      quantum: p.quantum,
      tradingInventory: p.tradingInventory,
      migrationInventory: p.migrationInventory,
      basePrice: p.curve.start,
      slope: p.curve.end,
      protection: {
        delaySlots: p.openingDelay,
        durationSlots: p.openingDuration,
        limitBps: p.openingLimitBps,
      },
    }),
  ];
}
export function activateWalletLaunchInstructions(
  creator: TransactionSigner,
  l: WalletLaunchAddresses,
  p: WalletLaunchParameters,
) {
  if (creator.address !== l.creator) throw Error("Creator signer changed.");
  // Metadata must be created and read back successfully before the UI calls this
  // exact atomic authority-revocation / immutable-graduation-terms bundle.
  return [
    launchComputeLimit(),
    ...activateGraduationInstructions({
      ...l,
      creator,
      maxPriceGapBps: p.maxPriceGapBps,
    }),
  ];
}
