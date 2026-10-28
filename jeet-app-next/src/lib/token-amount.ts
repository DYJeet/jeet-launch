const U64_MAX = 18_446_744_073_709_551_615n;

export type TokenAmountResult =
  | { ok: true; baseUnits: bigint; displaySupply: string }
  | { ok: false; message: string };

export function toTokenBaseUnits(
  wholeSupplyText: string,
  decimals: number,
): TokenAmountResult {
  const normalized = wholeSupplyText.trim();

  if (!/^\d+$/.test(normalized)) {
    return {
      ok: false,
      message: "Total supply must be a whole-number token amount.",
    };
  }

  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    return {
      ok: false,
      message: "Decimals must be a whole number from 0 to 9.",
    };
  }

  const wholeSupply = BigInt(normalized);
  if (wholeSupply <= 0n) {
    return { ok: false, message: "Total supply must be greater than zero." };
  }

  const baseUnits = wholeSupply * 10n ** BigInt(decimals);
  if (baseUnits > U64_MAX) {
    return {
      ok: false,
      message:
        "Supply × decimals exceeds the SPL Token u64 limit. Lower the supply or decimals.",
    };
  }

  return {
    ok: true,
    baseUnits,
    displaySupply: wholeSupply.toLocaleString("en-US"),
  };
}
