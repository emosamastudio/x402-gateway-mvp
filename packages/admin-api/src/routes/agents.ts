import { Hono } from "hono";
import { checkAgentIdentity } from "@x402-gateway/chain";
import type { Network } from "@x402-gateway/shared";
import { getDb } from "@x402-gateway/core/src/db.js";

export const agentsRouter = new Hono();

agentsRouter.get("/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const network = (c.req.query("network") ?? "base-sepolia") as Network;

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
