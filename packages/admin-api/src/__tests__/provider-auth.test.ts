// packages/admin-api/src/__tests__/provider-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { providerAuthRouter } from "../routes/provider-auth.js";

// Mock viem verifyMessage
vi.mock("viem", () => ({
  verifyMessage: vi.fn(),
}));
// Mock db
vi.mock("@x402-gateway-mvp/core/src/db.js", () => ({
  getDb: vi.fn(() => ({
    getProviderByWallet: vi.fn(() => undefined),
    insertProvider: vi.fn(),
    getProvider: vi.fn((id: string) => ({
      id, name: "Test Provider", walletAddress: "0xabc",
      description: "", website: "", createdAt: Date.now(),
    })),
  })),
}));

const app = new Hono().route("/provider/auth", providerAuthRouter);

describe("GET /provider/auth/nonce", () => {
  it("returns a nonce message for a given address", async () => {
    const res = await app.request("/provider/auth/nonce?address=0xabc123");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(typeof body.message).toBe("string");
    expect(body.message).toContain("Sign in to x402 Gateway");
    expect(body.message).toContain("0xabc123");
  });

  it("returns 400 when address is missing", async () => {
    const res = await app.request("/provider/auth/nonce");
    expect(res.status).toBe(400);
  });
});

describe("POST /provider/auth/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when nonce not requested first", async () => {
    const { verifyMessage } = await import("viem");
    vi.mocked(verifyMessage).mockResolvedValue(true);

    const res = await app.request("/provider/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: "0xnew_unique_addr_nonce_test", signature: "0xsig" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/nonce/i);
  });

  it("returns 401 on bad signature", async () => {
    const { verifyMessage } = await import("viem");
    vi.mocked(verifyMessage).mockResolvedValue(false);

    // First get a nonce
    await app.request("/provider/auth/nonce?address=0xbadsig");

    const res = await app.request("/provider/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: "0xbadsig", signature: "0xwrong" }),
    });
    expect(res.status).toBe(401);
  });
});
