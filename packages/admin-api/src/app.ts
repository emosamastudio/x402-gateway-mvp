import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { servicesRouter } from "./routes/services.js";
import { paymentsRouter } from "./routes/payments.js";
import { agentsRouter } from "./routes/agents.js";

export function createAdminApp() {
  const app = new Hono();
  app.use("*", logger());
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/services", servicesRouter);
  app.route("/payments", paymentsRouter);
  app.route("/agents", agentsRouter);

  return app;
}
