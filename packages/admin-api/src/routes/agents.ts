import { Hono } from "hono";
import { checkAgentIdentity } from "@x402-gateway-mvp/chain";
import { NetworkSchema } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

export const agentsRouter = new Hono();

// List all cached agents with their activity stats
agentsRouter.get("/", (c) => {
  const db = getDb();
  const agents = db.listAgentCache();
  const result = agents.map((a) => ({
    ...a,
    stats: db.getAgentStats(a.address),
  }));
  return c.json(result);
});

// Get activity stats for a specific agent
agentsRouter.get("/:address/stats", (c) => {
  const address = c.req.param("address").toLowerCase();
  const db = getDb();
  const cached = db.getAgentCache(address);
  const stats = db.getAgentStats(address);
  return c.json({ address, cached, stats });
});

// Lookup agent identity from chain (with cache)
agentsRouter.get("/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const networkParsed = NetworkSchema.safeParse(c.req.query("network") ?? "optimism-sepolia");
  if (!networkParsed.success) {
    return c.json({ error: "Invalid network. Must be optimism-sepolia or sepolia" }, 400);
  }
  const network = networkParsed.data;

  // Return cached data if fresh (< 1 min)
  const db = getDb();
  const cached = db.getAgentCache(address);
  if (cached && Date.now() - cached.cachedAt < 60_000) {
    return c.json(cached);
  }

  const info = await checkAgentIdentity(address, network);
  const result = { address, ...info, cachedAt: Date.now() };
  db.upsertAgentCache(result);
  return c.json(result);
});
