import { Hono } from "hono";
import { getDb } from "@x402-gateway/core/src/db.js";

export const paymentsRouter = new Hono();

paymentsRouter.get("/", (c) => {
  const db = getDb();
  const serviceId = c.req.query("serviceId");
  return c.json(db.listPayments(serviceId));
});
