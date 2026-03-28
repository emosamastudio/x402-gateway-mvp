import { Hono } from "hono";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

export const requestsRouter = new Hono();

requestsRouter.get("/", (c) => {
  const db = getDb();
  const serviceId = c.req.query("serviceId");
  const status = c.req.query("status");
  return c.json(db.listRequests(serviceId, status));
});
