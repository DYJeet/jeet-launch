import { createClient, generateKeyPairSigner, lamports } from "@solana/kit";
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

type CreateRequest = {
  totalSupply?: string;
  decimals?: number;
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
    const body = (await request.json()) as CreateRequest;
    const totalSupply = body.totalSupply?.trim() ?? "";
    const decimals = body.decimals ?? 9;
    const revokeMint = body.revokeMint ?? true;
    const revokeFreeze = body.revokeFreeze ?? true;
    const amount = parseBaseUnits(totalSupply, decimals);

    const client = await createClient()
      .use(generatedPayer())
      .use(
        solanaRpc({
          rpcUrl: LOCAL_RPC_URL,
          rpcSubscriptionsUrl: LOCAL_WS_URL,
        }),
      )
      .use(rpcAirdrop())
      .use(airdropPayer(lamports(2_000_000_000n)))
      .use(tokenProgram())
      .use(associatedTokenProgram());

    const mint = await generateKeyPairSigner();

    const createResult = await client.token.instructions
      .createMint({
        newMint: mint,
        decimals,
        mintAuthority: client.payer.address,
        freezeAuthority: client.payer.address,
      })
      .sendTransaction();

    const mintResult = await client.token.instructions
      .mintToATA({
        mint: mint.address,
        owner: client.payer.address,
        mintAuthority: client.payer,
        amount,
        decimals,
      })
      .sendTransaction();

    const [tokenAccount] = await findAssociatedTokenPda({
      mint: mint.address,
      owner: client.payer.address,
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

    // A successful fetch proves the mint exists on the local validator after confirmation.
    await client.token.accounts.mint.fetch(mint.address);

    return NextResponse.json({
      ok: true,
      cluster: "local-validator",
      mintAddress: String(mint.address),
      tokenAccount: String(tokenAccount),
      payerAddress: String(client.payer.address),
      createSignature: String(createResult.context.signature),
      mintSignature: String(mintResult.context.signature),
      authoritySignature,
      supplyBaseUnits: amount.toString(),
      decimals,
      mintAuthorityRevoked: revokeMint,
      freezeAuthorityRevoked: revokeFreeze,
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
