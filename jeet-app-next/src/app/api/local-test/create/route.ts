import { createClient, generateKeyPairSigner, isNone, lamports, address, assertAccountExists, createSolanaRpc, fetchEncodedAccount, getAddressEncoder } from "@solana/kit";
import { rpcAirdrop, solanaRpc } from "@solana/kit-plugin-rpc";
import { airdropPayer, generatedPayer } from "@solana/kit-plugin-signer";
import {
  associatedTokenProgram,
  AuthorityType,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
  tokenProgram,
} from "@solana-program/token";
import { NextResponse } from "next/server";
import {
  CUSTODY_PROGRAM_ADDRESS, CUSTODY_STATE_SIZE, findLaunchCustodyPda,
  initializeCustodyInstruction, proveCustodyInstruction, findOpeningPda, initializeOpeningInstruction, findCurvePda, initializeCurveInstruction, decodeCurveState,
} from "@/lib/launch-custody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_RPC_URL = "http://127.0.0.1:8899";
const LOCAL_WS_URL = "ws://127.0.0.1:8900";
const MAX_U64 = (1n << 64n) - 1n;
const BASIS_POINTS_DENOMINATOR = 10_000n;
const MAX_CREATOR_BPS = 500n; // 5.00%

type CreateRequest = {
  totalSupply?: string;
  decimals?: number;
  devAllocation?: string;
  maxWalletPercent?: string;
  curveBasePriceLamports?: string;
  curveSlopeLamports?: string;
  protectedOpeningEnabled?: boolean;
  protectedDelaySlots?: number;
  protectedDurationSlots?: number;
  protectedLimitPercent?: string;
  openingEnabled?: boolean;
  openingDurationSlots?: number;
  revokeMint?: boolean;
  revokeFreeze?: boolean;
};

function parseBaseUnits(totalSupply: string, decimals: number) {
  if (!/^\d+$/.test(totalSupply)) {
    throw new Error("Total supply must be a whole-number string for the local test.");
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("Decimals must be an integer from 0 through 9.");
  }

  const baseUnits = BigInt(totalSupply) * 10n ** BigInt(decimals);
  if (baseUnits <= 0n || baseUnits > MAX_U64) {
    throw new Error("Supply does not fit in the SPL Token u64 supply range.");
  }

  return baseUnits;
}

function parsePercentToBasisPoints(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Creator allocation must be a percentage with at most two decimal places.");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const basisPoints = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  if (basisPoints < 0n || basisPoints > MAX_CREATOR_BPS) {
    throw new Error("Creator allocation must be between 0% and 5%.");
  }

  return basisPoints;
}

async function getTokenAccountAmount(address: string) {
  const response = await fetch(LOCAL_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountBalance",
      params: [address, { commitment: "confirmed" }],
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    result?: { value?: { amount?: string } };
    error?: { message?: string };
  };

  const amount = payload.result?.value?.amount;
  if (!response.ok || !amount) {
    throw new Error(payload.error?.message ?? `Could not verify token account ${address}.`);
  }

  return BigInt(amount);
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause) {
      try {
        return `${error.message} | cause: ${JSON.stringify(cause)}`;
      } catch {
        return `${error.message} | cause: ${String(cause)}`;
      }
    }
    return error.message;
  }

  return String(error);
}

export async function POST(request: Request) {
  let phase = "validation";
  let createdMint: string | null = null;
  try {
    let body: CreateRequest;
    try {
      const input: unknown = await request.json();
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Request must be a JSON object.");
      }
      body = input as CreateRequest;
      if (typeof body.totalSupply !== "string" ||
          (body.devAllocation !== undefined && typeof body.devAllocation !== "string") ||
          (body.decimals !== undefined && typeof body.decimals !== "number") ||
          (body.revokeMint !== undefined && typeof body.revokeMint !== "boolean") ||
          (body.revokeFreeze !== undefined && typeof body.revokeFreeze !== "boolean")) {
        throw new Error("Invalid launch parameter types.");
      }
      if (body.maxWalletPercent !== undefined && (typeof body.maxWalletPercent !== "string" ||
          !/^\d+(?:\.\d{1,2})?$/.test(body.maxWalletPercent.trim()) || Number(body.maxWalletPercent) > 100)) {
        throw new Error("Opening wallet cap must be a percentage from 0 to 100 with at most two decimals.");
      }
      if ((body.openingEnabled !== undefined && typeof body.openingEnabled !== "boolean") ||
          (body.openingDurationSlots !== undefined && (!Number.isSafeInteger(body.openingDurationSlots) ||
           body.openingDurationSlots < 0 || body.openingDurationSlots > 1000000)) ||
          ((body.openingEnabled ?? true) && body.openingDurationSlots === 0)) {
        throw new Error("Invalid opening phase settings.");
      }
      for (const [name,value,positive] of [["base price",body.curveBasePriceLamports,true],["slope",body.curveSlopeLamports,false]] as const) {
        if (value !== undefined && (typeof value !== "string" || !/^\d+$/.test(value) || BigInt(value)>MAX_U64 || (positive && BigInt(value)===0n))) {
          throw new Error(`Curve ${name} must be a ${positive ? "positive" : "nonnegative"} u64 lamport string.`);
        }
      }
      if(body.protectedOpeningEnabled!==undefined && typeof body.protectedOpeningEnabled!=="boolean") throw new Error("Invalid protected opening enabled flag.");
      for(const value of [body.protectedDelaySlots,body.protectedDurationSlots]) {
        if(value!==undefined && (!Number.isSafeInteger(value) || value<0 || value>1000000)) throw new Error("Protected slot settings must be integers from 0 through 1000000.");
      }
      if(body.protectedLimitPercent!==undefined && (typeof body.protectedLimitPercent!=="string" ||
        !/^\d+(?:\.\d{1,2})?$/.test(body.protectedLimitPercent.trim()) || Number(body.protectedLimitPercent)>100)) throw new Error("Invalid protected opening limit percentage.");
      if(body.protectedOpeningEnabled) {
        const duration=body.protectedDurationSlots??50,delay=body.protectedDelaySlots??0;
        const percentBps=(s:string)=>{const [w,f=""]=s.trim().split(".");return BigInt(w)*100n+BigInt(f.padEnd(2,"0"));};
        const supply=parseBaseUnits(body.totalSupply.trim(),body.decimals??9);
        const cap=supply*percentBps(body.maxWalletPercent??"1")/10000n;
        const limit=supply*percentBps(body.protectedLimitPercent??"0.50")/10000n;
        const inventory=supply-supply*parsePercentToBasisPoints(body.devAllocation?.trim()??"0")/10000n;
        if(duration===0 || limit>=inventory || ((body.openingEnabled??true) &&
          ((cap>0n && limit>=cap) || (cap===0n && limit!==0n) || delay+duration>(body.openingDurationSlots??150)))) {
          throw new Error("Protected opening requires a positive duration, a stricter wallet limit and a window within the enabled ordinary cap phase.");
        }
      }
      parseBaseUnits(body.totalSupply.trim(), body.decimals ?? 9);
      parsePercentToBasisPoints(body.devAllocation?.trim() ?? "0");
    } catch (error) {
      return NextResponse.json({ ok: false, message: describeError(error) }, { status: 400 });
    }
    const totalSupply = body.totalSupply?.trim() ?? "";
    const decimals = body.decimals ?? 9;
    const devAllocation = body.devAllocation?.trim() ?? "0";
    const revokeMint = body.revokeMint ?? true;
    const revokeFreeze = body.revokeFreeze ?? true;

    const totalAmount = parseBaseUnits(totalSupply, decimals);
    const creatorAllocationBps = parsePercentToBasisPoints(devAllocation);
    const creatorAmount = (totalAmount * creatorAllocationBps) / BASIS_POINTS_DENOMINATOR;
    const launchInventoryAmount = totalAmount - creatorAmount;

    if (launchInventoryAmount <= 0n) {
      throw new Error("Launch inventory must remain greater than zero.");
    }

    // Fail before creating or funding a launch if the custody program is unavailable.
    phase = "custody-program-check";
    const program = await fetchEncodedAccount(createSolanaRpc(LOCAL_RPC_URL), CUSTODY_PROGRAM_ADDRESS);
    assertAccountExists(program);
    if (!program.executable) {
      throw new Error("Local custody program is not executable. Start npm run validator after npm run custody:build.");
    }

    phase = "local-funding";
    const client = await createClient()
      .use(generatedPayer())
      .use(
        solanaRpc({
          rpcUrl: LOCAL_RPC_URL,
          rpcSubscriptionsUrl: LOCAL_WS_URL,
          // Version 0 supports local validators without the newer v1 feature gate.
          transactionConfig: { version: 0 },
        }),
      )
      .use(rpcAirdrop())
      .use(airdropPayer(lamports(2_000_000_000n)))
      .use(tokenProgram())
      .use(associatedTokenProgram());

    const mint = await generateKeyPairSigner();
    const creator = await generateKeyPairSigner();
    const [custodyAddress, custodyBump] = await findLaunchCustodyPda(mint.address);

    phase = "mint-creation";
    createdMint = String(mint.address);
    const createResult = await client.token.instructions
      .createMint({
        newMint: mint,
        decimals,
        mintAuthority: client.payer.address,
        freezeAuthority: client.payer.address,
      })
      .sendTransaction();

    phase = "allocation-minting";
    let creatorMintSignature: string | null = null;
    let creatorTokenAccount: string | null = null;

    if (creatorAmount > 0n) {
      const creatorMintResult = await client.token.instructions
        .mintToATA({
          mint: mint.address,
          owner: creator.address,
          mintAuthority: client.payer,
          amount: creatorAmount,
          decimals,
        })
        .sendTransaction();

      const [creatorAta] = await findAssociatedTokenPda({
        mint: mint.address,
        owner: creator.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });

      creatorMintSignature = String(creatorMintResult.context.signature);
      creatorTokenAccount = String(creatorAta);
    }

    const launchMintResult = await client.token.instructions
      .mintToATA({
        mint: mint.address,
        owner: custodyAddress,
        mintAuthority: client.payer,
        amount: launchInventoryAmount,
        decimals,
      })
      .sendTransaction();

    const [launchVaultTokenAccount] = await findAssociatedTokenPda({
      mint: mint.address,
      owner: custodyAddress,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const [curveAddress, curveBump] = await findCurvePda(mint.address);
    const basePrice = BigInt(body.curveBasePriceLamports ?? "1000");
    const curveSlope = BigInt(body.curveSlopeLamports ?? "1");
    const [protectedWhole,protectedFraction=""]=(body.protectedLimitPercent??"0.50").trim().split(".");
    const protection=body.protectedOpeningEnabled ? {
      delaySlots:BigInt(body.protectedDelaySlots??0),durationSlots:BigInt(body.protectedDurationSlots??50),
      limitBps:Number(BigInt(protectedWhole)*100n+BigInt(protectedFraction.padEnd(2,"0"))),
    } : undefined;
    const [openingAddress, openingBump] = await findOpeningPda(mint.address);
    const [capWhole, capFraction = ""] = (body.maxWalletPercent ?? "1").trim().split(".");
    const openingCapBps = Number(BigInt(capWhole) * 100n + BigInt(capFraction.padEnd(2, "0")));
    phase = "custody-initialization";
    const custodyResult = await client.sendTransaction([
      initializeCustodyInstruction({
        payer: client.payer, mint: mint.address, creator: creator.address,
        creatorTokenAccount: creatorTokenAccount ? address(creatorTokenAccount) : null,
        custody: custodyAddress, vault: launchVaultTokenAccount,
        creatorAmount, inventoryAmount: launchInventoryAmount,
      }),
      proveCustodyInstruction(custodyAddress, mint.address, launchVaultTokenAccount),
      initializeOpeningInstruction({ payer: client.payer, mint: mint.address, custody: custodyAddress,
        opening: openingAddress, capBps: openingCapBps, enabled: body.openingEnabled ?? true,
        durationSlots: BigInt(body.openingDurationSlots ?? 150) }),
      initializeCurveInstruction({payer:client.payer,mint:mint.address,custody:custodyAddress,opening:openingAddress,
        curve:curveAddress,vault:launchVaultTokenAccount,basePrice,slope:curveSlope,protection}),
    ]);

    phase = "authority-configuration";
    const authorityInstructions = [];
    if (revokeMint) {
      authorityInstructions.push(
        client.token.instructions.setAuthority({
          owned: mint.address,
          owner: client.payer,
          authorityType: AuthorityType.MintTokens,
          newAuthority: null,
        }),
      );
    }

    if (revokeFreeze) {
      authorityInstructions.push(
        client.token.instructions.setAuthority({
          owned: mint.address,
          owner: client.payer,
          authorityType: AuthorityType.FreezeAccount,
          newAuthority: null,
        }),
      );
    }

    let authoritySignature: string | null = null;
    if (authorityInstructions.length > 0) {
      const authorityResult = await client.sendTransaction(authorityInstructions);
      authoritySignature = String(authorityResult.context.signature);
    }

    phase = "on-chain-verification";
    const state = await fetchEncodedAccount(client.rpc, custodyAddress);
    assertAccountExists(state);
    const stateView = new DataView(state.data.buffer, state.data.byteOffset, state.data.byteLength);
    const encoder = getAddressEncoder();
    if (state.programAddress !== CUSTODY_PROGRAM_ADDRESS || state.executable ||
        state.data.length !== CUSTODY_STATE_SIZE ||
        new TextDecoder().decode(state.data.slice(0, 8)) !== "JEETCST1" ||
        !state.data.slice(8, 40).every((v, i) => v === encoder.encode(mint.address)[i]) ||
        !state.data.slice(40, 72).every((v, i) => v === encoder.encode(creator.address)[i]) ||
        stateView.getBigUint64(72, true) !== creatorAmount ||
        stateView.getBigUint64(80, true) !== launchInventoryAmount || state.data[88] !== custodyBump) {
      throw new Error("Custody state verification failed.");
    }
    const vaultAccount = await client.token.accounts.token.fetch(launchVaultTokenAccount);
    if (vaultAccount.programAddress !== TOKEN_PROGRAM_ADDRESS ||
        vaultAccount.data.owner !== custodyAddress || vaultAccount.data.mint !== mint.address ||
        !isNone(vaultAccount.data.delegate) || vaultAccount.data.delegatedAmount !== 0n ||
        !isNone(vaultAccount.data.closeAuthority) || vaultAccount.data.amount !== launchInventoryAmount) {
      throw new Error("Launch inventory custody verification failed.");
    }

    const openingState = await fetchEncodedAccount(client.rpc, openingAddress);
    assertAccountExists(openingState);
    if (openingState.programAddress !== CUSTODY_PROGRAM_ADDRESS || openingState.executable || openingState.data.length !== 108 ||
        new TextDecoder().decode(openingState.data.slice(0, 8)) !== "JEETOPN1") {
      throw new Error("Opening state verification failed.");
    }
    const openingView = new DataView(openingState.data.buffer, openingState.data.byteOffset, openingState.data.byteLength);
    if (!openingState.data.slice(8, 40).every((v, i) => v === encoder.encode(mint.address)[i]) ||
        !openingState.data.slice(40, 72).every((v, i) => v === encoder.encode(custodyAddress)[i]) ||
        openingState.data[105] !== openingBump || openingView.getBigUint64(72, true) !== totalAmount * BigInt(openingCapBps) / 10000n ||
        openingView.getUint16(106, true) !== openingCapBps ||
        openingState.data[96] !== ((body.openingEnabled ?? true) ? 1 : 0) ||
        openingView.getBigUint64(88, true) - openingView.getBigUint64(80, true) !== BigInt(body.openingDurationSlots ?? 150) ||
        openingView.getBigUint64(97, true) !== 0n) {
      throw new Error("Opening cap configuration verification failed.");
    }
    const curveAccount = await fetchEncodedAccount(client.rpc,curveAddress);
    assertAccountExists(curveAccount);
    const curve = decodeCurveState(curveAccount.data);
    if (curveAccount.programAddress!==CUSTODY_PROGRAM_ADDRESS || curveAccount.executable || curveAccount.data[152]!==curveBump ||
        !curveAccount.data.slice(8,40).every((v,i)=>v===encoder.encode(mint.address)[i]) ||
        !curveAccount.data.slice(40,72).every((v,i)=>v===encoder.encode(custodyAddress)[i]) ||
        !curveAccount.data.slice(72,104).every((v,i)=>v===encoder.encode(openingAddress)[i]) ||
        curve.base!==basePrice || curve.slope!==curveSlope || curve.scale!==10n**BigInt(decimals) ||
        curve.sold!==0n || curve.collected!==0n || curve.inventory!==launchInventoryAmount) {
      throw new Error("Curve initialization verification failed.");
    }
    if(protection && (!curve.protection || curve.protection.delaySlots!==protection.delaySlots ||
        curve.protection.durationSlots!==protection.durationSlots || curve.protection.limitBps!==protection.limitBps ||
        curve.protection.limitBaseUnits!==totalAmount*BigInt(protection.limitBps)/10000n)) {
      throw new Error("Protected opening initialization verification failed.");
    }
    const mintAccount = await client.token.accounts.mint.fetch(mint.address);
    const mintAuthorityRevoked = isNone(mintAccount.data.mintAuthority);
    const freezeAuthorityRevoked = isNone(mintAccount.data.freezeAuthority);
    if (mintAuthorityRevoked !== revokeMint || freezeAuthorityRevoked !== revokeFreeze ||
        mintAccount.data.decimals !== decimals || !mintAccount.data.isInitialized) {
      throw new Error("Mint configuration or authority verification failed.");
    }
    const verifiedMintSupply = BigInt(String(mintAccount.data.supply));
    if (verifiedMintSupply !== totalAmount) {
      throw new Error(
        `Mint supply verification failed. Expected ${totalAmount}, received ${verifiedMintSupply}.`,
      );
    }

    const verifiedCreatorAmount = creatorTokenAccount
      ? await getTokenAccountAmount(creatorTokenAccount)
      : 0n;
    const verifiedLaunchAmount = await getTokenAccountAmount(String(launchVaultTokenAccount));

    if (verifiedCreatorAmount !== creatorAmount) {
      throw new Error(
        `Creator allocation verification failed. Expected ${creatorAmount}, received ${verifiedCreatorAmount}.`,
      );
    }

    if (verifiedLaunchAmount !== launchInventoryAmount) {
      throw new Error(
        `Launch inventory verification failed. Expected ${launchInventoryAmount}, received ${verifiedLaunchAmount}.`,
      );
    }

    if (verifiedCreatorAmount + verifiedLaunchAmount !== totalAmount) {
      throw new Error("Allocation conservation check failed: creator + launch inventory != total supply.");
    }

    return NextResponse.json({
      ok: true,
      cluster: "local-validator",
      mintAddress: String(mint.address),
      payerAddress: String(client.payer.address),
      creatorAddress: String(creator.address),
      creatorTokenAccount,
      launchVaultAddress: String(custodyAddress),
      launchVaultTokenAccount: String(launchVaultTokenAccount),
      createSignature: String(createResult.context.signature),
      creatorMintSignature,
      launchMintSignature: String(launchMintResult.context.signature),
      authoritySignature,
      supplyBaseUnits: totalAmount.toString(),
      creatorAllocationBps: Number(creatorAllocationBps),
      creatorAllocationBaseUnits: verifiedCreatorAmount.toString(),
      launchInventoryBaseUnits: verifiedLaunchAmount.toString(),
      decimals,
      mintAuthorityRevoked,
      freezeAuthorityRevoked,
      allocationVerified: true,
      custodyVerified: true,
      protectedOpening: curve.protection ? Object.fromEntries(Object.entries(curve.protection).map(([k,v])=>[k,v.toString()])) : null,
      curveAddress,
      curveBasePriceLamports:basePrice.toString(),
      curveSlopeLamports:curveSlope.toString(),
      openingAddress,
      openingCapBps,
      openingEnabled: openingState.data[96] === 1,
      openingStartSlot: openingView.getBigUint64(80, true).toString(),
      openingEndSlot: openingView.getBigUint64(88, true).toString(),
      openingCapBaseUnits: (totalAmount * BigInt(openingCapBps) / 10000n).toString(),
      custodyProgramAddress: CUSTODY_PROGRAM_ADDRESS,
      custodyBump,
      custodySignature: String(custodyResult.context.signature),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: `Local launch stopped during ${phase}: ${describeError(error)}${createdMint ? ` Mint ${createdMint} may exist with partial state; inspect it before retrying.` : ""}`,
        phase,
        mintAddress: createdMint,
      },
      { status: 500 },
    );
  }
}
