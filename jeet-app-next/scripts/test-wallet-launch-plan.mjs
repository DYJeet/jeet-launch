import assert from "node:assert/strict";
import { test } from "node:test";
import {
  generateKeyPairSigner,
  getTransactionEncoder,
  compileTransaction,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
} from "@solana/kit";
import {
  walletLaunchParameters,
  walletLaunchAddresses,
  createWalletMintInstructions,
  createWalletSupplyInstructions,
  initializeWalletLaunchInstructions,
  activateWalletLaunchInstructions,
} from "../src/lib/wallet-launch.ts";
const defaults = {
  name: "JeeT Browser",
  symbol: "JBROW",
  uri: "http://127.0.0.1:3006/api/local-assets/" + "a".repeat(64) + ".json",
  supply: "1000000000",
  decimals: 9,
  creatorPercent: "1",
  capPercent: "1",
  capEnabled: true,
  capDuration: 10000n,
  openingDuration: 100n,
  openingDelay: 0n,
  openingLimitBps: 50,
};
test("reference billion-token launch keeps exact approved partition and reserve", () => {
  const p = walletLaunchParameters(defaults);
  assert.equal(p.supply, 1000000000000000000n);
  assert.equal(p.creatorAmount, 10000000000000000n);
  assert.equal(p.tradingInventory, 594000000000000000n);
  assert.equal(p.migrationInventory, 396000000000000000n);
  assert.equal(p.graduationReserve, 50192999999n);
  assert.equal(
    p.creatorAmount + p.tradingInventory + p.migrationInventory,
    p.supply,
  );
});
test("creator range 0–5% and partition rounding are explicit and conserved", () => {
  for (const creatorPercent of ["0", "1", "2.5", "5"]) {
    const p = walletLaunchParameters({ ...defaults, creatorPercent });
    assert.equal(
      p.creatorAmount + p.tradingInventory + p.migrationInventory,
      p.supply,
    );
    assert.equal(p.tradingInventory % p.quantum, 0n);
    assert.equal(p.migrationInventory % p.quantum, 0n);
  }
  assert.throws(() =>
    walletLaunchParameters({ ...defaults, creatorPercent: "5.01" }),
  );
});
test("invalid supply, precision, protected durations and incompatible allocation fail before minting", () => {
  for (const override of [
    { supply: "0" },
    { supply: "1e9" },
    { supply: "18446744074" },
    { decimals: 10 },
    { creatorPercent: "-1" },
    { supply: "999", creatorPercent: "1" },
    { capDuration: 0n },
    { openingDuration: 0n },
    { openingLimitBps: 101 },
    { openingDelay: 1000001n },
  ])
    assert.throws(() => walletLaunchParameters({ ...defaults, ...override }));
});
test("all staged transactions fit wire limit and preserve exact atomic activation bundle", async () => {
  const creator = await generateKeyPairSigner(),
    mint = await generateKeyPairSigner(),
    p = walletLaunchParameters({ ...defaults, supply: "1000", decimals: 0 }),
    l = await walletLaunchAddresses(mint.address, creator.address);
  const stages = [
    createWalletMintInstructions(creator, mint, 1461600n, p),
    await createWalletSupplyInstructions(creator, l, p),
    initializeWalletLaunchInstructions(creator, l, p),
    activateWalletLaunchInstructions(creator, l, p),
  ];
  for (const ixs of stages) {
    const message = appendTransactionMessageInstructions(
      ixs,
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: mint.address, lastValidBlockHeight: 100n },
        setTransactionMessageFeePayerSigner(
          creator,
          createTransactionMessage({ version: 0 }),
        ),
      ),
    );
    const wire = getTransactionEncoder().encode(compileTransaction(message));
    assert.ok(
      wire.length <= 1232,
      "oversize staged transaction: " + wire.length,
    );
  }
  const activation = stages[3];
  assert.equal(activation.length, 4);
  assert.equal(activation[1].data[0], 6);
  assert.equal(activation[2].data[0], 6);
  assert.equal(activation[3].data[0], 21);
  assert.equal(stages[2].at(-1).data[0], 16);
  const other = await generateKeyPairSigner();
  assert.throws(() => activateWalletLaunchInstructions(other, l, p));
  await assert.rejects(() => createWalletSupplyInstructions(other, l, p));
});
