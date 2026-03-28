import type { AgentInfo } from "@x402-gateway-mvp/shared";
import { getChainConfig, getAllChains } from "./registry.js";
import { getPublicClient } from "./client.js";

const ERC8004_IDENTITY_ABI = [
  {
    name: "isRegistered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "getReputationScore",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export async function checkAgentIdentity(
  agentAddress: string,
  chainSlug: string,
): Promise<Omit<AgentInfo, "address" | "cachedAt">> {
  // Mock mode: bypass all chain checks (dev/testing)
  if (process.env.ERC8004_MOCK === "true") {
    return { isRegistered: true, reputation: 100 };
  }

  const chainConfig = getChainConfig(chainSlug);
  const contractAddress = chainConfig.erc8004Identity;

  // No contract deployed on this chain — treat as not registered
  if (!contractAddress) {
    return { isRegistered: false, reputation: 0 };
  }

  const client = getPublicClient(chainSlug);

  try {
    const [isRegistered, reputationBigInt] = await Promise.all([
      client.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "isRegistered",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contractAddress as `0x${string}`,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "getReputationScore",
        args: [agentAddress as `0x${string}`],
      }),
    ]);

    return {
      isRegistered: isRegistered as boolean,
      reputation: Number(reputationBigInt as bigint),
    };
  } catch {
    return { isRegistered: false, reputation: 0 };
  }
}

export async function checkProviderIdentityAllChains(walletAddress: string) {
  const chains = getAllChains();
  const results: Array<{ chainSlug: string; isRegistered: boolean; reputation: number }> = [];
  await Promise.all(chains.map(async (c) => {
    try {
      const res = await checkAgentIdentity(walletAddress, c.id);
      results.push({ chainSlug: c.id, isRegistered: res.isRegistered, reputation: res.reputation });
    } catch {
      results.push({ chainSlug: c.id, isRegistered: false, reputation: 0 });
    }
  }));
  return results;
}
