import type { Context, Next } from "hono";
import type { Service, PaymentPayload, PaymentRequirement } from "@x402-gateway/shared";
import { toUsdcUnits } from "@x402-gateway/shared";
import { USDC_ADDRESSES } from "@x402-gateway/chain";
import { verifyPayment, settlePayment } from "@x402-gateway/facilitator";

export function buildPaymentRequirement(service: Service, requestUrl: string): PaymentRequirement {
  return {
    network: service.network,
    maxAmountRequired: toUsdcUnits(service.priceAmount).toString(),
    resource: requestUrl,
    description: `Access to ${service.name}`,
    payTo: service.recipient,
    maxTimeoutSeconds: 300,
    asset: USDC_ADDRESSES[service.network],
  };
}

type ServiceResolver = (path: string) => Service | undefined;

export function x402Middleware(resolveService: ServiceResolver) {
  return async (c: Context, next: Next) => {
    const service = resolveService(c.req.path);
    if (!service) return next(); // Not a protected route — pass through

    const paymentHeader = c.req.header("PAYMENT-SIGNATURE");
    const requirement = buildPaymentRequirement(service, c.req.url);

    // No payment — return 402
    if (!paymentHeader) {
      return c.json({ error: "Payment Required", requirement }, 402);
    }

    // Decode payment payload
    let payload: PaymentPayload;
    try {
      payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf-8"));
    } catch {
      return c.json({ error: "Payment Required", reason: "Invalid payment header", requirement }, 402);
    }

    // Verify signature (off-chain)
    const verifyResult = await verifyPayment(payload, requirement);
    if (!verifyResult.isValid) {
      return c.json({ error: "Payment Required", reason: verifyResult.error, requirement }, 402);
    }

    // Store payload in context for settlement after backend responds
    c.set("paymentPayload", payload);
    c.set("paymentRequirement", requirement);
    c.set("paymentService", service);

    return next();
  };
}

// Call this after backend responds successfully to settle on-chain
export async function settleAfterSuccess(c: Context): Promise<string | null> {
  const payload = c.get("paymentPayload") as PaymentPayload | undefined;
  const service = c.get("paymentService") as Service | undefined;
  if (!payload || !service) return null;

  const result = await settlePayment(
    payload.payload.authorization,
    payload.payload.signature,
    service.network
  );
  return result.txHash;
}
