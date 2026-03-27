import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "./networks.js";
import type { Network } from "@x402-gateway/shared";

const RPC_URLS: Record<Network, string> = {
  "optimism-sepolia": process.env.OPTIMISM_SEPOLIA_RPC ?? "https://sepolia.optimism.io",
  "sepolia": process.env.SEPOLIA_RPC ?? "https://rpc.sepolia.org",
};

export function getPublicClient(network: Network) {
  return createPublicClient({
    chain: CHAINS[network],
    transport: http(RPC_URLS[network]),
  });
}

export function getWalletClient(network: Network) {
  const privateKey = process.env.FACILITATOR_PRIVATE_KEY;
  if (!privateKey) throw new Error("FACILITATOR_PRIVATE_KEY not set");
  if (!privateKey.startsWith("0x")) throw new Error("FACILITATOR_PRIVATE_KEY must start with 0x");
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: CHAINS[network],
    transport: http(RPC_URLS[network]),
  });
}
