import { serve } from "@hono/node-server";
import { registerChain, registerToken, registerRpcEndpoints, startHealthChecker } from "@x402-gateway-mvp/chain";
import { globalNonceStore } from "@x402-gateway-mvp/facilitator";
import { getDb } from "./db.js";
import { createCoreApp } from "./app.js";

// Populate chain/token registry from DB before handling requests
const db = getDb();
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
