import { Hono } from "hono";
import { logger } from "hono/logger";
import { getDb } from "./db.js";
import { identityMiddleware } from "./middleware/identity.js";
import { x402Middleware, settleAfterSuccess } from "./middleware/x402.js";
import { proxyToBackend } from "./proxy.js";
import type { Service } from "@x402-gateway-mvp/shared";
import { randomUUID } from "crypto";
import { fromUsdcUnits } from "@x402-gateway-mvp/shared";

export function createCoreApp() {
  const app = new Hono();
  app.use("*", logger());

  // Route resolver: match request path to a registered service
  function resolveService(path: string): Service | undefined {
    const db = getDb();
    const services = db.listServices();
    // Match by service.gatewayPath prefix
    return services.find((s) => {
      const gp = s.gatewayPath.replace(/\/$/, "");
      return gp && (path === gp || path.startsWith(gp + "/"));
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

    const db = getDb();
    const now = Date.now();
    const agentAddress = c.req.header("X-Agent-Address") ?? c.req.header("x-agent-address") ?? "";

    // Retrieve requestId set by x402 middleware (paid path), or create a fresh one
    const requestId: string = (c as any).get("requestId") ?? randomUUID();
    const hasPendingRecord = !!(c as any).get("requestId");

    // ── Proxy to backend ──────────────────────────────────────────────
    let backendResponse: Response;
    try {
      backendResponse = await proxyToBackend(c, service);
    } catch (err: any) {
      const isTimeout = err.name === "TimeoutError";
      const httpStatus = isTimeout ? 504 : 502;
      const errorReason = isTimeout ? "Backend timeout" : "Backend unreachable";
      if (hasPendingRecord) {
        db.updateRequest(requestId, {
          gatewayStatus: "proxy_error",
          httpStatus,
          errorReason,
          proxyAt: now,
        });
      } else {
        db.insertRequest({
          id: requestId, serviceId: service.id, agentAddress,
          method: c.req.method, path: c.req.path, network: service.network,
          gatewayStatus: "proxy_error", httpStatus,
          responseStatus: 0, responseBody: "",
          errorReason, paymentId: "",
          challengeAt: 0, verifiedAt: 0, proxyAt: now, settledAt: 0, createdAt: now,
        });
      }
      return c.json({ error: errorReason }, httpStatus);
    }

    // Buffer body immediately so the proxy AbortSignal can't interrupt settlement
    const bodyBuffer = await backendResponse.arrayBuffer();
    const responseHeaders = new Headers(backendResponse.headers);

    // Decode response body for storage (truncated to 4KB)
    let responseBodyText = "";
    try {
      responseBodyText = new TextDecoder().decode(bodyBuffer).slice(0, 4096);
    } catch { /* binary body — skip */ }

    // ── Backend returned non-2xx ──────────────────────────────────────
    if (!backendResponse.ok) {
      if (hasPendingRecord) {
        db.updateRequest(requestId, {
          gatewayStatus: "backend_error",
          httpStatus: backendResponse.status,
          responseStatus: backendResponse.status,
          responseBody: responseBodyText,
          errorReason: `Backend returned ${backendResponse.status}`,
          proxyAt: now,
        });
      } else {
        db.insertRequest({
          id: requestId, serviceId: service.id, agentAddress,
          method: c.req.method, path: c.req.path, network: service.network,
          gatewayStatus: "backend_error", httpStatus: backendResponse.status,
          responseStatus: backendResponse.status, responseBody: responseBodyText,
          errorReason: `Backend returned ${backendResponse.status}`,
          paymentId: "", challengeAt: 0, verifiedAt: 0, proxyAt: now, settledAt: 0, createdAt: now,
        });
      }
      return new Response(bodyBuffer, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders,
      });
    }

    // ── Backend succeeded (2xx) ───────────────────────────────────────
    const paymentPayload = (c as any).get("paymentPayload") as import("@x402-gateway-mvp/shared").PaymentPayload | undefined;

    if (!paymentPayload) {
      // No payment was involved (e.g. free route that passed through x402 as no-op)
      if (hasPendingRecord) {
        db.updateRequest(requestId, {
          gatewayStatus: "success",
          httpStatus: backendResponse.status,
          responseStatus: backendResponse.status,
          responseBody: responseBodyText,
          errorReason: "",
          proxyAt: now,
        });
      } else {
        db.insertRequest({
          id: requestId, serviceId: service.id, agentAddress,
          method: c.req.method, path: c.req.path, network: service.network,
          gatewayStatus: "success", httpStatus: backendResponse.status,
          responseStatus: backendResponse.status, responseBody: responseBodyText,
          errorReason: "", paymentId: "",
          challengeAt: 0, verifiedAt: 0, proxyAt: now, settledAt: 0, createdAt: now,
        });
      }
      return new Response(bodyBuffer, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders,
      });
    }

    // Mark as settling
    db.updateRequest(requestId, {
      gatewayStatus: "settling",
      httpStatus: backendResponse.status,
      responseStatus: backendResponse.status,
      responseBody: responseBodyText,
      proxyAt: now,
    });

    // Settlement
    let txHash: string | null = null;
    let settlementError: string | null = null;
    try {
      txHash = await settleAfterSuccess(c);
    } catch (err) {
      settlementError = err instanceof Error ? err.message : String(err);
      console.error("Settlement failed:", settlementError);
    }

    const settledAt = Date.now();
    const paymentId = randomUUID();

    // Update request record with final status
    db.updateRequest(requestId, {
      gatewayStatus: txHash ? "settled" : "settlement_failed",
      agentAddress: paymentPayload.payload.authorization.from,
      errorReason: settlementError ?? "",
      paymentId,
      settledAt,
    });

    // Insert payment record (linked to request)
    db.insertPayment({
      id: paymentId,
      requestId,
      serviceId: service.id,
      agentAddress: paymentPayload.payload.authorization.from,
      txHash: txHash ?? "failed",
      network: service.network,
      amount: fromUsdcUnits(BigInt(paymentPayload.payload.authorization.value)),
      status: txHash ? "settled" : "failed",
      settlementError: settlementError ?? "",
      createdAt: settledAt,
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
  });

  return app;
}
