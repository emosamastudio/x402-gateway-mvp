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
  "base-sepolia": "0xdeadbeef",
  "polygon-amoy": "0xdeadbeef",
};

vi.mock("../networks.js", () => ({
  get ERC8004_IDENTITY_ADDRESSES() {
    return mockAddresses;
  },
  USDC_ADDRESSES: {
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "polygon-amoy": "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  },
  CHAINS: {},
  CHAIN_IDS: { "base-sepolia": 84532, "polygon-amoy": 80002 },
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

    const result = await checkAgentIdentity("0xabc", "base-sepolia");
    expect(result.isRegistered).toBe(true);
    expect(result.reputation).toBe(75);
  });

  it("returns registered=true when ERC8004_MOCK=true", async () => {
    process.env.ERC8004_MOCK = "true";
    const result = await checkAgentIdentity("0xabc", "base-sepolia");
    expect(result.isRegistered).toBe(true); // mock always passes
    expect(result.reputation).toBe(100);
    delete process.env.ERC8004_MOCK;
  });

  it("returns registered=false when no contract address configured", async () => {
    mockAddresses["base-sepolia"] = null;

    const result = await checkAgentIdentity("0xabc", "base-sepolia");
    expect(result.isRegistered).toBe(false);

    mockAddresses["base-sepolia"] = "0xdeadbeef"; // restore
  });
});
