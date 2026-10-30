import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { generateKeyPairSigner } from "@solana/kit";
import {
  validateMetadataFields,
  initializeLaunchMetadataInstruction,
  findMetadataPda,
  decodeLaunchMetadata,
} from "../src/lib/launch-metadata.ts";
import {
  validateImageBytes,
  validateImageDimensions,
  MAX_LOGO_BYTES,
} from "../src/lib/launch-image.ts";
test("UTF-8 metadata boundaries and URI scheme/credential checks", () => {
  validateMetadataFields("🐱".repeat(8), "JEET", "https://example.com/a.json");
  for (const args of [
    ["🐱".repeat(9), "JEET", "https://example.com/a.json"],
    ["a\u0080", "JEET", "https://example.com/a"],
    ["name", "JEET", "javascript:alert(1)"],
    ["name", "JEET", "https://a:b@example.com/a"],
    ["name", "JEET", "http://127.0.0.1:3000/a"],
  ])
    assert.throws(() => validateMetadataFields(...args));
  validateMetadataFields("JeeT", "JEET", "http://127.0.0.1:3000/a", true);
  const prefix = "https://example.com/";
  validateMetadataFields(
    "JeeT",
    "JEET",
    prefix + "a".repeat(200 - prefix.length),
  );
  assert.throws(() =>
    validateMetadataFields(
      "JeeT",
      "JEET",
      prefix + "a".repeat(201 - prefix.length),
    ),
  );
});
test("metadata instruction encodes explicit budget, immutable data and canonical mint-specific PDA", async () => {
  const creator = await generateKeyPairSigner(),
    p = {
      creator,
      mint: creator.address,
      custody: creator.address,
      name: "JeeT",
      symbol: "JEET",
      uri: "https://example.com/meta.json",
      mutable: false,
      maxCostLamports: 20000000n,
    };
  const ix = await initializeLaunchMetadataInstruction(p),
    [key] = await findMetadataPda(p.mint);
  assert.equal(ix.data[0], 23);
  assert.equal(new DataView(ix.data.buffer).getBigUint64(1, true), 20000000n);
  assert.equal(ix.data[9], 0);
  assert.equal(ix.accounts[3].address, key);
  assert.equal(ix.accounts[0].signer, creator);
  await assert.rejects(() =>
    initializeLaunchMetadataInstruction({ ...p, maxCostLamports: -1n }),
  );
  await assert.rejects(() =>
    initializeLaunchMetadataInstruction({ ...p, maxCostLamports: 1n << 64n }),
  );
});
test("malformed metadata accounts cannot supply identity or authority facts", () => {
  assert.throws(() => decodeLaunchMetadata(new Uint8Array(64)));
  const b = new Uint8Array(100);
  b[0] = 4;
  new DataView(b.buffer).setUint32(65, 201, true);
  assert.throws(() => decodeLaunchMetadata(b));
});
test("actual PNG signature, dimensions, forged MIME, empty and oversized files", async () => {
  const png = new Uint8Array(await readFile("public/jeet-promo.png"));
  validateImageBytes(png, "image/png");
  assert.throws(() => validateImageBytes(png, "image/jpeg"));
  assert.throws(() =>
    validateImageBytes(
      new TextEncoder().encode('<svg onload="x()"/>'),
      "image/png",
    ),
  );
  assert.throws(() => validateImageBytes(new Uint8Array(), "image/png"));
  assert.throws(() =>
    validateImageBytes(new Uint8Array(MAX_LOGO_BYTES + 1), "image/png"),
  );
  const bomb = png.slice();
  new DataView(bomb.buffer).setUint32(16, 4097, false);
  assert.throws(() => validateImageBytes(bomb, "image/png"));
  for (const [w, h] of [
    [0, 1],
    [1, 4097],
    [-1, 1],
    [1.5, 2],
  ])
    assert.throws(() => validateImageDimensions(w, h));
  validateImageDimensions(4096, 4096);
});
