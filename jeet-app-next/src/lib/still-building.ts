// Server-side editorial configuration. Entries are approved by the operator.
import { address } from "@solana/kit";

export type BuildingReceipt = { title: string; url: string; date: string };

const featureWindowMs = 30 * 24 * 60 * 60 * 1000;

export function activeBuildingReceipts(network: string, now = Date.now()) {
  const active = new Map<string, BuildingReceipt>();
  const raw = process.env.JEET_STILL_BUILDING_RECEIPTS;
  if (!raw) return active;

  let entries: unknown;
  try { entries = JSON.parse(raw); }
  catch { return active; }
  if (!Array.isArray(entries)) return active;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const { network: scope, mint, title, url, date } = entry;
    if (scope !== network || typeof mint !== "string" ||
        typeof title !== "string" || !title.trim() || title.length > 160 ||
        typeof url !== "string" || url.length > 2048 ||
        typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const deliveredAt = Date.parse(date);
    if (!Number.isFinite(deliveredAt) || new Date(deliveredAt).toISOString().slice(0, 10) !== date ||
        deliveredAt > now || now - deliveredAt >= featureWindowMs) continue;

    try {
      address(mint);
      const evidence = new URL(url);
      if (evidence.protocol !== "https:" || evidence.username || evidence.password) continue;
      const previous = active.get(mint);
      if (!previous || previous.date < date) active.set(mint, { title: title.trim(), url: evidence.href, date });
    } catch {
      continue;
    }
  }
  return active;
}
