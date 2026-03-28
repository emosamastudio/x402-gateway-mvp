import { describe, it, expect, vi } from "vitest";
import { verifyPayment } from "../verify.js";
import type { PaymentPayload, PaymentRequirement } from "@x402-gateway-mvp/shared";

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, verifyTypedData: vi.fn() };
});

import { verifyTypedData } from "viem";

const mockRequirement: PaymentRequirement = {
  network: "optimism-sepolia",
  maxAmountRequired: "1000",
  resource: "https://example.com/api",
  description: "Test API",
  payTo: "0x1111111111111111111111111111111111111111",
  maxTimeoutSeconds: 300,
  asset: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
};

const mockPayload: PaymentPayload = {
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

describe("verifyPayment", () => {
  it("returns valid=true when signature and amounts are correct", async () => {
    vi.mocked(verifyTypedData).mockResolvedValue(true);
    const result = await verifyPayment(mockPayload, mockRequirement);
    expect(result.isValid).toBe(true);
  });

  it("returns valid=false when signature is invalid", async () => {
    vi.mocked(verifyTypedData).mockResolvedValue(false);
    const result = await verifyPayment(mockPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/signature/i);
  });

  it("returns valid=false when payment amount is too low", async () => {
    vi.mocked(verifyTypedData).mockResolvedValue(true);
    const lowAmountPayload: PaymentPayload = {
      ...mockPayload,
      payload: {
        ...mockPayload.payload,
        authorization: { ...mockPayload.payload.authorization, value: "500" },
      },
    };
    const result = await verifyPayment(lowAmountPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/amount/i);
  });

  it("returns valid=false when payment has expired", async () => {
    vi.mocked(verifyTypedData).mockResolvedValue(true);
    const expiredPayload: PaymentPayload = {
      ...mockPayload,
      payload: {
        ...mockPayload.payload,
        authorization: {
          ...mockPayload.payload.authorization,
          validBefore: "1", // Unix timestamp 1 = already expired
        },
      },
    };
    const result = await verifyPayment(expiredPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("returns valid=false when payment is not yet valid", async () => {
    vi.mocked(verifyTypedData).mockResolvedValue(true);
    const futurePayload: PaymentPayload = {
      ...mockPayload,
      payload: {
        ...mockPayload.payload,
        authorization: {
          ...mockPayload.payload.authorization,
          validAfter: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour in future
        },
      },
    };
    const result = await verifyPayment(futurePayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/not yet valid/i);
  });

  it("returns valid=false when payment network does not match requirement network", async () => {
    const wrongNetworkPayload: PaymentPayload = {
      ...mockPayload,
      network: "sepolia",
    };
    const result = await verifyPayment(wrongNetworkPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/network/i);
  });
});
