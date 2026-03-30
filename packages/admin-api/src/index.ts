import { serve } from "@hono/node-server";
import { createAdminApp } from "./app.js";
import { registerChain, registerToken, registerRpcEndpoints, configureHealthCallbacks } from "@x402-gateway-mvp/chain";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

// Initialize runtime registries from DB — same data the core process uses.
// admin-api is a separate process so it has its own in-memory state.
const db = getDb();
for (const chain of db.listChains()) registerChain(chain);
for (const token of db.listTokens()) registerToken(token);

// Populate RPC endpoint map and wire persist callback.
// This enables manual health checks from the admin UI (POST /rpc-endpoints/health-check)
// and ensures triggerHealthCheck() writes results back to the database.
const allEndpoints = db.listRpcEndpoints();
registerRpcEndpoints(allEndpoints);
configureHealthCallbacks({
  persist: (id, updates) => { try { db.updateRpcEndpoint(id, updates); } catch { /* ignore */ } },
  snapshotStats: (endpointId, chainSlug, snap) => {
    try {
      db.insertRpcStatsSnapshot({ endpointId, chainSlug, ...snap });
      db.pruneRpcStatsHistory(24 * 3600_000);
    } catch { /* ignore */ }
  },
});

const port = Number(process.env.ADMIN_PORT ?? 8403);
const app = createAdminApp();
serve({ fetch: app.fetch, port }, () => {
  console.log(`Admin API running on :${port}`);
});
