import { Hono } from "hono";
import { verifyPayment } from "./verify.js";
import type { PaymentPayload, PaymentRequirement } from "@x402-gateway/shared";

export function createFacilitatorApp() {
  const app = new Hono();

  // POST /verify — called by core after receiving a payment signature
  app.post("/verify", async (c) => {
    const body = await c.req.json<{
      payload: PaymentPayload;
      requirement: PaymentRequirement;
    }>();

    const result = await verifyPayment(body.payload, body.requirement);
    return c.json(result, result.isValid ? 200 : 400);
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}
