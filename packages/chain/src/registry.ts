/**
 * Runtime chain/token registry.
 *
 * Populated at app startup from the DB (core calls registerChain/registerToken).
 * All chain operations (RPC client, domain separator, identity check) look up
 * config from here instead of reading hardcoded constants.
 */

import { defineChain, type Chain } from "viem";
import type { ChainConfig, TokenConfig } from "@x402-gateway-mvp/shared";

const _chains = new Map<string, ChainConfig>();
const _viemChains = new Map<string, Chain>();
const _tokens = new Map<string, TokenConfig>();

/* ── Mutators (called at startup & after admin CRUD) ── */

export function registerChain(config: ChainConfig): void {
  _chains.set(config.id, config);
  _viemChains.set(
    config.id,
    defineChain({
      id: config.chainId,
      name: config.name,
      nativeCurrency: {
        name: config.nativeCurrency,
        symbol: config.nativeCurrency,
        decimals: 18,
      },
      rpcUrls: { default: { http: [config.rpcUrl] } },
      ...(config.explorerUrl
        ? {
            blockExplorers: {
              default: { name: "Explorer", url: config.explorerUrl },
            },
          }
        : {}),
      testnet: config.isTestnet,
    }),
  );
}

export function registerToken(config: TokenConfig): void {
  _tokens.set(config.id, config);
}

export function unregisterChain(id: string): void {
  _chains.delete(id);
  _viemChains.delete(id);
}

export function unregisterToken(id: string): void {
  _tokens.delete(id);
}

export function clearRegistry(): void {
  _chains.clear();
  _viemChains.clear();
  _tokens.clear();
}

/* ── Accessors ── */

export function getChainConfig(slug: string): ChainConfig {
  const c = _chains.get(slug);
  if (!c) throw new Error(`Chain "${slug}" not registered. Load chains from DB first.`);
  return c;
}

export function getViemChain(slug: string): Chain {
  const c = _viemChains.get(slug);
  if (!c) throw new Error(`Chain "${slug}" not registered.`);
  return c;
}

export function getTokenConfig(id: string): TokenConfig {
  const t = _tokens.get(id);
  if (!t) throw new Error(`Token "${id}" not registered. Load tokens from DB first.`);
  return t;
}

export function findTokenByChainAndSymbol(
  chainSlug: string,
  symbol: string,
): TokenConfig | undefined {
  return [..._tokens.values()].find(
    (t) =>
      t.chainSlug === chainSlug &&
      t.symbol.toLowerCase() === symbol.toLowerCase(),
  );
}

export function getTokensByChain(chainSlug: string): TokenConfig[] {
  return [..._tokens.values()].filter((t) => t.chainSlug === chainSlug);
}

export function getAllChains(): ChainConfig[] {
  return [..._chains.values()];
}

export function getAllTokens(): TokenConfig[] {
  return [..._tokens.values()];
}
