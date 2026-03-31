import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("@x402-gateway-mvp/facilitator", () => ({
  verifyPayment: vi.fn().mockResolvedValue({ isValid: true }),
  settlePayment: vi.fn().mockResolvedValue({ txHash: "0xtx1", network: "optimism-sepolia" }),
}));

vi.mock("@x402-gateway-mvp/chain", () => ({
  DMHKD_ADDRESSES: { "optimism-sepolia": "0x35348A2c0e11bF0F5CEf7E1e98e04dA23D8B3b60" },
  getDomainSeparator: vi.fn().mockResolvedValue("0x" + "00".repeat(32)),
  getTokenConfig: vi.fn(() => ({
    id: "dmhkd-optimism-sepolia",
    symbol: "DMHKD",
    name: "DMHKD Stablecoin",
    chainSlug: "optimism-sepolia",
    contractAddress: "0x35348A2c0e11bF0F5CEf7E1e98e04dA23D8B3b60",
    decimals: 6,
    domainName: "DMHKD",
    domainVersion: "2",
    isActive: true,
    createdAt: 0,
  })),
  getChainConfig: vi.fn(() => ({
    id: "optimism-sepolia",
    name: "Optimism Sepolia",
    chainId: 11155420,
    rpcUrl: "https://sepolia.optimism.io",
    explorerUrl: "",
    isTestnet: true,
    nativeCurrency: "ETH",
    erc8004Identity: "",
    createdAt: 0,
  })),
}));

const mockDb = {
  insertRequest: vi.fn(),
  findPendingRequest: vi.fn(() => undefined),
  updateRequest: vi.fn(),
};

vi.mock("../db.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

import { verifyPayment } from "@x402-gateway-mvp/facilitator";
import { x402Middleware, settleAfterSuccess } from "../middleware/x402.js";
import type { Service, ServicePaymentScheme } from "@x402-gateway-mvp/shared";

const mockService: Service = {
  id: "svc_1", name: "Test API",
  backendUrl: "http://backend:3001",
  apiKey: "", minReputation: 0, createdAt: 1,
  providerId: "",
};

const mockScheme: ServicePaymentScheme = {
  id: "scheme_1", serviceId: "svc_1",
  network: "optimism-sepolia",
  tokenId: "dmhkd-optimism-sepolia",
  priceAmount: "0.001", priceCurrency: "DMHKD",
  recipient: "0x1111111111111111111111111111111111111111",
  createdAt: 1,
};

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

describe("x402Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPayment).mockResolvedValue({ isValid: true });
    mockDb.findPendingRequest.mockReturnValue(undefined);
  });

  it("returns 402 when no PAYMENT-SIGNATURE header", async () => {
    const app = new Hono();
    app.use("*", x402Middleware(() => ({ service: mockService, scheme: mockScheme })));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test");
    expect(res.status).toBe(402);

    const body = await res.json();
    expect(body.error).toBe("Payment Required");
    expect(body.requirement.network).toBe("optimism-sepolia");
    expect(body.requirement.maxAmountRequired).toBe("1000"); // 0.001 USDC = 1000 units
  });

  it("passes through when valid PAYMENT-SIGNATURE header is present", async () => {
    const header = Buffer.from(JSON.stringify(validPayload)).toString("base64");

    const app = new Hono();
    app.use("*", x402Middleware(() => ({ service: mockService, scheme: mockScheme })));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test", {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(res.status).toBe(200);
  });

  it("returns 402 when PAYMENT-SIGNATURE header is malformed base64/JSON", async () => {
    const app = new Hono();
    app.use("*", x402Middleware(() => ({ service: mockService, scheme: mockScheme })));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test", {
      headers: { "PAYMENT-SIGNATURE": "not-valid-base64!!!" },
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.reason).toMatch(/invalid payment header/i);
  });

  it("returns 402 when payment verification fails", async () => {
    vi.mocked(verifyPayment).mockResolvedValue({ isValid: false, error: "Signature mismatch" });
    const header = Buffer.from(JSON.stringify(validPayload)).toString("base64");

    const app = new Hono();
    app.use("*", x402Middleware(() => ({ service: mockService, scheme: mockScheme })));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test", {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.reason).toBe("Signature mismatch");
  });

  it("passes through when service is not found (unprotected route)", async () => {
    const app = new Hono();
    app.use("*", x402Middleware(() => undefined));
    app.get("/public", (c) => c.text("ok"));

    const res = await app.request("/public");
    expect(res.status).toBe(200);
  });

  it("resumes pending request when one exists in DB", async () => {
    const pendingRequest = {
      id: "req_existing",
      serviceId: "svc_1",
      agentAddress: "0x2222222222222222222222222222222222222222",
      gatewayStatus: "payment_required",
    };
    mockDb.findPendingRequest.mockReturnValue(pendingRequest);

    const header = Buffer.from(JSON.stringify(validPayload)).toString("base64");

    const app = new Hono();
    app.use("*", x402Middleware(() => ({ service: mockService, scheme: mockScheme })));
    app.get("/api/test", (c) => c.text("ok"));

    const res = await app.request("/api/test", {
      headers: { "PAYMENT-SIGNATURE": header },
    });
    expect(res.status).toBe(200);
    // Should update existing request, not insert new one
    expect(mockDb.updateRequest).toHaveBeenCalledWith("req_existing", expect.objectContaining({
      gatewayStatus: "verifying",
    }));
    expect(mockDb.insertRequest).not.toHaveBeenCalled();
  });
});

describe("settleAfterSuccess", () => {
  it("returns null when paymentPayload is not in context", async () => {
    const app = new Hono();
    app.get("/", async (c) => {
      const result = await settleAfterSuccess(c);
      return c.json({ result });
    });
    const res = await app.request("/");
    const body = await res.json();
    expect(body.result).toBeNull();
  });
});
