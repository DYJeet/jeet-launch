import {
  address,
  getAddressDecoder,
  getBase64Encoder,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { parseMintBytes } from "./solana-rpc.ts";
import {
  decodeV5PreviewState,
  V5_PREVIEW_PROGRAM,
} from "./launch-v5-preview.ts";
import { decodeGraduation } from "./launch-graduation.ts";
import { decodeFeeState } from "./launch-fees.ts";
import {
  decodeLaunchMetadata,
  findMetadataPda,
  initializeLaunchMetadataInstruction,
  METADATA_PROGRAM,
} from "./launch-metadata.ts";
import { WalletTransactionExecutor } from "./wallet-transactions.ts";
import {
  activateWalletLaunchInstructions,
  createWalletMintInstructions,
  createWalletSupplyInstructions,
  initializeWalletLaunchInstructions,
  walletLaunchAddresses,
  walletLaunchParameters,
  type WalletLaunchInput,
  type WalletLaunchParameters,
} from "./wallet-launch.ts";

const bytes = (base64: string) =>
  new Uint8Array(getBase64Encoder().encode(base64));
const keyAt = (b: Uint8Array, at: number) =>
  getAddressDecoder().decode(b.subarray(at, at + 32));
const u64 = (b: Uint8Array, at: number) =>
  new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(at, true);
export type SavedWalletLaunch = {
  version: 1;
  genesis: string;
  mint: string;
  creator: string;
  input: Omit<
    WalletLaunchInput,
    "capDuration" | "openingDuration" | "openingDelay"
  > & {
    capDuration: string;
    openingDuration: string;
    openingDelay: string;
  };
  pendingStage?: "mint" | "supply" | "custody" | "metadata" | "activation";
  signatures: Partial<
    Record<"mint" | "supply" | "custody" | "metadata" | "activation", string>
  >;
};
export function launchJob(
  input: WalletLaunchInput,
  mint: Address,
  creator: Address,
  genesis: string,
): SavedWalletLaunch {
  walletLaunchParameters(input);
  return {
    version: 1,
    genesis,
    mint,
    creator,
    input: {
      ...input,
      capDuration: input.capDuration.toString(),
      openingDuration: input.openingDuration.toString(),
      openingDelay: input.openingDelay.toString(),
    },
    signatures: {},
  };
}
export function parametersFromJob(job: SavedWalletLaunch) {
  if (job.version !== 1) throw Error("Unsupported saved launch version.");
  return walletLaunchParameters({
    ...job.input,
    capDuration: BigInt(job.input.capDuration),
    openingDuration: BigInt(job.input.openingDuration),
    openingDelay: BigInt(job.input.openingDelay),
  });
}
export async function readWalletLaunch(
  executor: WalletTransactionExecutor,
  mint: Address,
  creator: Address,
) {
  await executor.network();
  const l = await walletLaunchAddresses(mint, creator),
    [metadataAddress] = await findMetadataPda(mint);
  const names = [
    l.mint,
    l.creatorAta,
    l.vault,
    l.migrationVault,
    l.custody,
    l.opening,
    l.curve,
    l.platformVault,
    l.creatorVault,
    metadataAddress,
    l.terms,
  ];
  const response = await executor.rpc
    .getMultipleAccounts(names, { encoding: "base64", commitment: "confirmed" })
    .send({ abortSignal: AbortSignal.timeout(10000) });
  const [
    mintAccount,
    creatorAta,
    vault,
    migrationVault,
    custody,
    opening,
    curve,
    platform,
    creatorFee,
    metadataAccount,
    termsAccount,
  ] = response.value;
  const owned = (account: typeof custody, owner: Address, size?: number) => {
    if (!account || account.owner !== owner || account.executable)
      throw Error("Substituted/missing account or unexpected owner.");
    const data = bytes(account.data[0]);
    if (size !== undefined && data.length !== size)
      throw Error("Unexpected account size.");
    return data;
  };
  const token = (account: typeof vault, owner: Address) => {
    if (!account) return null;
    const b = owned(account, TOKEN_PROGRAM_ADDRESS, 165);
    if (keyAt(b, 0) !== mint || keyAt(b, 32) !== owner || b[108] !== 1)
      throw Error("Invalid token-account identity or state.");
    return u64(b, 64);
  };
  const parsedMint = mintAccount
    ? parseMintBytes(
        owned(mintAccount, TOKEN_PROGRAM_ADDRESS, 82),
        mint,
        mintAccount.owner,
      )
    : null;
  if (parsedMint && !parsedMint.initialized)
    throw Error("Mint is not initialized.");
  let custodyData: Uint8Array | null = null;
  if (custody) {
    custodyData = owned(custody, V5_PREVIEW_PROGRAM, 89);
    if (
      new TextDecoder().decode(custodyData.subarray(0, 8)) !== "JEETCST1" ||
      keyAt(custodyData, 8) !== mint ||
      keyAt(custodyData, 40) !== creator
    )
      throw Error("Custody identity mismatch.");
  }
  const curveData = curve ? owned(curve, V5_PREVIEW_PROGRAM, 262) : null;
  if (
    curveData &&
    (keyAt(curveData, 8) !== mint ||
      keyAt(curveData, 40) !== l.custody ||
      keyAt(curveData, 72) !== l.opening)
  )
    throw Error("Curve relationships mismatch.");
  const state = curveData ? decodeV5PreviewState(curveData) : null;
  const openingData = opening ? owned(opening, V5_PREVIEW_PROGRAM, 108) : null;
  const metadata = metadataAccount
    ? decodeLaunchMetadata(owned(metadataAccount, METADATA_PROGRAM))
    : null;
  if (metadata && metadata.mint !== mint)
    throw Error("Metadata mint mismatch.");
  const terms = termsAccount
    ? decodeGraduation(owned(termsAccount, V5_PREVIEW_PROGRAM, 253))
    : null;
  if (
    terms &&
    (terms.mint !== mint ||
      terms.curve !== l.curve ||
      (!terms.migrated && terms.pool !== address("11111111111111111111111111111111")) ||
      terms.config !== l.config ||
      terms.migrator !== l.migrator)
  )
    throw Error("Graduation destination mismatch.");
  const fees = [platform, creatorFee].map((account, kind) => {
    if (!account) return null;
    const f = decodeFeeState(owned(account, V5_PREVIEW_PROGRAM, 153));
    if (
      f.mint !== mint ||
      f.curve !== l.curve ||
      f.kind !== kind ||
      (kind === 1 && f.beneficiary !== creator)
    )
      throw Error("Fee entitlement mismatch.");
    return f;
  });
  return {
    addresses: l,
    metadataAddress,
    slot: response.context.slot,
    mint: parsedMint,
    state,
    curveData,
    openingData,
    custodyData,
    metadata,
    terms,
    fees,
    creatorTokens: token(creatorAta, creator),
    vaultTokens: token(vault, l.custody),
    migrationTokens: token(migrationVault, l.curve),
  };
}
export type WalletLaunchSnapshot = Awaited<ReturnType<typeof readWalletLaunch>>;
function verifyPretrade(s: WalletLaunchSnapshot, p: WalletLaunchParameters) {
  if (
    !s.mint ||
    s.mint.supplyRaw !== p.supply ||
    s.mint.decimals !== p.decimals ||
    s.creatorTokens !== p.creatorAmount
  )
    throw Error("Issued supply/creator allocation mismatch; nothing retried.");
  if (!s.state || !s.custodyData || !s.openingData || !s.curveData)
    throw Error("Launch initialization is incomplete.");
  if (
    u64(s.custodyData, 72) !== p.creatorAmount ||
    u64(s.custodyData, 80) !== p.inventory ||
    s.state.inventory !== p.tradingInventory ||
    s.state.migrationInventory !== p.migrationInventory ||
    s.state.quantum !== p.quantum ||
    s.state.start !== p.curve.start ||
    s.state.end !== p.curve.end ||
    s.state.sequence !== 0n ||
    s.state.sold !== 0n ||
    s.state.reserve !== 0n ||
    s.vaultTokens !== p.tradingInventory ||
    s.migrationTokens !== p.migrationInventory ||
    s.openingData[96] !== Number(p.capEnabled) ||
    u64(s.openingData, 97) !== 0n ||
    u64(s.openingData, 88) - u64(s.openingData, 80) !== p.capDuration ||
    new DataView(s.openingData.buffer, s.openingData.byteOffset).getUint16(
      106,
      true,
    ) !== p.capBps ||
    new DataView(s.curveData.buffer, s.curveData.byteOffset).getUint16(
      202,
      true,
    ) !== p.openingLimitBps ||
    u64(s.curveData, 170) !== p.openingDuration ||
    u64(s.curveData, 194) !== p.openingDelay
  )
    throw Error(
      "Existing launch differs from the reviewed parameters, or has already traded. Refusing initialization/re-minting.",
    );
}
/** Each stage is confirmed and read back before the next signing request. Saved state contains no keys. */
export async function executeWalletLaunch(
  executor: WalletTransactionExecutor,
  job: SavedWalletLaunch,
  mintSigner: TransactionSigner | null,
  save: (job: SavedWalletLaunch) => void,
  stage: (text: string) => void,
  signal?: AbortSignal,
) {
  if (job.genesis !== executor.environment.genesis)
    throw Error("Saved launch belongs to a different validator.");
  const creator = address(job.creator),
    mint = address(job.mint),
    p = parametersFromJob(job),
    l = await walletLaunchAddresses(mint, creator);
  const reconciled = await executor.reconcile(creator);
  if (reconciled && job.pendingStage) {
    job.signatures[job.pendingStage] = reconciled;
    delete job.pendingStage;
    save(job);
  }
  const rent = async (size: bigint) =>
    executor.rpc
      .getMinimumBalanceForRentExemption(size, { commitment: "confirmed" })
      .send({ abortSignal: AbortSignal.timeout(8000) });
  const submit = async (
    name: keyof SavedWalletLaunch["signatures"],
    maximum: bigint,
    build: (
      who: TransactionSigner,
    ) => Promise<readonly import("@solana/kit").Instruction[]>,
  ) => {
    stage(name);
    signal?.throwIfAborted();
    job.pendingStage = name;
    save(job);
    const signature = await executor.execute(
      async (who) => {
        if (who.address !== creator)
          throw Error("Creator wallet changed; reconnect the saved creator.");
        return build(who);
      },
      maximum,
      signal,
    );
    if (!signature) throw Error("Confirmation returned no signature.");
    job.signatures[name] = signature;
    delete job.pendingStage;
    save(job);
  };
  let snapshot = await readWalletLaunch(executor, mint, creator);
  if (!snapshot.mint) {
    if (!mintSigner || mintSigner.address !== mint)
      throw Error(
        "The first mint transaction is unconfirmed and its ephemeral signer is unavailable. Reconcile the saved transaction; if expired with no account, start a new launch.",
      );
    const mintRent = await rent(82n);
    await submit("mint", mintRent, async (who) =>
      createWalletMintInstructions(who, mintSigner, mintRent, p),
    );
    snapshot = await readWalletLaunch(executor, mint, creator);
  }
  if (snapshot.mint?.supplyRaw === 0n) {
    if (
      snapshot.mint.mintAuthority !== creator ||
      snapshot.mint.freezeAuthority !== creator ||
      snapshot.mint.decimals !== p.decimals
    )
      throw Error("Mint authorities/decimals differ from the saved launch.");
    await submit("supply", 3n * (await rent(165n)), (who) =>
      createWalletSupplyInstructions(who, l, p),
    );
    snapshot = await readWalletLaunch(executor, mint, creator);
  }
  if (!snapshot.state) {
    if (
      snapshot.mint?.supplyRaw !== p.supply ||
      snapshot.mint.decimals !== p.decimals ||
      snapshot.mint.mintAuthority !== creator ||
      snapshot.mint.freezeAuthority !== creator ||
      snapshot.creatorTokens !== p.creatorAmount ||
      snapshot.vaultTokens !== p.inventory ||
      snapshot.migrationTokens !== 0n
    )
      throw Error(
        "Supply or authority state differs; refusing to remint or initialize.",
      );
    const budget = (
      await Promise.all([89n, 108n, 262n, 153n, 153n].map(rent))
    ).reduce((a, b) => a + b, 0n);
    await submit("custody", budget, async (who) =>
      initializeWalletLaunchInstructions(who, l, p),
    );
    snapshot = await readWalletLaunch(executor, mint, creator);
  }
  verifyPretrade(snapshot, p);
  if (!snapshot.metadata) {
    if (snapshot.mint?.mintAuthority !== creator)
      throw Error(
        "Mint authority is unavailable for metadata; launch cannot activate.",
      );
    // Disclosed hard budget. Actual CPI costs are measured/checked by opcode 23;
    // this is a maximum, not a claim that a mutable protocol fee is a guaranteed quote.
    await submit("metadata", 20000000n, async (who) => [
      await initializeLaunchMetadataInstruction({
        creator: who,
        mint,
        custody: l.custody,
        name: p.name,
        symbol: p.symbol,
        uri: p.uri,
        mutable: false,
        maxCostLamports: 20000000n,
        allowLocalUri: true,
      }),
    ]);
    snapshot = await readWalletLaunch(executor, mint, creator);
  }
  if (
    !snapshot.metadata ||
    snapshot.metadata.name !== p.name ||
    snapshot.metadata.symbol !== p.symbol ||
    snapshot.metadata.uri !== p.uri ||
    snapshot.metadata.mutable ||
    snapshot.metadata.updateAuthority !== creator
  )
    throw Error(
      "Confirmed metadata differs from the reviewed document. Activation blocked.",
    );
  if (!snapshot.terms) {
    if (
      snapshot.mint?.mintAuthority !== creator ||
      snapshot.mint.freezeAuthority !== creator
    )
      throw Error(
        "Both creator authorities are required for atomic activation.",
      );
    await submit("activation", await rent(253n), async (who) =>
      activateWalletLaunchInstructions(who, l, p),
    );
    snapshot = await readWalletLaunch(executor, mint, creator);
  }
  verifyPretrade(snapshot, p);
  if (
    !snapshot.mint?.mintAuthorityRevoked ||
    !snapshot.mint.freezeAuthorityRevoked ||
    !snapshot.terms ||
    snapshot.terms.migrated ||
    snapshot.terms.maxPriceGapBps !== p.maxPriceGapBps
  )
    throw Error("Atomic launch activation is not confirmed.");
  stage("confirmed");
  return snapshot;
}
