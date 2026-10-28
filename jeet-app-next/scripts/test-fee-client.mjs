import assert from "node:assert/strict";
import { test } from "node:test";
import { address, getAddressEncoder } from "@solana/kit";
import {
  feeAmounts,
  futureSellFees,
  decodeFeeQuote,
  decodeFeeState,
  PLATFORM_TREASURY,
} from "../src/lib/launch-fees.ts";
test("approved rates, exact integer/dust/wide fee fixtures", () => {
  for (const [raw, p, c, total] of [
    [1n, 1n, 1n, 3n],
    [399n, 3n, 1n, 403n],
    [400n, 3n, 1n, 404n],
    [9999n, 75n, 25n, 10099n],
    [10000n, 75n, 25n, 10100n],
    [10001n, 76n, 26n, 10103n],
    [
      1000000000000000000n,
      7500000000000000n,
      2500000000000000n,
      1010000000000000000n,
    ],
  ])
    assert.deepEqual(feeAmounts(raw), {
      raw,
      platform: p,
      creator: c,
      fees: p + c,
      total,
    });
});
test("zero, negative-equivalent and full-spend overflow fail closed", () => {
  for (const raw of [0n, -1n, (1n << 64n) - 1n, 1n << 64n])
    assert.throws(() => feeAmounts(raw));
});
test("fee quote decode rejects substituted components and malformed return data", () => {
  const d = new Uint8Array(56),
    v = new DataView(d.buffer);
  [10000n, 75n, 25n, 10100n, 7n, 70000n, 1n].forEach((x, i) =>
    v.setBigUint64(i * 8, x, true),
  );
  assert.equal(decodeFeeQuote(d).total, 10100n);
  for (const at of [0, 8, 16, 24]) {
    const bad = d.slice();
    bad[at] ^= 1;
    assert.throws(() => decodeFeeQuote(bad));
  }
  assert.throws(() => decodeFeeQuote(d.slice(1)));
});
test("fee state decoder preserves immutable identity and validates claim accounting", () => {
  const d = new Uint8Array(153),
    v = new DataView(d.buffer);
  d.set(new TextEncoder().encode("JEETFEE1"));
  const encoder = getAddressEncoder();
  for (const at of [8, 40, 72]) d.set(encoder.encode(PLATFORM_TREASURY), at);
  v.setBigUint64(105, 100n, true);
  v.setBigUint64(113, 40n, true);
  v.setBigUint64(121, 60n, true);
  const f = decodeFeeState(d);
  assert.equal(f.claimable, 60n);
  assert.equal(f.beneficiary, PLATFORM_TREASURY);
  for (const at of [0, 104, 121, 129]) {
    const b = d.slice();
    b[at] = 255;
    assert.throws(() => decodeFeeState(b));
  }
  v.setBigUint64(113, 101n, true);
  assert.throws(() => decodeFeeState(d));
});
test("future sell net interface rejects dust deficit and exposes no executable sell", () => {
  assert.deepEqual(futureSellFees(400n), {
    raw: 400n,
    platform: 3n,
    creator: 1n,
    fees: 4n,
    net: 396n,
  });
  assert.throws(() => futureSellFees(1n));
});
test("approved treasury is exactly 32 bytes and remains pinned", () => {
  assert.equal(
    PLATFORM_TREASURY,
    address("HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP"),
  );
  assert.equal(getAddressEncoder().encode(PLATFORM_TREASURY).length, 32);
});
test("verified binary events exclude spoofed nested-program logs", async () => {
  const { decodeFeeEvents } = await import("../src/lib/launch-fees.ts");
  const { CUSTODY_PROGRAM_ADDRESS: program } =
    await import("../src/lib/launch-custody.ts");
  const enc = getAddressEncoder(),
    n = (x) => {
      const b = Buffer.alloc(8);
      b.writeBigUInt64LE(x);
      return b;
    };
  const line =
    "Program data: " +
    [
      Buffer.from("JEET_TRADE_FEE_V1"),
      enc.encode(PLATFORM_TREASURY),
      enc.encode(PLATFORM_TREASURY),
      n(10000n),
      n(75n),
      n(25n),
      n(10100n),
    ]
      .map((v) => Buffer.from(v).toString("base64"))
      .join(" ");
  assert.equal(decodeFeeEvents([line]).length, 0);
  assert.equal(
    decodeFeeEvents([
      `Program ${program} invoke [1]`,
      "Program 11111111111111111111111111111111 invoke [2]",
      line,
      "Program 11111111111111111111111111111111 success",
      line,
      `Program ${program} success`,
    ]).length,
    1,
  );
  const [event] = decodeFeeEvents([
    `Program ${program} invoke [1]`,
    line,
    `Program ${program} success`,
  ]);
  assert.equal(event.total, 10100n);
  assert.equal(event.platform, 75n);
  assert.equal(event.creator, 25n);
});

test("wallet rejection survives SDK error wrapping without showing encoded decoder commands", async () => {
  const { describeFeeError } = await import("../src/lib/launch-fees.ts");
  assert.equal(
    describeFeeError({
      message: "Solana error #11; decode encoded context",
      context: { causeMessage: ": User rejected request" },
    }),
    "User rejected request",
  );
  assert.equal(
    describeFeeError({ cause: { message: "User declined signing" } }),
    "User declined signing",
  );
});
