import { createClient, generateKeyPairSigner, isNone, lamports } from "@solana/kit";
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
    const launchVault = await generateKeyPairSigner();

    const createResult = await client.token.instructions
      .createMint({
        newMint: mint,
        decimals,
        mintAuthority: client.payer.address,
        freezeAuthority: client.payer.address,
      })
      .sendTransaction();

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
        owner: launchVault.address,
        mintAuthority: client.payer,
        amount: launchInventoryAmount,
        decimals,
      })
      .sendTransaction();

    const [launchVaultTokenAccount] = await findAssociatedTokenPda({
      mint: mint.address,
      owner: launchVault.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

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
      launchVaultAddress: String(launchVault.address),
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: describeError(error),
      },
      { status: 500 },
    );
  }
}
