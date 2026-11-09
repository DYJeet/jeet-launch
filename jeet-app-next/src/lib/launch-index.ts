export const launchViews = ["New", "Trending", "Final Stretch", "Migrated"] as const;
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
  observedAt?: number;
  observedSlot?: string;
};
