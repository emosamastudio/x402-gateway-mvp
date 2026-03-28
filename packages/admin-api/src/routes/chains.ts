import { Hono } from "hono";
import { CreateChainSchema } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import { registerChain, unregisterChain } from "@x402-gateway-mvp/chain";

export const chainsRouter = new Hono();

// List all chains
chainsRouter.get("/", (c) => {
  return c.json(getDb().listChains());
});

// Get single chain
chainsRouter.get("/:id", (c) => {
  const chain = getDb().getChain(c.req.param("id"));
  if (!chain) return c.json({ error: "Chain not found" }, 404);
  return c.json(chain);
});

// Create chain
chainsRouter.post("/", async (c) => {
  const parsed = CreateChainSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 400);
  }
  const data = parsed.data;
  const db = getDb();
  if (db.getChain(data.id)) {
    return c.json({ error: `Chain "${data.id}" already exists` }, 409);
  }
  const chain = { ...data, createdAt: Date.now() };
  db.insertChain(chain);
  registerChain(chain); // Update runtime registry
  return c.json(chain, 201);
});

// Update chain
chainsRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getDb();
  const existing = db.getChain(id);
  if (!existing) return c.json({ error: "Chain not found" }, 404);

  const ok = db.updateChain(id, body);
  if (!ok) return c.json({ error: "No fields updated" }, 400);

  // Reload into registry
  const updated = db.getChain(id)!;
  registerChain(updated);
  return c.json(updated);
});

// Delete chain
chainsRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  // Check if any tokens reference this chain
  const tokens = db.listTokens().filter((t) => t.chainSlug === id);
  if (tokens.length > 0) {
    return c.json({
      error: `Cannot delete: ${tokens.length} token(s) reference this chain`,
      tokens: tokens.map((t) => t.id),
    }, 409);
  }
  const ok = db.deleteChain(id);
  if (!ok) return c.json({ error: "Chain not found" }, 404);
  unregisterChain(id);
  return c.json({ deleted: true });
});
