import { Hono } from "hono";
import { randomUUID } from "crypto";
import { CreateServiceProviderSchema, UpdateServiceProviderSchema } from "@x402-gateway-mvp/shared";
import type { ServiceProvider } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

export const providersRouter = new Hono();

/* ── POST /providers — Create ─────────────────────────────── */
providersRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = CreateServiceProviderSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);

  const db = getDb();

  // Check duplicate wallet address
  const existing = db.getProviderByWallet(parsed.data.walletAddress);
  if (existing) {
    return c.json({ error: `Wallet address already registered to provider "${existing.name}" (${existing.id})` }, 409);
  }

  const provider: ServiceProvider = {
    id: `prov_${randomUUID()}`,
    name: parsed.data.name,
    walletAddress: parsed.data.walletAddress,
    description: parsed.data.description,
    website: parsed.data.website,
    createdAt: Date.now(),
  };
  db.insertProvider(provider);
  return c.json(provider, 201);
});

/* ── GET /providers — List ────────────────────────────────── */
providersRouter.get("/", (c) => {
  const db = getDb();
  return c.json(db.listProviders());
});

/* ── GET /providers/:id — Detail ──────────────────────────── */
providersRouter.get("/:id", (c) => {
  const db = getDb();
  const p = db.getProvider(c.req.param("id"));
  if (!p) return c.json({ error: "Provider not found" }, 404);
  return c.json(p);
});

/* ── GET /providers/:id/services — Services of provider ───── */
providersRouter.get("/:id/services", (c) => {
  const db = getDb();
  const p = db.getProvider(c.req.param("id"));
  if (!p) return c.json({ error: "Provider not found" }, 404);
  return c.json(db.listServicesByProvider(p.id));
});

/* ── PUT /providers/:id — Update ──────────────────────────── */
providersRouter.put("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const existing = db.getProvider(id);
  if (!existing) return c.json({ error: "Provider not found" }, 404);

  const body = await c.req.json();
  const parsed = UpdateServiceProviderSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);

  const updates = parsed.data;

  // Check duplicate wallet address if changing
  if (updates.walletAddress && updates.walletAddress.toLowerCase() !== existing.walletAddress.toLowerCase()) {
    const dup = db.getProviderByWallet(updates.walletAddress);
    if (dup) {
      return c.json({ error: `Wallet address already registered to provider "${dup.name}" (${dup.id})` }, 409);
    }
  }

  db.updateProvider(id, updates);

  // If wallet changed, auto-update recipient on schemes that used the OLD wallet
  if (updates.walletAddress && updates.walletAddress.toLowerCase() !== existing.walletAddress.toLowerCase()) {
    const svcs = db.listServicesByProvider(id);
    for (const svc of svcs) {
      const schemes = db.listSchemesByService(svc.id);
      for (const scheme of schemes) {
        if (scheme.recipient.toLowerCase() === existing.walletAddress.toLowerCase()) {
          db.updateScheme(scheme.id, { recipient: updates.walletAddress });
        }
      }
    }
  }

  return c.json(db.getProvider(id));
});

/* ── DELETE /providers/:id — Delete ───────────────────────── */
providersRouter.delete("/:id", (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const existing = db.getProvider(id);
  if (!existing) return c.json({ error: "Provider not found" }, 404);

  // Check for associated services
  const svcs = db.listServicesByProvider(id);
  if (svcs.length > 0) {
    return c.json({
      error: `Cannot delete: provider has ${svcs.length} associated service(s). Remove or reassign them first.`,
      services: svcs.map((s) => ({ id: s.id, name: s.name })),
    }, 409);
  }

  db.deleteProvider(id);
  return c.json({ ok: true });
});
