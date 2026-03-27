import { optimismSepolia, sepolia } from "viem/chains";
import type { Network } from "@x402-gateway/shared";
import { getPublicClient } from "./client.js";

export const CHAINS = {
  "optimism-sepolia": optimismSepolia,
  "sepolia": sepolia,
} as const;

export const DMHKD_ADDRESSES: Record<Network, `0x${string}`> = {
  "optimism-sepolia": (process.env.OPTIMISM_SEPOLIA_DMHKD ??
    "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6") as `0x${string}`,
  "sepolia": (process.env.SEPOLIA_DMHKD ??
    "0x1aA90392c804343C7854DD700f50a48961B71c53") as `0x${string}`,
};

export const ERC8004_IDENTITY_ADDRESSES: Record<Network, `0x${string}` | null> = {
  "optimism-sepolia": (process.env.OPTIMISM_SEPOLIA_ERC8004_IDENTITY || null) as `0x${string}` | null,
  "sepolia": (process.env.SEPOLIA_ERC8004_IDENTITY || null) as `0x${string}` | null,
};

export const CHAIN_IDS: Record<Network, number> = {
  "optimism-sepolia": 11155420,
  "sepolia": 11155111,
};

// EIP-712 domain name per network (from on-chain name()).
// Source: stablecoin-evm-master uses name() for domain name.
// Override via OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME / SEPOLIA_TOKEN_DOMAIN_NAME env vars.
export const TOKEN_DOMAIN_NAMES: Record<Network, string> = {
  "optimism-sepolia": process.env.OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME ?? "DMHKD",
  "sepolia": process.env.SEPOLIA_TOKEN_DOMAIN_NAME ?? "DMHKD",
};

// EIP-712 domain version per network.
// Source: stablecoin-evm-master uses version "2" (FiatTokenV2/V2.2 both hardcode "2").
// Override via OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION / SEPOLIA_TOKEN_DOMAIN_VERSION.
export const TOKEN_DOMAIN_VERSIONS: Record<Network, string> = {
  "optimism-sepolia": process.env.OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION ?? "2",
  "sepolia": process.env.SEPOLIA_TOKEN_DOMAIN_VERSION ?? "2",
};

const DOMAIN_SEPARATOR_ABI = [{
  name: "DOMAIN_SEPARATOR",
  type: "function",
  stateMutability: "view",
  inputs: [],
  outputs: [{ type: "bytes32" }],
}] as const;

// Cache the domain separator per network (fetched once from on-chain DOMAIN_SEPARATOR()).
// The proxy contracts may not have called initializeV2, so we read the actual stored value
// rather than computing it from domain fields.
const _dsCache: Partial<Record<Network, `0x${string}`>> = {};

export async function getDomainSeparator(network: Network): Promise<`0x${string}`> {
  if (_dsCache[network]) return _dsCache[network]!;
  const client = getPublicClient(network);
  const ds = await client.readContract({
    address: DMHKD_ADDRESSES[network],
    abi: DOMAIN_SEPARATOR_ABI,
    functionName: "DOMAIN_SEPARATOR",
  });
  _dsCache[network] = ds;
  return ds;
}
