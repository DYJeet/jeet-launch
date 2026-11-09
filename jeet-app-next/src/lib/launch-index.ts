import type { BuildingReceipt } from "./still-building.ts";

export const launchViews = ["New", "Trending", "Final Stretch", "Migrated", "Still Building"] as const;
export type LaunchView = typeof launchViews[number];
export type IndexedLaunch = {
  mint: string;
  creator?: string;
  pool?: string;
  name: string;
  symbol: string;
  activationSlot: string;
  volume: string;
  progress: number;
  reserve: string;
  migrated: boolean;
  eligible: boolean;
  buildingReceipt?: BuildingReceipt;
  observedAt?: number;
  observedSlot?: string;
};
