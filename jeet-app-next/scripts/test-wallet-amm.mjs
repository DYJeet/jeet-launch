import assert from "node:assert/strict";
import { test } from "node:test";
import { address, createNoopSigner } from "@solana/kit";
import { cpmmQuote, decodeCpmmConfig, inspectTransaction } from "../src/lib/wallet-amm.ts";

test("pinned CPMM exact-input math rounds fee up and output down in raw units",()=>{
  assert.deepEqual(cpmmQuote(1000n,50000n,396n,2500n,50n),{
    input:1000n,output:7n,fee:3n,minimum:7n,rate:2500n,
  });
  assert.deepEqual(cpmmQuote(10n,389n,51000n,2500n,50n),{
    input:10n,output:1153n,fee:1n,minimum:1148n,rate:2500n,
  });
});

test("AMM quote rejects dust, exhausted reserves, excessive slippage, and u64 overflow",()=>{
  assert.throws(()=>cpmmQuote(1n,10n,10n,2500n,50n),/small/);
  assert.throws(()=>cpmmQuote(2n,100000n,1n,2500n,50n),/small/);
  assert.throws(()=>cpmmQuote(5n,0n,10n,2500n,50n),/Invalid/);
  assert.throws(()=>cpmmQuote(100n,10n,10n,2500n,1001n),/slippage/);
  assert.throws(()=>cpmmQuote(1n<<64n,10n,10n,2500n,50n),/u64/);
});

test("config parser rejects substituted layouts and unpayable fee shares",()=>{
  const b=new Uint8Array(236), v=new DataView(b.buffer);
  b.set([218,244,33,104,203,203,43,111]);
  for(const [at,value] of [[12,2500n],[20,300000n],[28,40000n],[36,150000000n]])v.setBigUint64(at,value,true);
  assert.deepEqual(decodeCpmmConfig(b),{trade:2500n,protocol:300000n,fund:40000n,setupFee:150000000n,disabled:false});
  v.setBigUint64(28,700001n,true);
  assert.throws(()=>decodeCpmmConfig(b),/fee/);
  b[0]=0;
  assert.throws(()=>decodeCpmmConfig(b),/Unsupported/);
});

test("oversized reviewed transaction is rejected before any simulation or signature",async()=>{
  const payer=createNoopSigner(address("So11111111111111111111111111111111111111112"));
  const blockhash="11111111111111111111111111111111";
  const executor={rpc:{getLatestBlockhash:()=>({send:async()=>({value:{blockhash,lastValidBlockHeight:1n}})}),
    simulateTransaction:()=>assert.fail("Oversized transaction reached simulation")}};
  await assert.rejects(inspectTransaction(executor,[{programAddress:address(blockhash),accounts:[],data:new Uint8Array(1250)}],payer),/1232-byte/);
});
