import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { CPMM, WSOL, TOKEN, FEE, SYSTEM } from "./cpmm.mjs";
import { cpmmQuote } from "../../src/lib/wallet-amm.ts";
import { decodeGraduation, graduationAddresses } from "../../src/lib/launch-graduation.ts";
import { decodeV5PreviewState } from "../../src/lib/launch-v5-preview.ts";
import { formatUnits } from "../../src/lib/wallet-environment.ts";

export async function graduationGenesis(dir) {
  const [configKey,bump]=await getProgramDerivedAddress({programAddress:CPMM,seeds:["amm_config",new Uint8Array(2)]});
  const bytes=getAddressEncoder();
  const config=Buffer.alloc(236), fee=Buffer.alloc(165), native=Buffer.alloc(82);
  config.set([218,244,33,104,203,203,43,111,bump]);
  for(const [offset,value] of [[12,2500n],[20,300000n],[28,40000n],[36,150000000n],[108,2500n]])config.writeBigUInt64LE(value,offset);
  config.set(bytes.encode(SYSTEM),44);config.set(bytes.encode(SYSTEM),76);
  fee.set(bytes.encode(WSOL),0);fee.set(bytes.encode(SYSTEM),32);
  fee[108]=1;fee.writeUInt32LE(1,109);fee.writeBigUInt64LE(10000000n,113);
  native[44]=9;native[45]=1;
  const args=["--bpf-program",CPMM,"programs/launch-custody/target/amm-research/devnet-v0/raydium_cp_swap.so"];
  for(const [i,[pubkey,owner,data]] of [[configKey,CPMM,config],[FEE,TOKEN,fee],[WSOL,TOKEN,native]].entries()) {
    const file=`${dir}/cpmm-browser-genesis-${i}.json`;
    await writeFile(file,JSON.stringify({pubkey,account:{lamports:10000000,data:[data.toString("base64"),"base64"],owner,executable:false,rentEpoch:0}}));
    args.push("--account",pubkey,file);
  }
  return args;
}

export async function runBrowserGraduation({ page,width,mint,l,wallet,wires,rpc,evidence,pass,rejectNext,allowSigning }) {
  const curve=page.getByTestId("curve-trade"), panel=page.getByTestId("graduation-panel");
  const raw=async key=>(await rpc("getAccountInfo",[key,{encoding:"base64",commitment:"confirmed"}])).value;
  const data=account=>Buffer.from(account.data[0],"base64");
  const token=async key=>data(await raw(key)).readBigUInt64LE(64);
  const sol=async key=>BigInt((await rpc("getBalance",[key,{commitment:"confirmed"}])).value);
  const state=async()=>decodeV5PreviewState(data(await raw(l.curve)));
  const feeState=async()=>Promise.all([raw(l.platformVault),raw(l.creatorVault)]);
  const sig=()=>wires.at(-1).signature;
  const tx=async signature=>{
    const result=await rpc("getTransaction",[signature,{encoding:"json",commitment:"confirmed",maxSupportedTransactionVersion:0}]);
    assert.equal(result.meta.err,null);return result;
  };
  const refreshed=async()=>{
    await expect(panel.getByTestId("external-transaction-receipt")).toContainText("Confirmed and refreshed",{timeout:45000});
    return sig();
  };
  await expect(panel.getByRole("button",{name:"Review graduation",exact:true})).toHaveCount(0);
  pass(`${width}px graduation stays unavailable before eligibility`,true);
  await curve.getByRole("button",{name:"Buy",exact:true}).click();
  await curve.getByLabel("SOL trade budget").fill("0.0001");
  await curve.getByRole("button",{name:"Review buy",exact:true}).click();
  await curve.getByRole("button",{name:"Sign and buy",exact:true}).click();
  await expect(panel.getByTestId("graduation-state")).toContainText("Graduation eligible · pool has not been created",{timeout:45000});
  const full=await state(), a=await graduationAddresses(mint,0n);
  const fees=await feeState(), beforeWallet=await sol(wallet.address), beforeFee=await sol(FEE);
  assert.equal(full.sold,full.inventory);assert.equal(full.migrated,false);assert.equal(await raw(a.pool),null);
  await panel.getByRole("button",{name:"Review graduation",exact:true}).click();
  const review=panel.getByTestId("external-transaction-preview");
  await expect(review).toContainText(`Pool deposit: ${formatUnits(full.reserve)} SOL and ${full.migrationInventory} migration tokens`);
  await expect(review).toContainText("Raydium setup fee: 0.15 SOL");
  const approve=panel.getByRole("button",{name:"Approve setup funding and sign graduation",exact:true});
  rejectNext();await approve.click();
  await expect(panel.getByRole("alert")).toContainText("User rejected",{timeout:25000});
  assert.deepEqual(await state(),full);assert.equal(await raw(a.pool),null);
  assert.deepEqual(await feeState(),fees);assert.equal(await sol(wallet.address),beforeWallet);
  pass(`${width}px rejected graduation leaves funding, fee custody and liquidity unchanged`,true);
  allowSigning();
  await panel.getByRole("button",{name:"Review graduation",exact:true}).click();
  await approve.click();
  const migration=await refreshed(), confirmed=await tx(migration);
  const terms=decodeGraduation(data(await raw(a.terms))), curveAfter=await state();
  const tokenVault=a.mint0===mint?a.vault0:a.vault1, solVault=a.mint0===WSOL?a.vault0:a.vault1;
  const initialTokens=await token(tokenVault), initialSol=await token(solVault);
  const setupSpent=beforeWallet-await sol(wallet.address)-BigInt(confirmed.meta.fee);
  const walletRent=async size=>BigInt(await rpc("getMinimumBalanceForRentExemption",[size]));
  const expectedSetup=150000000n+await walletRent(637)+await walletRent(4075)+await walletRent(82)+2n*await walletRent(165);
  assert.equal(setupSpent,expectedSetup);
  assert.equal(terms.pool,a.pool);assert.equal(terms.ammProgram,CPMM);assert.equal(terms.migratedSlot,BigInt(confirmed.slot));
  assert.equal(terms.solDeposited,full.reserve);assert.equal(terms.tokensDeposited,full.migrationInventory);
  assert.equal(curveAfter.reserve,0n);assert.equal(curveAfter.migrationSol,full.reserve);
  assert.equal(initialTokens,terms.tokensDeposited);assert.equal(initialSol,terms.solDeposited);
  const lp=data(await raw(a.lpMint));assert.equal(lp.readBigUInt64LE(36),0n);
  assert.equal(await raw(a.migratorLp),null);assert.equal(await raw(a.migratorSol),null);assert.equal(await raw(a.migratorToken),null);
  assert.equal(await token(l.migrationVault),0n);assert.equal(await token(l.vault),0n);
  assert.equal(await token(l.creatorAta)+initialTokens,1000n);
  assert.deepEqual(await feeState(),fees);assert.equal(await sol(FEE)-beforeFee,150000000n);
  await expect(curve).toHaveCount(0);await expect(panel.getByTestId("graduation-state")).toContainText("Migrated · curve trading closed");
  await expect(panel.getByTestId("amm-pool-proof")).toContainText(`Initial LP units burned: ${terms.lpBurned}`);
  await expect(panel.getByRole("button",{name:"Review graduation",exact:true})).toHaveCount(0);
  evidence.transactions.push({width,kind:"graduation",signature:migration,mint,pool:a.pool,program:CPMM,terms,setupSpent,
    computeUnits:confirmed.meta.computeUnitsConsumed,bytes:wires.at(-1).bytes,initialLpSupply:lp.readBigUInt64LE(36)});
  pass(`${width}px browser graduation confirms deposits, LP burn, fee isolation and curve closure`);
  console.log("Browser migration",width,migration,a.pool);
  for(const sell of [false,true]) {
    const side=sell?"sell":"buy", input=sell?10n:1000n;
    const before={sol:await sol(wallet.address),tokens:await token(l.creatorAta),poolSol:await token(solVault),poolTokens:await token(tokenVault)};
    const quote=cpmmQuote(input,sell?before.poolTokens:before.poolSol,sell?before.poolSol:before.poolTokens,2500n,50n);
    await panel.getByRole("button",{name:sell?"Sell":"Buy",exact:true}).click();
    await panel.getByLabel(sell?"Tokens to swap":"SOL to swap",{exact:true}).fill(sell?"10":"0.000001");
    const reviewButton=panel.getByRole("button",{name:`Review AMM ${side}`,exact:true});
    await expect(reviewButton).toBeEnabled({timeout:20000});
    await reviewButton.click();
    await expect(review).toContainText(`Minimum received: ${sell?formatUnits(quote.minimum)+" SOL":quote.minimum+" tokens"}`);
    const sign=panel.getByRole("button",{name:`Sign AMM ${side}`,exact:true});
    if(!sell) {
      rejectNext();await sign.click();
      await expect(panel.getByRole("alert")).toContainText("User rejected",{timeout:25000});
      assert.equal(await sol(wallet.address),before.sol);assert.equal(await token(l.creatorAta),before.tokens);
      assert.equal(await token(solVault),before.poolSol);assert.equal(await token(tokenVault),before.poolTokens);
      pass(`${width}px rejected AMM signature leaves wallet and reserves unchanged`,true);
      allowSigning();await reviewButton.click();
    }
    await sign.click();
    const signature=await refreshed(), result=await tx(signature);
    const after={sol:await sol(wallet.address),tokens:await token(l.creatorAta),poolSol:await token(solVault),poolTokens:await token(tokenVault)};
    assert.equal(after.sol-before.sol,(sell?quote.output:-input)-BigInt(result.meta.fee));
    assert.equal(after.poolSol-before.poolSol,sell?-quote.output:input);
    assert.equal(after.tokens-before.tokens,sell?-input:quote.output);
    assert.equal(after.poolTokens-before.poolTokens,sell?input:-quote.output);
    assert.equal(after.tokens+after.poolTokens,1000n);assert.deepEqual(await feeState(),fees);
    evidence.transactions.push({width,kind:`amm-${side}`,signature,mint,pool:a.pool,before,after,quote,networkFee:result.meta.fee});
    pass(`${width}px signed Raydium ${side} exactly reconciles wallet and pool reserves`);
    console.log("Browser AMM swap",width,side,signature);
  }
  await page.reload();await expect(panel.getByTestId("graduation-state")).toContainText("Migrated · curve trading closed",{timeout:15000});
  await expect(panel.getByTestId("amm-pool-proof")).toContainText(`Confirmed migration signature: ${migration}`,{timeout:15000});
  const connect=panel.getByRole("button",{name:"Connect JeeT genuine local signer",exact:true});
  const balance=panel.getByTestId("amm-wallet-balance");
  await expect(connect.or(balance)).toBeVisible({timeout:15000});
  if(!await connect.isVisible())await panel.getByRole("button",{name:"Disconnect AMM wallet"}).click();
  await connect.click();
  await expect(balance).toContainText(`${formatUnits(await sol(wallet.address))} SOL and ${await token(l.creatorAta)} tokens`);
  await expect(curve).toHaveCount(0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  pass(`${width}px migrated route and balances survive reload and wallet reconnection`);
}
