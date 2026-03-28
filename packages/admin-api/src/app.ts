import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { servicesRouter } from "./routes/services.js";
import { providersRouter } from "./routes/providers.js";
import { paymentsRouter } from "./routes/payments.js";
import { requestsRouter } from "./routes/requests.js";
import { agentsRouter } from "./routes/agents.js";
import { chainsRouter } from "./routes/chains.js";
import { tokensRouter } from "./routes/tokens.js";
import { rpcEndpointsRouter } from "./routes/rpc-endpoints.js";

export function createAdminApp() {
  const app = new Hono();
  app.use("*", logger());
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Require API key for all non-health routes
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    console.warn("⚠️  ADMIN_API_KEY not set — admin API is unauthenticated. Set ADMIN_API_KEY in production.");
  } else {
    app.use("*", async (c, next) => {
      const key = c.req.header("Authorization")?.replace("Bearer ", "");
      if (key !== adminApiKey) return c.json({ error: "Unauthorized" }, 401);
      await next();
    });
  }

  app.route("/services", servicesRouter);
  app.route("/providers", providersRouter);
  app.route("/payments", paymentsRouter);
  app.route("/requests", requestsRouter);
  app.route("/agents", agentsRouter);
  app.route("/chains", chainsRouter);
  app.route("/tokens", tokensRouter);
  app.route("/rpc-endpoints", rpcEndpointsRouter);

  return app;
}
