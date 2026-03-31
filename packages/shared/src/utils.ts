import { getAddress } from "viem";

/** Convert human-readable USDC amount to smallest unit (6 decimals) */
export function toUsdcUnits(amount: string): bigint {
  if (!amount || !/^\d+(\.\d{1,6})?$/.test(amount)) {
    throw new Error(`Invalid USDC amount: "${amount}"`);
  }
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(6, "0");
  return BigInt(whole + fracPadded);
}

/** Convert USDC smallest unit to human-readable string */
export function fromUsdcUnits(units: bigint): string {
  const str = units.toString().padStart(7, "0");
  const whole = str.slice(0, -6) || "0";
  const frac = str.slice(-6).replace(/0+$/, "") || "0";
  return `${whole}.${frac}`;
}

/** Normalize Ethereum address to checksum format */
export function normalizeAddress(address: string): string {
  return getAddress(address);
}

/** Convert a human-readable string into a URL-safe slug */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
