import type { MarketEvent, MarketStore } from "./market-store.ts";

export type IndexedSignature = { signature: string; slot: bigint; failed: boolean };
export type HistorySource = {
  signatures(before?: string): Promise<IndexedSignature[]>;
  events(entry: IndexedSignature): Promise<MarketEvent[]>;
};
export const historyBatchSize = 16;

/** Commit events and cursor atomically. Missing transactions leave the entire page retryable. */
export async function ingestMarketPage(store: MarketStore, network: string, stream: string, source: HistorySource) {
  const prior = store.checkpoint(network, stream);
  const page = await source.signatures(prior.before);
  if (page.length > historyBatchSize || new Set(page.map(entry => entry.signature)).size !== page.length ||
      page.some((entry, i) => i > 0 && entry.slot > page[i - 1].slot) ||
      (prior.before && page.some(entry => entry.signature === prior.before)))
    throw Error("Inconsistent history page.");
  const anchor = page.findIndex(item => item.signature === prior.anchor);
  const relevant = anchor < 0 ? page : page.slice(0, anchor);
  const events: MarketEvent[] = [];
  for (let i = 0; i < relevant.length; i += 4)
    events.push(...(await Promise.all(relevant.slice(i, i + 4).filter(entry => !entry.failed).map(async entry => {
      const records = await source.events(entry);
      if (records.some(record => record.signature !== entry.signature || record.slot !== entry.slot.toString()))
        throw Error("Transaction identity mismatch.");
      return records;
    }))).flat());
  const head = prior.head ?? page[0]?.signature ?? prior.anchor;
  const completed = anchor >= 0 || page.length < historyBatchSize;
  const next = completed
    ? { anchor: head, backfilled: true, gap: prior.gap || (!!prior.anchor && anchor === -1) }
    : { ...prior, head, before: page.at(-1)?.signature };
  return store.commit(network, stream, prior, next, events);
}
