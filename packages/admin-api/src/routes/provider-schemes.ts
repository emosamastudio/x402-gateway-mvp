// packages/admin-api/src/routes/provider-schemes.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import { CreateServicePaymentSchemeSchema } from "@x402-gateway-mvp/shared";
import type { ProviderEnv } from "../middleware/provider-jwt.js";

export const providerSchemesRouter = new Hono<ProviderEnv>();

// GET /provider/services/:serviceId/schemes
providerSchemesRouter.get("/", async (c) => {
  const providerId = c.get("providerId");
  const serviceId = c.req.param("serviceId") as string;
  const db = getDb();
  const service = db.getServiceById(serviceId);
  if (!service || service.providerId !== providerId) {
    return c.json({ error: "Service not found" }, 404);
  }
  return c.json(db.listSchemesByService(serviceId));
});

// POST /provider/services/:serviceId/schemes
providerSchemesRouter.post("/", async (c) => {
  const providerId = c.get("providerId");
  const serviceId = c.req.param("serviceId") as string;
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service || service.providerId !== providerId) {
    return c.json({ error: "Service not found" }, 404);
  }

  const body = await c.req.json();
  const parsed = CreateServicePaymentSchemeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const { network, tokenId, priceAmount, recipient } = parsed.data;

  // Validate chain exists
  if (!db.getChain(network)) {
    return c.json({ error: `Chain "${network}" not found` }, 400);
  }

  // Validate token exists and is on the correct chain
  const token = db.getToken(tokenId);
  if (!token) {
    return c.json({ error: `Token "${tokenId}" not found` }, 400);
  }
  if (token.chainSlug !== network) {
    return c.json({ error: `Token "${tokenId}" is on chain "${token.chainSlug}", not "${network}"` }, 400);
  }

  // Default recipient to provider's wallet
  const provider = db.getProvider(providerId)!;
  const resolvedRecipient = recipient || provider.walletAddress;

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
      return c.json({ error: `A scheme for network "${network}" and token "${tokenId}" already exists for this service` }, 409);
    }
    throw e;
  }

  return c.json(scheme, 201);
});

// PUT /provider/services/:serviceId/schemes/:schemeId
providerSchemesRouter.put("/:schemeId", async (c) => {
  const providerId = c.get("providerId");
  const serviceId = c.req.param("serviceId") as string;
  const schemeId = c.req.param("schemeId") as string;
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service || service.providerId !== providerId) {
    return c.json({ error: "Service not found" }, 404);
  }

  const scheme = db.getScheme(schemeId);
  if (!scheme || scheme.serviceId !== serviceId) {
    return c.json({ error: "Scheme not found" }, 404);
  }

  const body = await c.req.json();
  const updates: Record<string, string> = {};
  if (body.priceAmount !== undefined) updates.priceAmount = String(body.priceAmount);
  if (body.recipient !== undefined) updates.recipient = String(body.recipient);

  db.updateScheme(schemeId, updates);
  return c.json(db.getScheme(schemeId));
});

// DELETE /provider/services/:serviceId/schemes/:schemeId
providerSchemesRouter.delete("/:schemeId", async (c) => {
  const providerId = c.get("providerId");
  const serviceId = c.req.param("serviceId") as string;
  const schemeId = c.req.param("schemeId") as string;
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service || service.providerId !== providerId) {
    return c.json({ error: "Service not found" }, 404);
  }

  const scheme = db.getScheme(schemeId);
  if (!scheme || scheme.serviceId !== serviceId) {
    return c.json({ error: "Scheme not found" }, 404);
  }

  db.deleteScheme(schemeId);
  return c.json({ ok: true });
});
