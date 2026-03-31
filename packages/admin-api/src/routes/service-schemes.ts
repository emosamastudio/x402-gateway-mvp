// packages/admin-api/src/routes/service-schemes.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import { CreateServicePaymentSchemeSchema } from "@x402-gateway-mvp/shared";

export const serviceSchemesRouter = new Hono();

// GET /services/:id/schemes
serviceSchemesRouter.get("/", (c) => {
  const serviceId = c.req.param("id") as string;
  const db = getDb();
  return c.json(db.listSchemesByService(serviceId));
});

// POST /services/:id/schemes
serviceSchemesRouter.post("/", async (c) => {
  const serviceId = c.req.param("id") as string;
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service) return c.json({ error: "Service not found" }, 404);

  const body = await c.req.json();
  const parsed = CreateServicePaymentSchemeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const { network, tokenId, priceAmount, recipient } = parsed.data;

  if (!db.getChain(network)) return c.json({ error: `Chain "${network}" not found` }, 400);
  const token = db.getToken(tokenId);
  if (!token) return c.json({ error: `Token "${tokenId}" not found` }, 400);
  if (token.chainSlug !== network) return c.json({ error: `Token "${tokenId}" is on chain "${token.chainSlug}"` }, 400);

  const resolvedRecipient = recipient || (service.providerId ? db.getProvider(service.providerId)?.walletAddress ?? "" : "");
  if (!resolvedRecipient) return c.json({ error: "recipient is required (no provider wallet to default to)" }, 400);

  const scheme = {
    id: `scheme_${randomUUID()}`,
    serviceId,
    network,
    tokenId,
    priceAmount,
    priceCurrency: token.symbol,
    recipient: resolvedRecipient,
    createdAt: Date.now(),
  };

  try {
    db.insertScheme(scheme);
  } catch (e: any) {
    if (e?.message?.includes("UNIQUE constraint failed")) {
      return c.json({ error: "Scheme already exists for this network/token" }, 409);
    }
    throw e;
  }

  return c.json(scheme, 201);
});

// PUT /services/:id/schemes/:schemeId
serviceSchemesRouter.put("/:schemeId", async (c) => {
  const serviceId = c.req.param("id") as string;
  const schemeId = c.req.param("schemeId") as string;
  const db = getDb();

  const scheme = db.getScheme(schemeId);
  if (!scheme || scheme.serviceId !== serviceId) return c.json({ error: "Scheme not found" }, 404);

  const body = await c.req.json();
  const updates: Record<string, string> = {};
  if (body.priceAmount !== undefined) updates.priceAmount = String(body.priceAmount);
  if (body.recipient !== undefined) updates.recipient = String(body.recipient);

  db.updateScheme(schemeId, updates);
  return c.json(db.getScheme(schemeId));
});

// DELETE /services/:id/schemes/:schemeId
serviceSchemesRouter.delete("/:schemeId", async (c) => {
  const serviceId = c.req.param("id") as string;
  const schemeId = c.req.param("schemeId") as string;
  const db = getDb();

  const scheme = db.getScheme(schemeId);
  if (!scheme || scheme.serviceId !== serviceId) return c.json({ error: "Scheme not found" }, 404);

  db.deleteScheme(schemeId);
  return c.json({ ok: true });
});
