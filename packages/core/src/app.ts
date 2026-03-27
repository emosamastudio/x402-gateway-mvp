import { Hono } from "hono";
import { logger } from "hono/logger";
import { getDb } from "./db.js";
import { identityMiddleware } from "./middleware/identity.js";
import { x402Middleware, settleAfterSuccess } from "./middleware/x402.js";
import { proxyToBackend } from "./proxy.js";
import type { Service } from "@x402-gateway/shared";
import { randomUUID } from "crypto";
import { fromUsdcUnits } from "@x402-gateway/shared";

export function createCoreApp() {
  const app = new Hono();
  app.use("*", logger());

  // Route resolver: match request path to a registered service
  function resolveService(path: string): Service | undefined {
    const db = getDb();
    const services = db.listServices();
    // Simple prefix match — first match wins
    return services.find((s) => {
      const backend = new URL(s.backendUrl);
      return path.startsWith(backend.pathname) || path === "/";
    });
  }

  // Health check (unprotected)
  app.get("/health", (c) => c.json({ status: "ok" }));

  // Protected routes: identity check → x402 payment → proxy → settle
  app.all("*", identityMiddleware(resolveService));
  app.all("*", x402Middleware(resolveService));

  app.all("*", async (c) => {
    const service = resolveService(c.req.path);
    if (!service) return c.json({ error: "No registered service for this path" }, 404);

    let backendResponse: Response;
    try {
      backendResponse = await proxyToBackend(c, service.backendUrl);
    } catch (err: any) {
      if (err.name === "TimeoutError") {
        return c.json({ error: "Backend timeout" }, 504);
      }
      return c.json({ error: "Backend unreachable" }, 502);
    }

    // Buffer body into memory immediately so the proxy's AbortSignal (10s timeout)
    // cannot abort the stream during the settlement phase.
    const bodyBuffer = await backendResponse.arrayBuffer();
    const responseHeaders = new Headers(backendResponse.headers);

    // Backend succeeded — settle on-chain
    if (backendResponse.ok) {
      const db = getDb();
      const paymentPayload = (c as any).get("paymentPayload") as import("@x402-gateway/shared").PaymentPayload | undefined;

      if (!paymentPayload) {
        return new Response(bodyBuffer, {
          status: backendResponse.status,
          statusText: backendResponse.statusText,
          headers: responseHeaders,
        });
      }

      let txHash: string | null = null;
      let settlementError: string | null = null;

      try {
        txHash = await settleAfterSuccess(c);
      } catch (err) {
        settlementError = err instanceof Error ? err.message : String(err);
        console.error("Settlement failed:", settlementError);
      }

      db.insertPayment({
        id: randomUUID(),
        serviceId: service.id,
        agentAddress: paymentPayload.payload.authorization.from,
        txHash: txHash ?? "failed",
        network: service.network,
        amount: fromUsdcUnits(BigInt(paymentPayload.payload.authorization.value)),
        status: txHash ? "settled" : "failed",
        createdAt: Date.now(),
      });

      // Always attach PAYMENT-RESPONSE so the client knows what happened
      const paymentResponse = txHash
        ? { txHash }
        : { txHash: null, settlementError };

      responseHeaders.set(
        "PAYMENT-RESPONSE",
        Buffer.from(JSON.stringify(paymentResponse)).toString("base64")
      );
      return new Response(bodyBuffer, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders,
      });
    }

    return new Response(bodyBuffer, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  });

  return app;
}
