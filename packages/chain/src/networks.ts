import { baseSepolia, polygonAmoy } from "viem/chains";
import type { Network } from "@x402-gateway/shared";

export const CHAINS = {
  "base-sepolia": baseSepolia,
  "polygon-amoy": polygonAmoy,
} as const;

export const USDC_ADDRESSES: Record<Network, `0x${string}`> = {
  "base-sepolia": (process.env.BASE_SEPOLIA_USDC ??
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`,
  "polygon-amoy": (process.env.POLYGON_AMOY_USDC ??
    "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582") as `0x${string}`,
};

export const ERC8004_IDENTITY_ADDRESSES: Record<Network, `0x${string}` | null> = {
  "base-sepolia": (process.env.BASE_SEPOLIA_ERC8004_IDENTITY || null) as `0x${string}` | null,
  "polygon-amoy": (process.env.POLYGON_AMOY_ERC8004_IDENTITY || null) as `0x${string}` | null,
};

export const CHAIN_IDS: Record<Network, number> = {
  "base-sepolia": 84532,
  "polygon-amoy": 80002,
};
