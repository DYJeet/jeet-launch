// Real Wallet Standard adapter using genuine disposable Ed25519 signatures and local RPC.
// Fault injection tests are labelled; successful execution and balances are never fabricated.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pinataCredentialAvailable } from "../src/lib/pinata-metadata-storage.ts";
import { decodeLaunchMetadata, findMetadataPda, METADATA_PROGRAM } from "../src/lib/launch-metadata.ts";
import { decodeGraduation } from "../src/lib/launch-graduation.ts";
import { decodeV5PreviewState } from "../src/lib/launch-v5-preview.ts";
import { v5Budget, v5Quote } from "../src/lib/v5-pricing.ts";
import { formatUnits } from "../src/lib/wallet-environment.ts";
import { decodeFeeState } from "../src/lib/launch-fees.ts";
import { getAddressDecoder, getBase58Encoder } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { chromium, expect } from "@playwright/test";
import {
  generateKeyPairSigner,
  getAddressEncoder,
  getTransactionDecoder,
  partiallySignTransaction,
  getTransactionEncoder,
  getSignatureFromTransaction,
} from "@solana/kit";
import { address } from "@solana/kit";
import { walletLaunchAddresses } from "../src/lib/wallet-launch.ts";
import { parseMintBytes } from "../src/lib/solana-rpc.ts";
import { LOCAL_WALLET_PROGRAM } from "../src/lib/wallet-environment.ts";
const trading = process.env.JEET_BROWSER_TRADE === "1";
const livePinata = process.env.JEET_CREATION_STORAGE === "pinata";
if (livePinata && !pinataCredentialAvailable(process.env.PINATA_JWT))
  throw Error("Live creation requires an environment-provided PINATA_JWT in this runtime.");
const dir = await mkdtemp("/tmp/jeet-wallet-browser-"),
  children = [],
  evidence = {
    storage: livePinata ? "live-pinata" : "local-workspace",
    positive: [],
    rejection: [],
    transactions: [],
    limitations: [
      "Disposable Wallet Standard adapter, not installed Phantom/Solflare or native mobile application acceptance.",
      "Current provider records/retrieval do not guarantee indefinite pinning. No Devnet or production transaction is claimed.",
      "Negative HTTP/genesis/gateway probes inject failures explicitly; successful provider responses and Solana execution are genuine.",
    ],
  };
const rpcUrl = "http://127.0.0.1:9907",
  appUrl = "http://127.0.0.1:3006";
async function start(command, args, name, env = {}) {
  const log = await open(dir + "/" + name + ".log", "w"),
    p = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", log.fd, log.fd],
    });
  await log.close();
  children.push(p);
  return p;
}
async function rpc(method, params = []) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const b = await r.json();
  if (b.error) throw Error(JSON.stringify(b.error));
  return b.result;
}
async function ready(fn) {
  for (let i = 0; i < 120; i++) {
    if (children.some((p) => p.exitCode !== null))
      throw Error("Child exited: " + dir);
    try {
      if (await fn()) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("Startup/confirmation timeout: " + dir);
}
const pass = (label, rejection = false) => {
  evidence[rejection ? "rejection" : "positive"].push(label);
  console.log("PASS wallet browser: " + label);
};
let browser, deadline;
try {
  deadline = setTimeout(() => {
    console.error("Wallet browser suite timed out");
    for (const p of children) p.kill("SIGTERM");
  }, 600000);
  await start(
    process.env.JEET_VALIDATOR_BIN ??
      "programs/launch-custody/target/toolchain/validator",
    [
      "--log",
      "--bind-address",
      "127.0.0.1",
      "--rpc-port",
      "9907",
      "--faucet-port",
      "9909",
      "--dynamic-port-range",
      "13500-13600",
      "--ledger",
      dir + "/ledger",
      "--bpf-program",
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
      "programs/launch-custody/target/metadata-research/mpl_token_metadata.so",
      "--bpf-program",
      LOCAL_WALLET_PROGRAM,
      "programs/launch-custody/target/local-fee-test/jeet_launch_custody.so",
    ],
    "validator",
  );
  await ready(async () => (await rpc("getHealth")) === "ok");
  const genesis = await rpc("getGenesisHash");
  await start(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3006",
    ],
    "app",
    {
      JEET_LOCAL_WALLET: "1",
      JEET_METADATA_STORAGE: livePinata ? "pinata" : "local-workspace",
      JEET_LOCAL_WALLET_RPC: rpcUrl,
      JEET_LOCAL_WALLET_GENESIS: genesis,
    },
  );
  await ready(async () => (await fetch(appUrl + "/api/wallet/environment")).ok);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.JEET_CHROMIUM_PATH,
    args: ["--no-sandbox"],
  });
  for (const width of [390, 1440]) {
    const wallet = await generateKeyPairSigner();
    await rpc("requestAirdrop", [wallet.address, 1000000000]);
    await ready(
      async () =>
        (await rpc("getBalance", [wallet.address, { commitment: "finalized" }]))
          .value === 1000000000,
    );
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("response", async (r) => {
      if (r.url().includes("/api/wallet/")) {
        const t = await r.text();
        if (r.status() >= 400 || t.includes('\"error\"'))
          console.log(
            "RPC DIAGNOSTIC",
            r.status(),
            r.request().postDataJSON()?.method,
            r.request().postDataJSON()?.method === "getSignatureStatuses"
              ? r.request().postDataJSON().params
              : r.request().postDataJSON()?.params?.[1],
            t,
          );
      }
    });
    const uploads = [];
    page.on("response", async response => {
      if (response.url() === appUrl + "/api/local-assets" && response.ok()) uploads.push(await response.json());
    });
    let release;
    let rejectAt = 0, reject = false,
      signCount = 0,
      hold = false;
    const wires = [];
    await page.exposeFunction("jeetSignLocal", async (bytes) => {
      signCount++;
      if (hold) await new Promise(resolve => { release = resolve; });
      if (reject || signCount === rejectAt) throw Error("User rejected request");
      const tx = getTransactionDecoder().decode(Uint8Array.from(bytes)),
        signed = await partiallySignTransaction([wallet.keyPair], tx);
      wires.push({
        signature: getSignatureFromTransaction(signed),
        bytes: getTransactionEncoder().encode(signed).length,
      });
      return Array.from(getTransactionEncoder().encode(signed));
    });
    await page.addInitScript(
      ({ address, publicKey }) => {
        let connected = false;
        const listeners = new Set();
        const account = {
          address,
          publicKey: Uint8Array.from(publicKey),
          chains: ["solana:devnet"],
          features: ["solana:signTransaction"],
        };
        const notify = () =>
          listeners.forEach((fn) =>
            fn({ accounts: connected ? [account] : [] }),
          );
        const wallet = {
          version: "1.0.0",
          name: "JeeT genuine local signer",
          icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
          chains: ["solana:devnet"],
          get accounts() {
            return connected ? [account] : [];
          },
          features: {
            "standard:connect": {
              version: "1.0.0",
              connect: async () => {
                connected = true;
                notify();
                return { accounts: [account] };
              },
            },
            "standard:disconnect": {
              version: "1.0.0",
              disconnect: async () => {
                connected = false;
                notify();
              },
            },
            "standard:events": {
              version: "1.0.0",
              on: (_, fn) => {
                listeners.add(fn);
                return () => listeners.delete(fn);
              },
            },
            "solana:signTransaction": {
              version: "1.0.0",
              supportedTransactionVersions: ["legacy", 0],
              signTransaction: async (...inputs) =>
                Promise.all(
                  inputs.map(async (i) => ({
                    signedTransaction: Uint8Array.from(
                      await window.jeetSignLocal(Array.from(i.transaction)),
                    ),
                  })),
                ),
            },
          },
        };
        const register = (api) => api.register(wallet);
        window.addEventListener("wallet-standard:app-ready", (e) =>
          register(e.detail),
        );
        window.dispatchEvent(
          new CustomEvent("wallet-standard:register-wallet", {
            detail: register,
          }),
        );
      },
      {
        address: wallet.address,
        publicKey: Array.from(getAddressEncoder().encode(wallet.address)),
      },
    );
    await page.goto(appUrl + "/local-create");
    await page.getByRole("button", { name: "Connect JeeT genuine local signer" }).click();
    await page.getByLabel("Token name", {exact:true}).fill("JeeT Browser " + width);
    await page.getByLabel("Ticker", {exact:true}).fill("JB" + width);
    await page.getByLabel("Description", {exact:true}).fill("Genuine local wallet creation test");
    await page.getByLabel("Total supply", {exact:true}).fill("1000");
    await page.getByLabel("Decimals (0–9)", {exact:true}).fill("0");
    await page.getByLabel("Launch delay (slots)", {exact:true}).fill("0");
    await page.getByLabel("Protected duration (slots)", {exact:true}).fill("1");
    await page.getByText("Enable cumulative opening wallet cap").uncheck();
    await page.getByLabel("Token image", {exact:true}).setInputFiles({name:"forged.png",mimeType:"image/png",buffer:Buffer.from("<svg></svg>")});
    await page.getByText("I reviewed the allocations", {exact:false}).check();
    await page.getByRole("button", {name:"Sign and create coin"}).click();
    await expect(page.getByTestId("creation-error")).toContainText("match",{timeout:10000});
    assert.equal(signCount,0);
    pass(width + "px forged image rejected before signing",true);
    await page.getByLabel("Token image", {exact:true}).setInputFiles("public/jeet-promo.png");
    await page.getByText("I reviewed the allocations", {exact:false}).check();
    if(width === 390){
      await page.route("**/api/wallet/rpc",async route=>{
        const body=route.request().postDataJSON();
        if(body.method==="getGenesisHash") await route.fulfill({json:{jsonrpc:"2.0",id:body.id,result:wallet.address}});
        else await route.continue();
      });
      await page.getByRole("button",{name:"Sign and create coin"}).click();
      await expect(page.getByTestId("creation-error")).toContainText("RPC network changed");
      assert.equal(signCount,0);assert.equal(uploads.length,0);
      await page.unroute("**/api/wallet/rpc");
      pass("injected genesis mismatch blocks storage and signing before minting",true);
      for(const failure of ["image upload failure","JSON upload failure"]){
        await page.route("**/api/local-assets",route=>route.fulfill({status:503,json:{error:"Injected "+failure}}));
        await page.getByRole("button",{name:"Sign and create coin"}).click();
        await expect(page.getByTestId("creation-error")).toContainText("Injected "+failure);
        assert.equal(signCount,0);assert.equal(await page.getByTestId("created-mint").count(),0);
        assert.equal((await rpc("getBalance",[wallet.address,{commitment:"confirmed"}])).value,1000000000);
        await page.unroute("**/api/local-assets");
        pass("injected server "+failure+" cannot prepare a mint or debit SOL",true);
      }
    }
    reject = true; hold = true;
    await page.getByRole("button", {name:"Sign and create coin"}).click();
    try {
      await expect.poll(() => signCount, {timeout:120000}).toBe(1);
    } catch (error) {
      const message = page.getByTestId("creation-error");
      if (await message.isVisible()) console.log("Creation before signing:", await message.innerText());
      throw error;
    }
    assert.equal(await page.getByRole("button", {name:"Working…", exact:true}).first().isDisabled(), true);
    assert.equal(await page.evaluate(key => navigator.locks.request(key,{ifAvailable:true},lock=>!!lock), "jeet-create:"+genesis+":"+wallet.address), false);
    release(); hold = false;
    await expect(page.getByTestId("creation-error")).toContainText("User rejected", {timeout:30000});
    const rejectedMint = (await page.getByTestId("created-mint").innerText()).trim();
    assert.equal((await rpc("getAccountInfo",[rejectedMint,{encoding:"base64",commitment:"confirmed"}])).value,null);
    assert.equal((await rpc("getBalance",[wallet.address,{commitment:"confirmed"}])).value,1000000000);
    pass(width+"px duplicate/conflicting attempt blocked; rejected first signature creates no mint or debit",true);
    reject = false;
    rejectAt = 3;
    await page.getByRole("button", {name:"Resume saved launch"}).click();
    await expect(page.getByTestId("creation-error")).toContainText("User rejected", {timeout:60000});
    const mint = (await page.getByTestId("created-mint").innerText()).trim();
    const account = (await rpc("getAccountInfo", [mint, {encoding:"base64",commitment:"confirmed"}])).value;
    const partial = parseMintBytes(Buffer.from(account.data[0],"base64"), address(mint), account.owner);
    assert.equal(partial.supplyRaw, 0n);
    assert.equal(partial.mintAuthority,wallet.address);assert.equal(partial.freezeAuthority,wallet.address);
    assert.equal((await rpc("getAccountInfo",[(await walletLaunchAddresses(address(mint),wallet.address)).terms,{encoding:"base64",commitment:"confirmed"}])).value,null);
    pass(width + "px rejected setup leaves minted supply at zero", true);
    rejectAt = 0;
    await page.reload();
    await page.getByRole("button", {name:"Resume saved launch"}).click();
    try {
      await expect(async () => {
        const error = page.getByTestId("creation-error");
        if (await error.isVisible()) throw Error(await error.innerText());
        await expect(page.getByTestId("launch-stage")).toHaveText("confirmed", {timeout:1000});
      }).toPass({timeout:90000});
    } catch(e) { console.log("CREATION DIAGNOSTIC",await page.locator("main").innerText()); throw e; }
    const l = await walletLaunchAddresses(address(mint), wallet.address);
    const accounts = (await rpc("getMultipleAccounts", [[mint,l.creatorAta,l.vault,l.migrationVault],{encoding:"base64",commitment:"confirmed"}])).value;
    const parsed = parseMintBytes(Buffer.from(accounts[0].data[0],"base64"), address(mint), accounts[0].owner);
    assert.equal(parsed.supplyRaw,1000n); assert.equal(parsed.mintAuthority,null); assert.equal(parsed.freezeAuthority,null);
    const allAddresses = [mint,l.creatorAta,l.vault,l.migrationVault,l.custody,l.opening,l.curve,l.platformVault,l.creatorVault,l.terms];
    allAddresses.push((await findMetadataPda(address(mint)))[0]);
    const allAccounts = (await rpc("getMultipleAccounts",[allAddresses,{encoding:"base64",commitment:"confirmed"}])).value;
    assert.equal(uploads.length,1,"signing retries must reuse the uploaded document");
    const upload = uploads[0];
    assert.equal(upload.storage,livePinata?"pinata":"local-workspace");
    if(livePinata){
      assert.ok(upload.uri.startsWith("ipfs://"));assert.ok(upload.imageUri.startsWith("ipfs://"));
      for(const record of Object.values(upload.storageEvidence)) assert.equal(record.accountStatus,"public-file-record-confirmed");
      assert.equal(upload.storageEvidence.image.sha256,createHash("sha256").update(await readFile("public/jeet-promo.png")).digest("hex"));
    }
    const md = decodeLaunchMetadata(Buffer.from(allAccounts[10].data[0],"base64"));
    assert.equal(allAccounts[10].owner,METADATA_PROGRAM);
    assert.equal(md.mint,mint);assert.equal(md.name,"JeeT Browser "+width);assert.equal(md.symbol,"JB"+width);
    assert.equal(md.uri,upload.uri);assert.equal(md.mutable,false);assert.equal(md.updateAuthority,wallet.address);
    const curve = decodeV5PreviewState(Buffer.from(allAccounts[6].data[0],"base64"));
    assert.equal(curve.sold,0n);assert.equal(curve.reserve,0n);assert.equal(curve.inventory,594n);assert.equal(curve.migrationInventory,396n);
    const terms = decodeGraduation(Buffer.from(allAccounts[9].data[0],"base64"));
    assert.equal(terms.mint,mint);assert.equal(terms.curve,l.curve);assert.equal(terms.maxPriceGapBps,60);assert.equal(terms.migrated,false);
    assert.equal(terms.pool,"11111111111111111111111111111111");
    const custodyBytes=Buffer.from(allAccounts[4].data[0],"base64");
    assert.equal(custodyBytes.readBigUInt64LE(72),10n);assert.equal(custodyBytes.readBigUInt64LE(80),990n);
    for(const index of [4,5,6,7,8,9])assert.equal(allAccounts[index].owner,LOCAL_WALLET_PROGRAM);
    for(const [index,owner] of [[1,wallet.address],[2,l.custody],[3,l.curve]]){
      const data=Buffer.from(allAccounts[index].data[0],"base64");assert.equal(allAccounts[index].owner,TOKEN_PROGRAM_ADDRESS);
      assert.equal(getAddressDecoder().decode(data.subarray(0,32)),mint);assert.equal(getAddressDecoder().decode(data.subarray(32,64)),owner);
    }
    for(const index of [7,8]){const fees=decodeFeeState(Buffer.from(allAccounts[index].data[0],"base64"));assert.equal(fees.accrued,0n);assert.equal(fees.withdrawn,0n);}
    evidence.transactions.push({width,mint,creator:wallet.address,metadata:md,terms,storage:upload.storage,storageEvidence:upload.storageEvidence,description:upload.document.description,curve:{sold:"0",reserve:"0"}});
    let networkFees = 0n;
    for(const wire of wires) {
      const tx = await rpc("getTransaction",[wire.signature,{encoding:"json",commitment:"confirmed",maxSupportedTransactionVersion:0}]);
      assert.equal(tx.meta.err,null); networkFees += BigInt(tx.meta.fee);
      assert.ok(wire.bytes<=1232);
      if(wire === wires.at(-1)){
        const keys=tx.transaction.message.accountKeys;
        const instructions=tx.transaction.message.instructions;
        const operations=instructions.map(ix=>({program:keys[ix.programIdIndex],opcode:getBase58Encoder().encode(ix.data)[0]}));
        assert.equal(operations.filter(ix=>ix.program===TOKEN_PROGRAM_ADDRESS && ix.opcode===6).length,2);
        assert.equal(operations.filter(ix=>ix.program===LOCAL_WALLET_PROGRAM && ix.opcode===21).length,1);
      }
    }
    const funding = allAccounts.reduce((sum,a)=>sum+BigInt(a.lamports),0n);
    const after = BigInt((await rpc("getBalance",[wallet.address,{commitment:"confirmed"}])).value);
    assert.equal(1000000000n-after,funding+networkFees);
    assert.equal(networkFees,30000n);
    evidence.transactions.push({width,sol:{before:"1000000000",after:after.toString(),accountFunding:funding.toString(),networkFees:networkFees.toString()}});
    const balances = accounts.slice(1).map(a => Buffer.from(a.data[0],"base64").readBigUInt64LE(64));
    assert.deepEqual(balances,[10n,594n,396n]);
    assert.equal(balances.reduce((a,b)=>a+b,0n),parsed.supplyRaw);
    evidence.transactions.push({width,mint,wires,tokenConservation:"10 + 594 + 396 = 1000"});
    pass(width + "px genuine five-stage wallet creation, metadata URI, authority/terms bundle and exact conservation");
    await page.getByRole("link", {name:"Open token details"}).click();
    await expect(page.getByTestId("launch-reader")).toContainText("JeeT Browser " + width,{timeout:15000});
    await expect(page.getByTestId("launch-reader")).toContainText("Revoked");
    await expect(page.getByTestId("launch-reader")).toContainText(upload.uri);
    await page.goto(appUrl+"/local-create");
    await page.getByRole("button",{name:"Disconnect wallet",exact:true}).click();
    await page.getByRole("button",{name:"Connect JeeT genuine local signer",exact:true}).click();
    await expect(page.getByTestId("created-mint")).toHaveText(mint);
    async function expectRenderedMetadata() {
      try {
        // The reader allows 15 seconds each for the JSON and image requests.
        await expect(page.getByText("Genuine local wallet creation test",{exact:true})).toBeVisible({timeout:35000});
        await expect(page.getByAltText("Creator-supplied token image")).toBeVisible();
      } catch (error) {
        const section = page.getByRole("heading", {name: "Off-chain metadata · creator supplied"}).locator("..");
        if (await section.isVisible()) console.log("Token-page metadata:", await section.innerText());
        throw error;
      }
    }
    await page.goto(appUrl+"/token/"+mint);
    await expectRenderedMetadata();
    await page.reload();
    await expect(page.getByTestId("launch-reader")).toContainText("JeeT Browser " + width,{timeout:15000});
    await expectRenderedMetadata();
    if(livePinata){
      await page.route("https://gateway.pinata.cloud/ipfs/**",route=>route.fulfill({status:503,headers:{"access-control-allow-origin":"*"},body:"Injected unavailable gateway"}));
      await page.reload();
      await expect(page.getByText(/Metadata asset is unavailable/)).toBeVisible({timeout:15000});
      assert.deepEqual((await rpc("getMultipleAccounts",[allAddresses,{encoding:"base64",commitment:"confirmed"}])).value,allAccounts);
      await page.unroute("https://gateway.pinata.cloud/ipfs/**");
      await page.reload();
      await expectRenderedMetadata();
      pass(width+"px injected gateway failure is explicit; on-chain state unchanged; real retrieval recovers",true);
    }
    const image=await page.getByAltText("Creator-supplied token image").evaluate(el=>({complete:el.complete,width:el.naturalWidth,height:el.naturalHeight}));
    assert.equal(image.complete,true);assert.ok(image.width>0 && image.height>0);
    assert.deepEqual((await rpc("getMultipleAccounts",[allAddresses,{encoding:"base64",commitment:"confirmed"}])).value,allAccounts);
    assert.equal(uploads.length,1);assert.equal(signCount,7);
    evidence.transactions.push({width,mint,browser:{walletReconnected:true,reloaded:true,image,successfulProviderResponsesMocked:false}});
    await page.screenshot({path:dir+`/creation-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    pass(width + "px token page reload and mobile layout");
    if (trading) {
      const panel = page.getByTestId("curve-trade");
      const connectTrader = panel.getByRole("button", {name:"Connect JeeT genuine local signer"});
      if (await connectTrader.isVisible()) await connectTrader.click();
      await expect(panel.getByTestId("trade-sol-balance")).toContainText("0.9648444 SOL", {timeout:15000});
      const readTrade = async () => {
        const a = (await rpc("getMultipleAccounts", [allAddresses, {encoding:"base64",commitment:"confirmed"}])).value;
        const get = i => Buffer.from(a[i].data[0],"base64");
        return {
          state: decodeV5PreviewState(get(6)),
          platform: decodeFeeState(get(7)).accrued,
          creator: decodeFeeState(get(8)).accrued,
          tokens: get(1).readBigUInt64LE(64),
          vault: get(2).readBigUInt64LE(64),
          migration: get(3).readBigUInt64LE(64),
          sol: BigInt((await rpc("getBalance",[wallet.address,{commitment:"confirmed"}])).value),
          reserveLamports: BigInt(a[6].lamports),
          platformLamports: BigInt(a[7].lamports),
          creatorLamports: BigInt(a[8].lamports),
        };
      };
      for (const sell of [false, true]) {
        const before = await readTrade();
        const side = sell ? "sell" : "buy";
        await panel.getByRole("button", {name:sell?"Sell":"Buy",exact:true}).click();
        await panel.getByLabel(sell?"Tokens to sell":"SOL trade budget").fill(sell?"11":"0.000001");
        const quote = sell
          ? v5Quote(before.state,before.state.sold,11n,before.platform,before.creator,true)
          : v5Budget(before.state,before.state.sold,1000n,before.platform,before.creator);
        await panel.getByRole("button", {name:"Review "+side,exact:true}).click();
        const preview = panel.getByTestId("trade-quote");
        await expect(preview).toContainText("Platform fee: "+formatUnits(quote.platform)+" SOL");
        await expect(preview).toContainText("Creator fee: "+formatUnits(quote.creator)+" SOL");
        await expect(preview).toContainText("Curve consideration: "+formatUnits(quote.raw)+" SOL");
        if (!sell) {
          rejectAt = signCount + 1;
          await panel.getByRole("button", {name:"Sign and buy",exact:true}).click();
          await expect(panel.getByRole("alert")).toContainText("User rejected", {timeout:20000});
          assert.deepEqual(await readTrade(),before);
          pass(width+"px rejected buy changes no market or wallet balances",true);
          rejectAt = 0;
          await panel.getByRole("button", {name:"Review buy",exact:true}).click();
        }
        await panel.getByRole("button", {name:"Sign and "+side,exact:true}).click();
        await expect(panel.getByTestId("trade-receipt")).toContainText("Confirmed and refreshed", {timeout:45000});
        const sig = wires.at(-1).signature;
        const tx = await rpc("getTransaction",[sig,{encoding:"json",commitment:"confirmed",maxSupportedTransactionVersion:0}]);
        assert.equal(tx.meta.err,null);
        const after = await readTrade();
        const direction = sell ? -1n : 1n;
        assert.equal(after.state.sequence,before.state.sequence+1n);
        assert.equal(after.state.sold,before.state.sold+direction*quote.amount);
        assert.equal(after.state.reserve,before.state.reserve+direction*quote.raw);
        assert.equal(after.reserveLamports,before.reserveLamports+direction*quote.raw);
        assert.equal(after.tokens,before.tokens+direction*quote.amount);
        assert.equal(after.vault,before.vault-direction*quote.amount);
        assert.equal(after.platform,before.platform+quote.platform);
        assert.equal(after.creator,before.creator+quote.creator);
        assert.equal(after.platformLamports,before.platformLamports+quote.platform);
        assert.equal(after.creatorLamports,before.creatorLamports+quote.creator);
        assert.equal(after.sol,before.sol-direction*quote.user-BigInt(tx.meta.fee)-(sell?0n:BigInt(await rpc("getMinimumBalanceForRentExemption",[81]))));
        assert.equal(after.tokens+after.vault+after.migration,1000n);
        await page.reload();
        // The disposable wallet starts disconnected on each document load.
        await connectTrader.click();
        await expect(panel.getByTestId("trade-token-balance")).toContainText("Available tokens: "+after.tokens, {timeout:15000});
        await expect(panel.getByTestId("trade-sol-balance")).toContainText(formatUnits(after.sol)+" SOL");
        evidence.transactions.push({width,mint,side,signature:sig,quote,before,after,networkFee:tx.meta.fee});
        pass(width+"px real wallet-signed "+side+" reconciled against quote and refreshed balances");
      }
    }
    await page.close();
  }
  evidence.completed = true;
  evidence.genesis = genesis;
  evidence.program = LOCAL_WALLET_PROGRAM;
  evidence.artifactSha256 = createHash("sha256").update(await readFile("programs/launch-custody/target/local-fee-test/jeet_launch_custody.so")).digest("hex");
  await mkdir("programs/launch-custody/target/v6-wallet",{recursive:true});
  await writeFile("programs/launch-custody/target/v6-wallet/creation-browser-evidence.json",JSON.stringify(evidence,(_key,v)=>typeof v==="bigint"?v.toString():v,2));
  console.log("PASS creation browser suite",JSON.stringify(evidence,(_key,v)=>typeof v==="bigint"?v.toString():v));
} finally {
  clearTimeout(deadline);
  await browser?.close();
  for(const child of children) child.kill("SIGTERM");
  console.log("Creation browser logs:",dir);
}
