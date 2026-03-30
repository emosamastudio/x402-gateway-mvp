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

  // Validate chain exists
  if (!db.getChain(parsed.data.network)) {
    return c.json({ error: `Chain "${parsed.data.network}" not found. Create the chain first.` }, 400);
  }
  // Validate token exists and matches chain
  const token = db.getToken(parsed.data.tokenId);
  if (!token) {
    return c.json({ error: `Token "${parsed.data.tokenId}" not found. Create the token first.` }, 400);
  }
  if (token.chainSlug !== parsed.data.network) {
    return c.json({ error: `Token "${parsed.data.tokenId}" is on chain "${token.chainSlug}", not "${parsed.data.network}"` }, 400);
  }

  // Provider / recipient resolution
  let recipient = parsed.data.recipient ?? "";
  const providerId = parsed.data.providerId ?? "";
  if (providerId) {
    const prov = db.getProvider(providerId);
    if (!prov) return c.json({ error: `Provider "${providerId}" not found` }, 400);
    if (!recipient) recipient = prov.walletAddress;
  } else {
    if (!recipient) return c.json({ error: "recipient is required when no providerId is provided" }, 400);
  }

  const service = {
    ...parsed.data,
    id: `svc_${randomUUID()}`,
    priceCurrency: token.symbol,
    recipient,
    providerId: providerId,
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

const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const PRICE_RE = /^\d+(\.\d{1,6})?$/;

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
  if (body.gatewayPath !== undefined) {
    if (typeof body.gatewayPath !== "string" || !body.gatewayPath.startsWith("/")) {
      errors.push("gatewayPath must start with /");
    } else { updates.gatewayPath = body.gatewayPath; }
  }
  if (body.backendUrl !== undefined) {
    try { new URL(body.backendUrl); updates.backendUrl = body.backendUrl; }
    catch { errors.push("backendUrl must be a valid URL"); }
  }
  if (body.priceAmount !== undefined) {
    if (typeof body.priceAmount !== "string" || !PRICE_RE.test(body.priceAmount)) {
      errors.push("priceAmount must be a decimal with at most 6 places");
    } else { updates.priceAmount = body.priceAmount; }
  }
  if (body.network !== undefined) {
    if (typeof body.network !== "string" || !db.getChain(body.network)) {
      errors.push(`network "${body.network}" not found`);
    } else { updates.network = body.network; }
  }
  if (body.tokenId !== undefined) {
    const tok = db.getToken(body.tokenId);
    if (!tok) {
      errors.push(`tokenId "${body.tokenId}" not found`);
    } else {
      const effectiveNetwork = updates.network ?? existing.network;
      if (tok.chainSlug !== effectiveNetwork) {
        errors.push(`Token "${body.tokenId}" is on chain "${tok.chainSlug}", not "${effectiveNetwork}"`);
      } else {
        updates.tokenId = body.tokenId;
        // Auto-sync priceCurrency when token changes
        updates.priceCurrency = tok.symbol;
      }
    }
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
  if (body.recipient !== undefined) {
    if (typeof body.recipient !== "string" || !EVM_ADDR_RE.test(body.recipient)) {
      errors.push("recipient must be a valid EVM address");
    } else { updates.recipient = body.recipient; }
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

  // If providerId updated and recipient not provided in this update, auto-fill recipient from provider
  if (updates.providerId !== undefined && updates.recipient === undefined && updates.providerId) {
    const prov = db.getProvider(updates.providerId);
    if (prov) updates.recipient = prov.walletAddress;
  }

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
