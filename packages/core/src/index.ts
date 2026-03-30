import { serve } from "@hono/node-server";
import { registerChain, registerToken, registerRpcEndpoints, startHealthChecker } from "@x402-gateway-mvp/chain";
import { globalNonceStore } from "@x402-gateway-mvp/facilitator";
import { getDb } from "./db.js";
import { createCoreApp } from "./app.js";

// Seed default chains, tokens, and RPC endpoints from env vars on first run.
// Only inserts rows that don't already exist — safe to call on every startup.
function seedFromEnv(db: ReturnType<typeof getDb>): void {
  const now = Date.now();

  const CHAINS = [
    {
      id: "optimism-sepolia",
      name: "Optimism Sepolia",
      chainId: 11155420,
      rpcEnvKey: "OPTIMISM_SEPOLIA_RPC",
      defaultRpc: "https://sepolia.optimism.io",
      explorerUrl: "https://sepolia-optimism.etherscan.io",
      dmhkdEnvKey: "OPTIMISM_SEPOLIA_DMHKD",
      defaultDmhkd: "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
      erc8004EnvKey: "OPTIMISM_SEPOLIA_ERC8004_IDENTITY",
    },
    {
      id: "sepolia",
      name: "Ethereum Sepolia",
      chainId: 11155111,
      rpcEnvKey: "SEPOLIA_RPC",
      defaultRpc: "https://rpc.sepolia.org",
      explorerUrl: "https://sepolia.etherscan.io",
      dmhkdEnvKey: "SEPOLIA_DMHKD",
      defaultDmhkd: "0x1aA90392c804343C7854DD700f50a48961B71c53",
      erc8004EnvKey: "SEPOLIA_ERC8004_IDENTITY",
    },
  ] as const;

  for (const def of CHAINS) {
    const rpcUrl = process.env[def.rpcEnvKey] || def.defaultRpc;
    const erc8004Identity = process.env[def.erc8004EnvKey] || "";

    // Seed chain record
    if (!db.getChain(def.id)) {
      db.insertChain({
        id: def.id, name: def.name, chainId: def.chainId,
        rpcUrl, explorerUrl: def.explorerUrl,
        isTestnet: true, nativeCurrency: "ETH",
        erc8004Identity, createdAt: now,
      });
      console.log(`[seed] chain: ${def.id}  rpc: ${rpcUrl}`);
    }

    // Seed primary RPC endpoint (only if chain has none)
    if (db.listRpcEndpoints(def.id).length === 0) {
      db.insertRpcEndpoint({
        id: `${def.id}-primary`, chainSlug: def.id,
        url: rpcUrl, label: "Primary", priority: 0,
        isActive: true, healthStatus: "unknown",
        lastHealthCheck: 0, lastLatency: 0,
        totalRequests: 0, totalErrors: 0, createdAt: now,
      });
      console.log(`[seed] rpc-endpoint: ${def.id}  -> ${rpcUrl}`);
    }

    // Seed DMHKD token
    const tokenId = `dmhkd-${def.id}`;
    const contractAddress = process.env[def.dmhkdEnvKey] || def.defaultDmhkd;
    if (!db.getToken(tokenId)) {
      db.insertToken({
        id: tokenId, symbol: "DMHKD", name: "DMHKD Stablecoin",
        chainSlug: def.id, contractAddress, decimals: 6,
        domainName: "DMHKD", domainVersion: "2",
        isActive: true, createdAt: now,
      });
      console.log(`[seed] token: ${tokenId}  contract: ${contractAddress}`);
    }
  }
}

// Populate chain/token registry from DB before handling requests
const db = getDb();
seedFromEnv(db);
for (const chain of db.listChains()) registerChain(chain);
for (const token of db.listTokens()) registerToken(token);

// Wire nonce store to SQLite (replay protection survives restarts)
globalNonceStore.setDb(db);

// Prune nonces older than 24h on startup (ERC-3009 validBefore is typically short)
db.pruneExpiredNonces(24 * 3600_000);

// Populate RPC endpoints and start health checker
const allEndpoints = db.listRpcEndpoints();
registerRpcEndpoints(allEndpoints);
startHealthChecker({
  intervalMs: 30_000,
  persist: (id, updates) => {
    try { db.updateRpcEndpoint(id, updates); } catch { /* ignore persist errors */ }
  },
  recordStats: (id, isError) => {
    try { db.incrementRpcStats(id, isError); } catch { /* ignore */ }
  },
  snapshotStats: (endpointId, chainSlug, snap) => {
    try {
      db.insertRpcStatsSnapshot({ endpointId, chainSlug, ...snap });
      // Prune snapshots older than 24 hours (run every cycle)
      db.pruneRpcStatsHistory(24 * 3600_000);
    } catch { /* ignore */ }
  },
});
console.log(`[rpc-health] Registered ${allEndpoints.length} RPC endpoint(s), health checks every 30s`);

const port = Number(process.env.CORE_PORT ?? 8402);
const app = createCoreApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`x402 Gateway running on :${port}`);
});
