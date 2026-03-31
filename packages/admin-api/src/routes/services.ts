import { Hono } from "hono";
import { randomUUID } from "crypto";
import { CreateServiceSchema } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

export const servicesRouter = new Hono();

servicesRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = CreateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  // Provider validation
  const providerId = parsed.data.providerId ?? "";
  if (providerId) {
    const prov = db.getProvider(providerId);
    if (!prov) return c.json({ error: `Provider "${providerId}" not found` }, 400);
  }

  const service = {
    id: `svc_${randomUUID()}`,
    providerId,
    name: parsed.data.name,
    backendUrl: parsed.data.backendUrl,
    apiKey: parsed.data.apiKey,
    minReputation: parsed.data.minReputation,
    createdAt: Date.now(),
  };
  db.insertService(service);
  return c.json(service, 201);
});

servicesRouter.get("/", (c) => {
  const db = getDb();
  return c.json(db.listServices());
});

servicesRouter.get("/:id", (c) => {
  const db = getDb();
  const service = db.getServiceById(c.req.param("id"));
  if (!service) return c.json({ error: "Service not found" }, 404);
  return c.json(service);
});

servicesRouter.put("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const existing = db.getServiceById(id);
  if (!existing) return c.json({ error: "Service not found" }, 404);

  const body = await c.req.json();
  const updates: Record<string, any> = {};
  const errors: string[] = [];

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.length < 1 || body.name.length > 100) {
      errors.push("name must be 1-100 characters");
    } else { updates.name = body.name; }
  }
  if (body.backendUrl !== undefined) {
    try { new URL(body.backendUrl); updates.backendUrl = body.backendUrl; }
    catch { errors.push("backendUrl must be a valid URL"); }
  }
  if (body.providerId !== undefined) {
    if (typeof body.providerId !== "string") {
      errors.push("providerId must be a string");
    } else if (body.providerId) {
      const prov = db.getProvider(body.providerId);
      if (!prov) errors.push(`providerId "${body.providerId}" not found`);
      else updates.providerId = body.providerId;
    } else {
      updates.providerId = "";
    }
  }
  if (body.apiKey !== undefined) {
    if (typeof body.apiKey !== "string") {
      errors.push("apiKey must be a string");
    } else { updates.apiKey = body.apiKey; }
  }
  if (body.minReputation !== undefined) {
    if (typeof body.minReputation !== "number" || body.minReputation < 0 || !Number.isInteger(body.minReputation)) {
      errors.push("minReputation must be a non-negative integer");
    } else { updates.minReputation = body.minReputation; }
  }

  if (errors.length > 0) return c.json({ error: "Invalid input", details: errors }, 400);
  if (Object.keys(updates).length === 0) return c.json({ error: "At least one field required" }, 400);

  db.updateService(id, updates);
  const updated = db.getServiceById(id);
  return c.json(updated);
});

servicesRouter.delete("/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const deleted = db.deleteService(id);
  if (!deleted) return c.json({ error: "Service not found" }, 404);
  return c.json({ ok: true });
});
