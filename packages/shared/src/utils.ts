import { getAddress } from "viem";

/** Convert human-readable USDC amount to smallest unit (6 decimals) */
export function toUsdcUnits(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(6, "0").slice(0, 6);
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
