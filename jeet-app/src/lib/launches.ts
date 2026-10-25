export type LaunchStatus = "New" | "Trending" | "Final Stretch" | "Migrated";
export type LiquidityStatus = "Pending" | "Locked" | "Burned";

export type Launch = {
  name: string;
  ticker: string;
  mint: string;
  subtitle: string;
  description: string;
  image: string;
  creator: string;
  price: string;
  marketCap: string;
  volume24h: string;
  holders: string;
  age: string;
  bondingProgress: number;
  status: LaunchStatus;
  devAllocation: number;
  topHolderPercent: number;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  liquidityStatus: LiquidityStatus;
  transactions24h: string;
  change24h: string;
};

function launch(
  partial: Omit<Launch, "description" | "transactions24h" | "change24h"> &
    Partial<Pick<Launch, "description" | "transactions24h" | "change24h">>,
): Launch {
  return {
    description: `${partial.subtitle} launched through JeeT Launch with transparent tokenomics and launch integrity checks.`,
    transactions24h: "1.2K",
    change24h: "+18.4%",
    ...partial,
  };
}

export const launches: Launch[] = [
  launch({ name: "DOGGO", ticker: "DOGGO", mint: "PLACEHOLDER_MINT_1", image: "", creator: "PLACEHOLDER_CREATOR_1", subtitle: "Doggo Coin", price: "$0.0024", marketCap: "$184K", volume24h: "$1.2M", holders: "4.8K", age: "6h", bondingProgress: 72, status: "Trending", devAllocation: 1, topHolderPercent: 12, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", transactions24h: "3.8K", change24h: "+34.8%" }),
  launch({ name: "KITTY", ticker: "KITTY", mint: "PLACEHOLDER_MINT_2", image: "", creator: "PLACEHOLDER_CREATOR_2", subtitle: "Kitty On Sol", price: "$0.0009", marketCap: "$96K", volume24h: "$420K", holders: "2.1K", age: "3h", bondingProgress: 61, status: "Trending", devAllocation: 1, topHolderPercent: 14, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", change24h: "+21.2%" }),
  launch({ name: "PEPE2.0", ticker: "PEPE2.0", mint: "PLACEHOLDER_MINT_3", image: "", creator: "PLACEHOLDER_CREATOR_3", subtitle: "Pepe 2.0", price: "$0.0011", marketCap: "$121K", volume24h: "$310K", holders: "1.7K", age: "5h", bondingProgress: 66, status: "Trending", devAllocation: 1, topHolderPercent: 13, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", change24h: "+16.7%" }),
  launch({ name: "$JEET", ticker: "JEET", mint: "PLACEHOLDER_MINT_4", image: "/jeet-promo-side.png", creator: "PLACEHOLDER_CREATOR_4", subtitle: "JeeT the Cat", description: "The cat that launches fair. Community first. No hidden bundles. Just JeeT.", price: "$0.0031", marketCap: "$268K", volume24h: "$2.4M", holders: "6.2K", age: "12h", bondingProgress: 84, status: "Trending", devAllocation: 1, topHolderPercent: 10, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", transactions24h: "6.9K", change24h: "+62.4%" }),
  launch({ name: "MOONCAT", ticker: "MOONCAT", mint: "PLACEHOLDER_MINT_5", image: "", creator: "PLACEHOLDER_CREATOR_5", subtitle: "Moon Cat", price: "$0.00014", marketCap: "$42K", volume24h: "$38K", holders: "420", age: "12m", bondingProgress: 18, status: "New", devAllocation: 1, topHolderPercent: 9, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "286", change24h: "+8.1%" }),
  launch({ name: "BANANAS", ticker: "BANANAS", mint: "PLACEHOLDER_MINT_6", image: "", creator: "PLACEHOLDER_CREATOR_6", subtitle: "Bananas On Sol", price: "$0.00021", marketCap: "$57K", volume24h: "$61K", holders: "690", age: "27m", bondingProgress: 27, status: "New", devAllocation: 1, topHolderPercent: 11, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "412", change24h: "+12.5%" }),
  launch({ name: "FROGGO", ticker: "FROGGO", mint: "PLACEHOLDER_MINT_7", image: "", creator: "PLACEHOLDER_CREATOR_7", subtitle: "Froggo", price: "$0.00008", marketCap: "$31K", volume24h: "$22K", holders: "305", age: "41m", bondingProgress: 14, status: "New", devAllocation: 1, topHolderPercent: 10, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "198", change24h: "+4.9%" }),
  launch({ name: "CHONK", ticker: "CHONK", mint: "PLACEHOLDER_MINT_8", image: "", creator: "PLACEHOLDER_CREATOR_8", subtitle: "Chonk Cat", price: "$0.00017", marketCap: "$49K", volume24h: "$44K", holders: "515", age: "53m", bondingProgress: 22, status: "New", devAllocation: 1, topHolderPercent: 12, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "351", change24h: "+9.4%" }),
  launch({ name: "WAGMI", ticker: "WAGMI", mint: "PLACEHOLDER_MINT_9", image: "", creator: "PLACEHOLDER_CREATOR_9", subtitle: "We Are Gonna Make It", price: "$0.00074", marketCap: "$152K", volume24h: "$188K", holders: "1.4K", age: "2h", bondingProgress: 91, status: "Final Stretch", devAllocation: 1, topHolderPercent: 11, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "1.9K", change24h: "+27.1%" }),
  launch({ name: "DEGEN", ticker: "DEGEN", mint: "PLACEHOLDER_MINT_10", image: "", creator: "PLACEHOLDER_CREATOR_10", subtitle: "Degen Mode", price: "$0.0012", marketCap: "$214K", volume24h: "$265K", holders: "1.9K", age: "3h", bondingProgress: 95, status: "Final Stretch", devAllocation: 1, topHolderPercent: 12, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "2.2K", change24h: "+31.6%" }),
  launch({ name: "PUMPY", ticker: "PUMPY", mint: "PLACEHOLDER_MINT_11", image: "", creator: "PLACEHOLDER_CREATOR_11", subtitle: "Pumpy", price: "$0.00063", marketCap: "$173K", volume24h: "$149K", holders: "1.2K", age: "2h", bondingProgress: 88, status: "Final Stretch", devAllocation: 1, topHolderPercent: 10, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "1.5K", change24h: "+23.7%" }),
  launch({ name: "SENDIT", ticker: "SENDIT", mint: "PLACEHOLDER_MINT_12", image: "", creator: "PLACEHOLDER_CREATOR_12", subtitle: "Send It", price: "$0.00091", marketCap: "$198K", volume24h: "$201K", holders: "1.6K", age: "4h", bondingProgress: 93, status: "Final Stretch", devAllocation: 1, topHolderPercent: 11, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Pending", transactions24h: "1.8K", change24h: "+29.8%" }),
  launch({ name: "SOLCAT", ticker: "SOLCAT", mint: "PLACEHOLDER_MINT_13", image: "", creator: "PLACEHOLDER_CREATOR_13", subtitle: "Sol Cat", price: "$0.0048", marketCap: "$1.1M", volume24h: "$1.8M", holders: "5.7K", age: "9h", bondingProgress: 100, status: "Migrated", devAllocation: 1, topHolderPercent: 9, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", transactions24h: "5.1K", change24h: "+48.2%" }),
  launch({ name: "BONKX", ticker: "BONKX", mint: "PLACEHOLDER_MINT_14", image: "", creator: "PLACEHOLDER_CREATOR_14", subtitle: "Bonk X", price: "$0.0031", marketCap: "$860K", volume24h: "$1.2M", holders: "4.9K", age: "11h", bondingProgress: 100, status: "Migrated", devAllocation: 1, topHolderPercent: 10, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", transactions24h: "4.4K", change24h: "+38.9%" }),
  launch({ name: "APEIT", ticker: "APEIT", mint: "PLACEHOLDER_MINT_15", image: "", creator: "PLACEHOLDER_CREATOR_15", subtitle: "Ape It", price: "$0.0062", marketCap: "$1.4M", volume24h: "$2.3M", holders: "7.1K", age: "14h", bondingProgress: 100, status: "Migrated", devAllocation: 1, topHolderPercent: 8, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", transactions24h: "7.2K", change24h: "+71.5%" }),
  launch({ name: "MOONER", ticker: "MOONER", mint: "PLACEHOLDER_MINT_16", image: "", creator: "PLACEHOLDER_CREATOR_16", subtitle: "Mooner", price: "$0.0054", marketCap: "$1.2M", volume24h: "$1.9M", holders: "6.3K", age: "16h", bondingProgress: 100, status: "Migrated", devAllocation: 1, topHolderPercent: 9, mintAuthorityRevoked: true, freezeAuthorityRevoked: true, liquidityStatus: "Locked", transactions24h: "5.8K", change24h: "+54.3%" }),
];

export const launchTabs: LaunchStatus[] = ["New", "Trending", "Final Stretch", "Migrated"];

export function launchesByStatus(status: LaunchStatus) {
  return launches.filter((coin) => coin.status === status);
}

export function findLaunch(mint: string) {
  return launches.find((coin) => coin.mint === mint);
}

export function calculateIntegrityScore(coin: Launch) {
  let score = 100;

  if (!coin.mintAuthorityRevoked) score -= 25;
  if (!coin.freezeAuthorityRevoked) score -= 20;

  if (coin.devAllocation > 5) score -= 20;
  else if (coin.devAllocation > 2) score -= 10;

  if (coin.topHolderPercent > 20) score -= 20;
  else if (coin.topHolderPercent > 15) score -= 10;

  if (coin.liquidityStatus === "Pending") score -= 5;
  if (coin.bondingProgress < 20 && coin.liquidityStatus === "Pending") score -= 5;

  return Math.max(0, Math.min(100, score));
}

export function getIntegrityNotes(coin: Launch) {
  const notes: string[] = [];

  if (!coin.mintAuthorityRevoked) notes.push("Mint authority active");
  if (!coin.freezeAuthorityRevoked) notes.push("Freeze authority active");
  if (coin.devAllocation > 5) notes.push("High dev allocation");
  if (coin.topHolderPercent > 20) notes.push("High holder concentration");
  if (coin.liquidityStatus === "Pending") notes.push("Liquidity pending");
  if (coin.bondingProgress < 20) notes.push("Very early launch");

  return notes;
}
