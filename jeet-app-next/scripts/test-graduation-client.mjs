import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSigner, getAddressEncoder } from "@solana/kit";
import {
  activateGraduationInstructions,
  graduationAddresses,
  initializeGraduationInstruction,
  graduateInstruction,
  decodeGraduation,
  CPMM_TEST_PROGRAM,
} from "../src/lib/launch-graduation.ts";
import { decodeV5PreviewState } from "../src/lib/launch-v5-preview.ts";
test("graduation seeds bind mint, nonce, source ATAs and destination", async () => {
  const a = await generateKeyPairSigner(),
    b = await generateKeyPairSigner(),
    x = await graduationAddresses(a.address, 0n),
    y = await graduationAddresses(a.address, 1n),
    z = await graduationAddresses(b.address, 0n);
  assert.equal(x.terms, y.terms);
  assert.equal(x.migrator, y.migrator);
  assert.notEqual(x.pool, y.pool);
  assert.notEqual(x.lpMint, y.lpMint);
  assert.notEqual(x.terms, z.terms);
  assert.equal(x.migratorToken, y.migratorToken);
  assert.notEqual(x.migratorLp, y.migratorLp);
});
test("wire format binds maximum price gap, setup budget, sequence and signer", async () => {
  const caller = await generateKeyPairSigner(),
    a = await graduationAddresses(caller.address, 7n),
    l = {
      ...a,
      mint: caller.address,
      custody: caller.address,
      opening: caller.address,
      curve: caller.address,
      vault: caller.address,
      migrationVault: caller.address,
    };
  const terms = initializeGraduationInstruction({
    ...l,
    creator: caller,
    maxPriceGapBps: 60,
  });
  assert.equal(terms.data.length, 3);
  assert.equal(terms.accounts.length, 9);
  assert.equal(new DataView(terms.data.buffer).getUint16(1, true), 60);
  const ix = graduateInstruction({
    ...l,
    caller,
    sequence: 8n,
    nonce: 7n,
    maxSetupLamports: 300000000n,
  });
  assert.equal(ix.accounts.length, 26);
  assert.equal(ix.data[0], 22);
  const v = new DataView(ix.data.buffer);
  assert.equal(v.getBigUint64(1, true), 8n);
  assert.equal(v.getBigUint64(9, true), 300000000n);
  assert.equal(v.getBigUint64(17, true), 7n);
  assert.equal(ix.accounts[0].signer, caller);
  const activation = activateGraduationInstructions({
    ...l,
    creator: caller,
    maxPriceGapBps: 60,
  });
  assert.equal(activation.length, 3);
  assert.deepEqual([...activation[0].data], [6, 0, 0]);
  assert.deepEqual([...activation[1].data], [6, 1, 0]);
  assert.equal(activation[2].data[0], 21);

  for (const b of [-1, 101, 0.5])
    assert.throws(() =>
      initializeGraduationInstruction({
        ...l,
        creator: caller,
        maxPriceGapBps: b,
      }),
    );
  assert.throws(() =>
    graduateInstruction({
      ...l,
      caller,
      sequence: 0n,
      nonce: -1n,
      maxSetupLamports: 1n,
    }),
  );
});
test("proof decoder rejects malformed, empty migrated and unknown states", () => {
  const d = new Uint8Array(253);
  d.set(new TextEncoder().encode("JEETGRD1"));
  d.set(getAddressEncoder().encode(CPMM_TEST_PROGRAM), 72);
  assert.equal(decodeGraduation(d).migrated, false);
  d[252] = 1;
  assert.throws(() => decodeGraduation(d));
  const v = new DataView(d.buffer);
  for (const at of [200, 208, 216]) v.setBigUint64(at, 1n, true);
  assert.equal(decodeGraduation(d).migrated, true);
  d[252] = 2;
  assert.throws(() => decodeGraduation(d));
});
test("migrated curve separates historical consideration from current reserve", () => {
  const d = new Uint8Array(262),
    v = new DataView(d.buffer);
  d.set(new TextEncoder().encode("JEETCRV5"));
  for (const [at, n] of [
    [128, 594n],
    [144, 594n],
    [204, 50192n],
    [245, 1n],
    [253, 396n],
  ])
    v.setBigUint64(at, n, true);
  d[236] = 1;
  d[261] = 2;
  const s = decodeV5PreviewState(d);
  assert.equal(s.reserve, 0n);
  assert.equal(s.migrationSol, 50192n);
  assert.equal(s.migrated, true);
  v.setBigUint64(136, 1n, true);
  assert.throws(() => decodeV5PreviewState(d));
  v.setBigUint64(136, 0n, true);
  v.setBigUint64(128, 593n, true);
  assert.throws(() => decodeV5PreviewState(d));
});
