import type { Context, Next } from "hono";
import type { Service, ServicePaymentScheme, PaymentPayload, PaymentRequirement } from "@x402-gateway-mvp/shared";
import { toUsdcUnits } from "@x402-gateway-mvp/shared";
import { getDomainSeparator, getTokenConfig, getChainConfig } from "@x402-gateway-mvp/chain";
import { verifyPayment, settlePayment } from "@x402-gateway-mvp/facilitator";
import { getDb } from "../db.js";
import { randomUUID } from "crypto";

async function buildPaymentRequirement(
  service: Service,
  scheme: ServicePaymentScheme,
  requestUrl: string
): Promise<PaymentRequirement> {
  const token = getTokenConfig(scheme.tokenId);
  const chain = getChainConfig(scheme.network);
  const domainSeparator = await getDomainSeparator(scheme.network, token.contractAddress);
  return {
    network: scheme.network,
    chainId: chain.chainId,
    maxAmountRequired: toUsdcUnits(scheme.priceAmount).toString(),
    resource: requestUrl,
    description: `Access to ${service.name}`,
    payTo: scheme.recipient,
    maxTimeoutSeconds: 300,
    asset: token.contractAddress,
    assetSymbol: token.symbol,
    assetDecimals: token.decimals,
    domainSeparator,
    domainName: token.domainName,
    domainVersion: token.domainVersion,
  };
}

type SchemeResolver = (path: string) => { service: Service; scheme: ServicePaymentScheme } | undefined;

export function x402Middleware(resolveScheme: SchemeResolver) {
  return async (c: Context, next: Next) => {
    const resolved = resolveScheme(c.req.path);
    if (!resolved) return next(); // Not a protected route — pass through

    const { service, scheme } = resolved;
    const db = getDb();
    const agentAddress = c.req.header("X-Agent-Address") ?? c.req.header("x-agent-address") ?? "";
    const paymentHeader = c.req.header("PAYMENT-SIGNATURE");
    const requirement = await buildPaymentRequirement(service, scheme, c.req.url);
    const now = Date.now();

    // ── No payment header → 402 challenge (create request record) ────
    if (!paymentHeader) {
      const requestId = randomUUID();
      db.insertRequest({
        id: requestId,
        serviceId: service.id,
        agentAddress,
        method: c.req.method,
        path: c.req.path,
        network: scheme.network,
        gatewayStatus: "payment_required",
        httpStatus: 402,
        responseStatus: 0,
        responseBody: "",
        errorReason: "",
        paymentId: "",
        challengeAt: now,
        verifiedAt: 0,
        proxyAt: 0,
        settledAt: 0,
        createdAt: now,
      });
      return c.json({ error: "Payment Required", requirement }, 402);
    }

    // ── Has payment header → try to resume existing request record ────
    const pending = db.findPendingRequest(service.id, agentAddress);
    const requestId = pending?.id ?? randomUUID();

    // Decode payment payload
    let payload: PaymentPayload;
    try {
      payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));
    } catch {
      if (pending) {
        db.updateRequest(requestId, {
          gatewayStatus: "payment_rejected",
          errorReason: "Invalid payment header (malformed base64/JSON)",
        });
      } else {
        db.insertRequest({
          id: requestId, serviceId: service.id, agentAddress,
          method: c.req.method, path: c.req.path, network: scheme.network,
          gatewayStatus: "payment_rejected", httpStatus: 402,
          responseStatus: 0, responseBody: "",
          errorReason: "Invalid payment header (malformed base64/JSON)",
          paymentId: "", challengeAt: 0, verifiedAt: 0, proxyAt: 0, settledAt: 0, createdAt: now,
        });
      }
      return c.json({ error: "Payment Required", reason: "Invalid payment header", requirement }, 402);
    }

    // Verify signature (off-chain)
    const verifyResult = await verifyPayment(payload, requirement);
    if (!verifyResult.isValid) {
      if (pending) {
        db.updateRequest(requestId, {
          gatewayStatus: "payment_rejected",
          errorReason: `Payment verification failed: ${verifyResult.error}`,
        });
      } else {
        db.insertRequest({
          id: requestId, serviceId: service.id, agentAddress,
          method: c.req.method, path: c.req.path, network: scheme.network,
          gatewayStatus: "payment_rejected", httpStatus: 402,
          responseStatus: 0, responseBody: "",
          errorReason: `Payment verification failed: ${verifyResult.error}`,
          paymentId: "", challengeAt: 0, verifiedAt: 0, proxyAt: 0, settledAt: 0, createdAt: now,
        });
      }
      return c.json({ error: "Payment Required", reason: verifyResult.error, requirement }, 402);
    }

    // Payment verified — update record
    if (pending) {
      db.updateRequest(requestId, {
        gatewayStatus: "verifying",
        agentAddress: payload.payload.authorization.from || agentAddress,
        verifiedAt: now,
      });
    } else {
      db.insertRequest({
        id: requestId, serviceId: service.id,
        agentAddress: payload.payload.authorization.from || agentAddress,
        method: c.req.method, path: c.req.path, network: scheme.network,
        gatewayStatus: "verifying", httpStatus: 0,
        responseStatus: 0, responseBody: "",
        errorReason: "", paymentId: "",
        challengeAt: 0, verifiedAt: now, proxyAt: 0, settledAt: 0, createdAt: now,
      });
    }

    // Store payload & requestId in context for downstream handlers
    c.set("paymentPayload", payload);
    c.set("paymentRequirement", requirement);
    c.set("paymentScheme", scheme);
    c.set("requestId", requestId);

    return next();
  };
}

// Call this after backend responds successfully to settle on-chain
export async function settleAfterSuccess(c: Context): Promise<string | null> {
  const payload = c.get("paymentPayload") as PaymentPayload | undefined;
  const scheme = c.get("paymentScheme") as ServicePaymentScheme | undefined;
  const requirement = c.get("paymentRequirement") as PaymentRequirement | undefined;
  if (!payload || !scheme || !requirement) return null;

  const result = await settlePayment(
    payload.payload.authorization,
    payload.payload.signature,
    scheme.network,
    requirement.asset,
  );
  return result.txHash;
}
