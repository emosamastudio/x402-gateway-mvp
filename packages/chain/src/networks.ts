/**
 * Domain separator cache & lookup.
 *
 * All hardcoded chain/token constants have been replaced by the runtime registry
 * (see registry.ts). This file only keeps getDomainSeparator.
 */

import { getPublicClient } from "./client.js";

const DOMAIN_SEPARATOR_ABI = [{
  name: "DOMAIN_SEPARATOR",
  type: "function",
  stateMutability: "view",
  inputs: [],
  outputs: [{ type: "bytes32" }],
}] as const;

// Cache: key = "chainSlug:contractAddress"
const _dsCache = new Map<string, `0x${string}`>();

/**
 * Read the EIP-712 DOMAIN_SEPARATOR from the token contract (cached after first call).
 */
export async function getDomainSeparator(
  chainSlug: string,
  contractAddress: string,
): Promise<`0x${string}`> {
  const key = `${chainSlug}:${contractAddress.toLowerCase()}`;
  const cached = _dsCache.get(key);
  if (cached) return cached;

  const client = getPublicClient(chainSlug);
  const ds = await client.readContract({
    address: contractAddress as `0x${string}`,
    abi: DOMAIN_SEPARATOR_ABI,
    functionName: "DOMAIN_SEPARATOR",
  });
  _dsCache.set(key, ds);
  return ds;
}
