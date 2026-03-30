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

  // Validate updatable fields
  const allowed: Record<string, (v: unknown) => string | null> = {
    name: (v) => (typeof v === "string" && v.length >= 1 && v.length <= 100) ? null : "name must be 1-100 characters",
    chainId: (v) => (Number.isInteger(v) && (v as number) > 0) ? null : "chainId must be a positive integer",
    rpcUrl: (v) => { try { const u = new URL(v as string); return ["http:", "https:"].includes(u.protocol) ? null : "rpcUrl must be http or https"; } catch { return "rpcUrl must be a valid URL"; } },
    explorerUrl: (v) => (v === "" || (() => { try { new URL(v as string); return true; } catch { return false; } })()) ? null : "explorerUrl must be a valid URL or empty string",
    isTestnet: (v) => typeof v === "boolean" ? null : "isTestnet must be a boolean",
    nativeCurrency: (v) => (typeof v === "string" && v.length >= 1 && v.length <= 20) ? null : "nativeCurrency must be 1-20 characters",
    erc8004Identity: (v) => typeof v === "string" ? null : "erc8004Identity must be a string",
  };

  const updates: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const [key, validate] of Object.entries(allowed)) {
    if (body[key] !== undefined) {
      const err = validate(body[key]);
      if (err) errors.push(err);
      else updates[key] = body[key];
    }
  }
  if (errors.length > 0) return c.json({ error: "Invalid input", details: errors }, 400);

  const ok = db.updateChain(id, updates as any);
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
