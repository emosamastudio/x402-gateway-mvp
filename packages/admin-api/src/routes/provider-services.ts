// packages/admin-api/src/routes/provider-services.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { CreateServiceSchema } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import type { ProviderEnv } from "../middleware/provider-jwt.js";

export const providerServicesRouter = new Hono<ProviderEnv>();

// GET /provider/services
providerServicesRouter.get("/", (c) => {
  const providerId = c.get("providerId") as string;
  const db = getDb();
  return c.json(db.listServicesByProvider(providerId));
});

// POST /provider/services
providerServicesRouter.post("/", async (c) => {
  const providerId = c.get("providerId") as string;
  const body = await c.req.json();

  // Force providerId to be the authenticated provider
  const parsed = CreateServiceSchema.safeParse({ ...body, providerId });
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  if (!db.getChain(parsed.data.network)) {
    return c.json({ error: `Chain "${parsed.data.network}" not found` }, 400);
  }
  const token = db.getToken(parsed.data.tokenId);
  if (!token) {
    return c.json({ error: `Token "${parsed.data.tokenId}" not found` }, 400);
  }
  if (token.chainSlug !== parsed.data.network) {
    return c.json({ error: `Token "${parsed.data.tokenId}" is on chain "${token.chainSlug}", not "${parsed.data.network}"` }, 400);
  }

  const provider = db.getProvider(providerId)!;
  const recipient = parsed.data.recipient || provider.walletAddress;

  const service = {
    ...parsed.data,
    id: `svc_${randomUUID()}`,
    priceCurrency: token.symbol,
    providerId,
    recipient,
    createdAt: Date.now(),
  };
  db.insertService(service);
  return c.json(service, 201);
});

// PUT /provider/services/:id
providerServicesRouter.put("/:id", async (c) => {
  const providerId = c.get("providerId") as string;
  const serviceId = c.req.param("id");
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service) return c.json({ error: "Service not found" }, 404);
  if (service.providerId !== providerId) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const allowed = ["name", "backendUrl", "priceAmount", "apiKey", "minReputation", "recipient"];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  db.updateService(serviceId, updates);
  return c.json(db.getServiceById(serviceId));
});

// DELETE /provider/services/:id
providerServicesRouter.delete("/:id", (c) => {
  const providerId = c.get("providerId") as string;
  const serviceId = c.req.param("id");
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service) return c.json({ error: "Service not found" }, 404);
  if (service.providerId !== providerId) return c.json({ error: "Forbidden" }, 403);

  db.deleteService(serviceId);
  return c.json({ ok: true });
});
