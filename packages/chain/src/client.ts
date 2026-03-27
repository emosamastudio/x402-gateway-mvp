import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "./networks.js";
import type { Network } from "@x402-gateway/shared";

const RPC_URLS: Record<Network, string> = {
  "base-sepolia": process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org",
  "polygon-amoy": process.env.POLYGON_AMOY_RPC ?? "https://rpc-amoy.polygon.technology",
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
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: CHAINS[network],
    transport: http(RPC_URLS[network]),
  });
}
