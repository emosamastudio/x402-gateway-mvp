// packages/admin-api/src/routes/provider-me.ts
import { Hono } from "hono";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import type { ProviderEnv } from "../middleware/provider-jwt.js";

export const providerMeRouter = new Hono<ProviderEnv>();

// GET /provider/me
providerMeRouter.get("/", (c) => {
  const providerId = c.get("providerId") as string;
  const db = getDb();
  const provider = db.getProvider(providerId);
  if (!provider) return c.json({ error: "Provider not found" }, 404);
  return c.json(provider);
});

// PUT /provider/me  { name?, description?, website? }
providerMeRouter.put("/", async (c) => {
  const providerId = c.get("providerId") as string;
  const body = await c.req.json();
  const { name, description, website } = body;

  if (name !== undefined && typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }
  if (name !== undefined && name.trim() === "") {
    return c.json({ error: "name cannot be empty" }, 400);
  }

  const db = getDb();
  const updates: Record<string, string> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = String(description);
  if (website !== undefined) updates.website = String(website);

  db.updateProvider(providerId, updates);
  return c.json(db.getProvider(providerId));
});
