import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getChainConfig, getViemChain } from "./registry.js";
import { selectRpcUrl, selectRpcEndpoint, recordRpcCall, getRpcEndpoints } from "./rpc-health.js";

/**
 * Get the best RPC URL for a chain.
 * Uses health-aware routing if endpoints are registered, otherwise falls back to chain config.
 */
function getBestRpcUrl(chainSlug: string): string {
  const endpoints = getRpcEndpoints(chainSlug);
  if (endpoints.length > 0) {
    return selectRpcUrl(chainSlug);
  }
  // Fallback to chain config rpcUrl
  return getChainConfig(chainSlug).rpcUrl;
}

export function getPublicClient(chainSlug: string) {
  const rpcUrl = getBestRpcUrl(chainSlug);
  return createPublicClient({
    chain: getViemChain(chainSlug),
    transport: http(rpcUrl),
  });
}

export function getWalletClient(chainSlug: string) {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) throw new Error("FACILITATOR_PRIVATE_KEY not set");
  if (!privateKey.startsWith("0x")) throw new Error("FACILITATOR_PRIVATE_KEY must start with 0x");
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const rpcUrl = getBestRpcUrl(chainSlug);
  return createWalletClient({
    account,
    chain: getViemChain(chainSlug),
    transport: http(rpcUrl),
  });
}
