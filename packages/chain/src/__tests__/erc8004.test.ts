import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAgentIdentity } from "../erc8004.js";

// Mock viem client so tests don't hit real chain
vi.mock("../client.js", () => ({
  getPublicClient: vi.fn(() => ({
    readContract: vi.fn(),
  })),
}));

// Provide a non-null contract address so tests reach the client calls
const mockAddresses: Record<string, string | null> = {
  "optimism-sepolia": "0xdeadbeef",
  "sepolia": "0xdeadbeef",
};

// Mock registry so tests don't require DB-loaded chains
vi.mock("../registry.js", () => ({
  getChainConfig: vi.fn((slug: string) => ({
    id: slug,
    name: "Test Chain",
    chainId: slug === "optimism-sepolia" ? 11155420 : 11155111,
    rpcUrl: "http://localhost:8545",
    explorerUrl: "",
    isTestnet: true,
    nativeCurrency: "ETH",
    get erc8004Identity() { return mockAddresses[slug] ?? ""; },
    createdAt: 0,
  })),
  getAllChains: vi.fn(() => []),
}));

import { getPublicClient } from "../client.js";

describe("checkAgentIdentity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns registered=true and reputation when agent is registered", async () => {
    const mockClient = {
      readContract: vi.fn()
        .mockResolvedValueOnce(true)    // isRegistered
        .mockResolvedValueOnce(75n),    // reputation score
    };
    vi.mocked(getPublicClient).mockReturnValue(mockClient as any);

    const result = await checkAgentIdentity("0xabc", "optimism-sepolia");
    expect(result.isRegistered).toBe(true);
    expect(result.reputation).toBe(75);
  });

  it("returns registered=true when ERC8004_MOCK=true", async () => {
    process.env.ERC8004_MOCK = "true";
    const result = await checkAgentIdentity("0xabc", "optimism-sepolia");
    expect(result.isRegistered).toBe(true); // mock always passes
    expect(result.reputation).toBe(100);
    delete process.env.ERC8004_MOCK;
  });

  it("returns registered=false when no contract address configured", async () => {
    mockAddresses["optimism-sepolia"] = null;

    const result = await checkAgentIdentity("0xabc", "optimism-sepolia");
    expect(result.isRegistered).toBe(false);

    mockAddresses["optimism-sepolia"] = "0xdeadbeef"; // restore
  });
});
