import { getAddressDecoder, getBase64Encoder } from "@solana/kit";

export function programEvents(logs: readonly string[], program: string) {
  const stack: string[] = [];
  const events = [];
  for (const log of logs) {
    const invoke = /^Program (\w+) invoke \[(\d+)\]$/.exec(log);
    if (invoke) {
      if (Number(invoke[2]) !== stack.length + 1) return [];
      stack.push(invoke[1]);
      continue;
    }
    const exit = /^Program (\w+) (?:success|failed:.*)$/.exec(log);
    if (exit) {
      if (stack.pop() !== exit[1]) return [];
      continue;
    }
    if (!log.startsWith("Program data: ") || stack.at(-1) !== program) continue;
    events.push(log.slice(14).split(" "));
  }
  return stack.length ? [] : events;
}

const bytes = getBase64Encoder();
const address = getAddressDecoder();
const utf8 = new TextDecoder();
const u64 = (value: ReturnType<typeof bytes.encode>) => new DataView(value.buffer, value.byteOffset, 8).getBigUint64(0, true);

export function curveTradeEvents(logs: readonly string[], program: string, mint: string) {
  const events = [];
  for (const fields of programEvents(logs, program)) {
    if (fields.length !== 12) continue;
    try {
      const [tag, key, signer, side, ...values] = fields.map(value => bytes.encode(value));
      if (utf8.decode(tag) !== "JEET_V5_PREVIEW_TRADE" || key.length !== 32 ||
          address.decode(key) !== mint || signer.length !== 32 || side.length !== 1 ||
          side[0] > 1 || values.some(value => value.length !== 8)) continue;
      const [tokens, raw, platform, creator, user, , , sequence] = values.map(u64);
      if (!tokens || !raw || (side[0] ? user + platform + creator !== raw : raw + platform + creator !== user)) continue;
      events.push({ wallet: address.decode(signer), sell: side[0] === 1, tokens, raw, sequence });
    } catch {
      continue;
    }
  }
  return events;
}

export function feeClaimEvents(logs: readonly string[], program: string, mint: string) {
  const claims = [];
  for (const fields of programEvents(logs, program)) {
    if (fields.length !== 6) continue;
    try {
      const [tag, key, signer, kind, amount, total] = fields.map(value => bytes.encode(value));
      if (utf8.decode(tag) !== "JEET_FEE_CLAIM_V1" || key.length !== 32 || address.decode(key) !== mint ||
          signer.length !== 32 || kind.length !== 1 || kind[0] > 1 || amount.length !== 8 || total.length !== 8) continue;
      const paid = u64(amount), withdrawn = u64(total);
      if (!paid || withdrawn < paid) continue;
      claims.push({ beneficiary: address.decode(signer), platform: kind[0] === 0, paid, withdrawn });
    } catch {
      continue;
    }
  }
  return claims;
}
