export const launchViews = ["New", "Trending", "Final Stretch", "Migrated"] as const;
export type LaunchView = typeof launchViews[number];
export type IndexedLaunch = {
  mint: string;
  name: string;
  symbol: string;
  activationSlot: string;
  volume: string;
  progress: number;
  reserve: string;
  migrated: boolean;
  eligible: boolean;
};

export function indexPage(rows: IndexedLaunch[], params: URLSearchParams) {
  const view = params.get("view");
  const query = (params.get("q") ?? "").trim().slice(0, 100).toLowerCase();
  const offset = Math.min(64, Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0));
  const limit = Math.min(12, Math.max(1, Number.parseInt(params.get("limit") ?? "12", 10) || 12));
  const cmp = (a: string, b: string) => BigInt(a) < BigInt(b) ? 1 : BigInt(a) > BigInt(b) ? -1 : 0;
  const filtered = rows.filter(row =>
    (!query || [row.name, row.symbol, row.mint].some(value => value.toLowerCase().includes(query))) &&
    (view === "Migrated" ? row.migrated :
      view === "Final Stretch" ? !row.migrated && row.progress >= 90 :
      view === "Trending" ? BigInt(row.volume) > 0n : true));
  filtered.sort((a, b) => (
    view === "Trending" ? cmp(a.volume, b.volume) :
    view === "Final Stretch" ? b.progress - a.progress : 0
  ) || cmp(a.activationSlot, b.activationSlot) || a.mint.localeCompare(b.mint));
  return { rows: filtered.slice(offset, offset + limit), total: filtered.length, offset, limit };
}
