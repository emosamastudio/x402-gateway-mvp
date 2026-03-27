import type { Network, AgentInfo } from "@x402-gateway/shared";
import { getPublicClient } from "./client.js";
import { ERC8004_IDENTITY_ADDRESSES } from "./networks.js";

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
  network: Network
): Promise<Omit<AgentInfo, "address" | "cachedAt">> {
  // Mock mode: bypass all chain checks (dev/testing)
  if (process.env.ERC8004_MOCK === "true") {
    return { isRegistered: true, reputation: 100 };
  }

  const contractAddress = ERC8004_IDENTITY_ADDRESSES[network];

  // No contract deployed on this testnet — treat as not registered
  if (!contractAddress) {
    return { isRegistered: false, reputation: 0 };
  }

  const client = getPublicClient(network);

  try {
    const [isRegistered, reputationBigInt] = await Promise.all([
      client.readContract({
        address: contractAddress,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "isRegistered",
        args: [agentAddress as `0x${string}`],
      }),
      client.readContract({
        address: contractAddress,
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
