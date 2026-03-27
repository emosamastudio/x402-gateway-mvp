import { Hono } from "hono";
import { checkAgentIdentity } from "@x402-gateway/chain";
import { NetworkSchema } from "@x402-gateway/shared";
import { getDb } from "@x402-gateway/core/src/db.js";

export const agentsRouter = new Hono();

agentsRouter.get("/:address", async (c) => {
  const address = c.req.param("address").toLowerCase();
  const networkParsed = NetworkSchema.safeParse(c.req.query("network") ?? "base-sepolia");
  if (!networkParsed.success) {
    return c.json({ error: "Invalid network. Must be base-sepolia or polygon-amoy" }, 400);
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
