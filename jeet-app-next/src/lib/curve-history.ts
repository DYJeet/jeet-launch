import { getAddressDecoder, getBase64Encoder } from "@solana/kit";

export function curveTradeEvents(logs: readonly string[], program: string, mint: string) {
  const stack: string[] = [];
  const bytes = getBase64Encoder();
  const address = getAddressDecoder();
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
    const fields = log.slice(14).split(" ");
    if (fields.length !== 12) continue;
    try {
      const [tag, key, signer, side, ...values] = fields.map(value => bytes.encode(value));
      if (new TextDecoder().decode(tag) !== "JEET_V5_PREVIEW_TRADE" || key.length !== 32 ||
          address.decode(key) !== mint || signer.length !== 32 || side.length !== 1 ||
          side[0] > 1 || values.some(value => value.length !== 8)) continue;
      const [tokens, raw, platform, creator, user, , , sequence] = values.map(value =>
        new DataView(value.buffer, value.byteOffset, 8).getBigUint64(0, true));
      if (!tokens || !raw || (side[0] ? user + platform + creator !== raw : raw + platform + creator !== user)) continue;
      events.push({ wallet: address.decode(signer), sell: side[0] === 1, tokens, raw, sequence });
    } catch {
      continue;
    }
  }
  return stack.length ? [] : events;
}
