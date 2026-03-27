import { Hono } from "hono";
import { randomUUID } from "crypto";
import { CreateServiceSchema } from "@x402-gateway/shared";
import { getDb } from "@x402-gateway/core/src/db.js";

export const servicesRouter = new Hono();

servicesRouter.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = CreateServiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();
  const service = {
    ...parsed.data,
    id: `svc_${randomUUID()}`,
    priceCurrency: "USDC" as const,
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
