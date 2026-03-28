import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("@x402-gateway-mvp/facilitator", () => ({
  verifyPayment: vi.fn().mockResolvedValue({ isValid: true }),
  settlePayment: vi.fn().mockResolvedValue({ txHash: "0xtx1", network: "optimism-sepolia" }),
}));

vi.mock("@x402-gateway-mvp/chain", () => ({
  DMHKD_ADDRESSES: { "optimism-sepolia": "0x35348A2c0e11bF0F5CEf7E1e98e04dA23D8B3b60" },
  getDomainSeparator: vi.fn().mockResolvedValue("0x" + "00".repeat(32)),
}));

vi.mock("../db.js", () => ({
  getDb: vi.fn(() => ({
    insertRequest: vi.fn(),
  })),
}));

import { x402Middleware } from "../middleware/x402.js";
import type { Service } from "@x402-gateway-mvp/shared";

const mockService: Service = {
  id: "svc_1", name: "Test API", gatewayPath: "/api", backendUrl: "http://backend:3001",
  priceAmount: "0.001", priceCurrency: "DMHKD", network: "optimism-sepolia",
  recipient: "0x1111111111111111111111111111111111111111", apiKey: "", minReputation: 0, createdAt: 1,
};

describe("x402Middleware", () => {
  it("returns 402 when no PAYMENT-SIGNATURE header", async () => {
    const app = new Hono();
    app.use("*", x402Middleware(() => mockService));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test");
    expect(res.status).toBe(402);

    const body = await res.json();
    expect(body.error).toBe("Payment Required");
    expect(body.requirement.network).toBe("optimism-sepolia");
    expect(body.requirement.maxAmountRequired).toBe("1000"); // 0.001 USDC = 1000 units
  });

  it("calls next when valid PAYMENT-SIGNATURE header is present", async () => {
    const validPayload = {
      x402Version: 1,
      scheme: "exact",
      network: "optimism-sepolia",
      payload: {
        signature: "0x" + "a".repeat(130),
        authorization: {
          from: "0x2222222222222222222222222222222222222222",
          to: "0x1111111111111111111111111111111111111111",
          value: "1000",
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 300),
          nonce: "0x" + "b".repeat(64),
        },
      },
    };
    const header = Buffer.from(JSON.stringify(validPayload)).toString("base64");

    const app = new Hono();
    app.use("*", x402Middleware(() => mockService));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test", {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(res.status).toBe(200); // verifyPayment is mocked to return isValid: true
  });
});
