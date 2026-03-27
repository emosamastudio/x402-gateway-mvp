import { Hono } from "hono";
import { verifyPayment } from "./verify.js";
import { PaymentPayloadSchema } from "@x402-gateway/shared";
import type { PaymentRequirement } from "@x402-gateway/shared";

export function createFacilitatorApp() {
  const app = new Hono();

  // POST /verify — called by core after receiving a payment signature
  app.post("/verify", async (c) => {
    const body = await c.req.json<{
      payload: unknown;
      requirement: PaymentRequirement;
    }>();

    const parsed = PaymentPayloadSchema.safeParse(body.payload);
    if (!parsed.success) {
      return c.json({ isValid: false, error: "Invalid payment payload" }, 400);
    }

    const result = await verifyPayment(parsed.data, body.requirement);
    return c.json(result, result.isValid ? 200 : 400);
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  return app;
}
