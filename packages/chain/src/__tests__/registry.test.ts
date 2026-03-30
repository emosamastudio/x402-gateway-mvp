import { describe, it, expect, beforeEach } from "vitest";
import {
  registerChain,
  registerToken,
  unregisterChain,
  unregisterToken,
  clearRegistry,
  getChainConfig,
  getViemChain,
  getTokenConfig,
  findTokenByChainAndSymbol,
  getTokensByChain,
  getAllChains,
  getAllTokens,
} from "../registry.js";
import type { ChainConfig, TokenConfig } from "@x402-gateway-mvp/shared";

const chain1: ChainConfig = {
  id: "optimism-sepolia",
  name: "Optimism Sepolia",
  chainId: 11155420,
  rpcUrl: "https://sepolia.optimism.io",
  explorerUrl: "https://sepolia-optimism.etherscan.io",
  isTestnet: true,
  nativeCurrency: "ETH",
  erc8004Identity: "",
  createdAt: 1000,
};

const chain2: ChainConfig = {
  id: "sepolia",
  name: "Ethereum Sepolia",
  chainId: 11155111,
  rpcUrl: "https://rpc.sepolia.org",
  explorerUrl: "",
  isTestnet: true,
  nativeCurrency: "ETH",
  erc8004Identity: "",
  createdAt: 2000,
};

const token1: TokenConfig = {
  id: "dmhkd-optimism-sepolia",
  symbol: "DMHKD",
  name: "DMHKD Stablecoin",
  chainSlug: "optimism-sepolia",
  contractAddress: "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
  decimals: 6,
  domainName: "DMHKD",
  domainVersion: "2",
  isActive: true,
  createdAt: 1000,
};

const token2: TokenConfig = {
  id: "usdc-sepolia",
  symbol: "USDC",
  name: "USD Coin",
  chainSlug: "sepolia",
  contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  decimals: 6,
  domainName: "USDC",
  domainVersion: "1",
  isActive: true,
  createdAt: 2000,
};

describe("chain registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe("registerChain / getChainConfig", () => {
    it("registers a chain and retrieves it", () => {
      registerChain(chain1);
      const c = getChainConfig("optimism-sepolia");
      expect(c.id).toBe("optimism-sepolia");
      expect(c.chainId).toBe(11155420);
    });

    it("throws when chain not registered", () => {
      expect(() => getChainConfig("unknown")).toThrow('Chain "unknown" not registered');
    });

    it("overwrites existing chain on re-register", () => {
      registerChain(chain1);
      const updated = { ...chain1, name: "Updated Name" };
      registerChain(updated);
      expect(getChainConfig("optimism-sepolia").name).toBe("Updated Name");
    });

    it("registers chain without explorerUrl", () => {
      registerChain(chain2); // explorerUrl is ""
      expect(getChainConfig("sepolia").explorerUrl).toBe("");
    });
  });

  describe("getViemChain", () => {
    it("returns a viem Chain object after registration", () => {
      registerChain(chain1);
      const viemChain = getViemChain("optimism-sepolia");
      expect(viemChain.id).toBe(11155420);
      expect(viemChain.name).toBe("Optimism Sepolia");
    });

    it("throws when chain not registered", () => {
      expect(() => getViemChain("unknown")).toThrow('Chain "unknown" not registered');
    });
  });

  describe("unregisterChain", () => {
    it("removes chain from registry", () => {
      registerChain(chain1);
      unregisterChain("optimism-sepolia");
      expect(() => getChainConfig("optimism-sepolia")).toThrow();
    });

    it("does not throw when unregistering non-existent chain", () => {
      expect(() => unregisterChain("ghost")).not.toThrow();
    });
  });

  describe("registerToken / getTokenConfig", () => {
    it("registers a token and retrieves it", () => {
      registerToken(token1);
      const t = getTokenConfig("dmhkd-optimism-sepolia");
      expect(t.symbol).toBe("DMHKD");
      expect(t.decimals).toBe(6);
    });

    it("throws when token not registered", () => {
      expect(() => getTokenConfig("unknown")).toThrow('Token "unknown" not registered');
    });
  });

  describe("unregisterToken", () => {
    it("removes token from registry", () => {
      registerToken(token1);
      unregisterToken("dmhkd-optimism-sepolia");
      expect(() => getTokenConfig("dmhkd-optimism-sepolia")).toThrow();
    });
  });

  describe("findTokenByChainAndSymbol", () => {
    it("finds token by chain and symbol (case-insensitive)", () => {
      registerToken(token1);
      registerToken(token2);
      expect(findTokenByChainAndSymbol("optimism-sepolia", "dmhkd")?.id).toBe("dmhkd-optimism-sepolia");
      expect(findTokenByChainAndSymbol("optimism-sepolia", "DMHKD")?.id).toBe("dmhkd-optimism-sepolia");
    });

    it("returns undefined when no match", () => {
      registerToken(token1);
      expect(findTokenByChainAndSymbol("sepolia", "DMHKD")).toBeUndefined();
      expect(findTokenByChainAndSymbol("optimism-sepolia", "USDC")).toBeUndefined();
    });
  });

  describe("getTokensByChain", () => {
    it("returns all tokens for a given chain", () => {
      registerToken(token1);
      registerToken(token2);
      const tokens = getTokensByChain("optimism-sepolia");
      expect(tokens).toHaveLength(1);
      expect(tokens[0].id).toBe("dmhkd-optimism-sepolia");
    });

    it("returns empty array when no tokens for chain", () => {
      expect(getTokensByChain("unknown-chain")).toHaveLength(0);
    });
  });

  describe("getAllChains / getAllTokens", () => {
    it("returns all registered chains", () => {
      registerChain(chain1);
      registerChain(chain2);
      expect(getAllChains()).toHaveLength(2);
    });

    it("returns empty array when no chains registered", () => {
      expect(getAllChains()).toHaveLength(0);
    });

    it("returns all registered tokens", () => {
      registerToken(token1);
      registerToken(token2);
      expect(getAllTokens()).toHaveLength(2);
    });
  });

  describe("clearRegistry", () => {
    it("removes all chains and tokens", () => {
      registerChain(chain1);
      registerToken(token1);
      clearRegistry();
      expect(getAllChains()).toHaveLength(0);
      expect(getAllTokens()).toHaveLength(0);
      expect(() => getChainConfig("optimism-sepolia")).toThrow();
    });
  });
});
