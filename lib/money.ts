// Amounts are Tunisian dinars with 3 decimals, stored as integer millimes (FR-12).
// Floating point is never used, so totals cannot drift.

export const MAX_MILLIMES = 10_000_000_000n; // 10,000,000 TND
export const AMOUNT_PATTERN = /^(0|[1-9]\d{0,7})(\.\d{1,3})?$/; // no sign, no exponent, at most 3 decimals

export function parseAmount(text: string): bigint | null {
  if (!AMOUNT_PATTERN.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

export function formatMillimes(millimes: bigint): string {
  const sign = millimes < 0n ? "-" : "";
  const abs = millimes < 0n ? -millimes : millimes;
  return `${sign}${abs / 1000n}.${(abs % 1000n).toString().padStart(3, "0")}`;
}
