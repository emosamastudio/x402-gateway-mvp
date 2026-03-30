import { describe, it, expect, vi } from "vitest";
import { verifyPayment } from "../verify.js";
import { globalNonceStore } from "../nonce.js";
import type { PaymentPayload, PaymentRequirement } from "@x402-gateway-mvp/shared";

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, recoverAddress: vi.fn() };
});

vi.mock("@x402-gateway-mvp/chain", () => ({
  getDomainSeparator: vi.fn().mockResolvedValue("0x" + "00".repeat(32)),
}));

import { recoverAddress } from "viem";

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
    vi.mocked(recoverAddress).mockResolvedValue("0x2222222222222222222222222222222222222222");
    const result = await verifyPayment(mockPayload, mockRequirement);
    expect(result.isValid).toBe(true);
  });

  it("returns valid=false when signature is invalid", async () => {
    vi.mocked(recoverAddress).mockResolvedValue("0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
    const result = await verifyPayment(mockPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/signature/i);
  });

  it("returns valid=false when payment amount is too low", async () => {
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

  it("returns valid=false when payment recipient does not match requirement payTo", async () => {
    const wrongRecipientPayload: PaymentPayload = {
      ...mockPayload,
      payload: {
        ...mockPayload.payload,
        authorization: {
          ...mockPayload.payload.authorization,
          to: "0x9999999999999999999999999999999999999999",
        },
      },
    };
    const result = await verifyPayment(wrongRecipientPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/recipient/i);
  });

  it("returns valid=false when nonce has already been used (replay attack)", async () => {
    const replayNonce = "0x" + "cc".repeat(32);
    globalNonceStore.markUsed(replayNonce);

    const replayPayload: PaymentPayload = {
      ...mockPayload,
      payload: {
        ...mockPayload.payload,
        authorization: {
          ...mockPayload.payload.authorization,
          nonce: replayNonce,
        },
      },
    };
    const result = await verifyPayment(replayPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/nonce/i);
  });

  it("returns valid=false when recoverAddress throws (malformed signature)", async () => {
    vi.mocked(recoverAddress).mockRejectedValue(new Error("invalid signature bytes"));
    const result = await verifyPayment(mockPayload, mockRequirement);
    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/malformed/i);
  });
});
