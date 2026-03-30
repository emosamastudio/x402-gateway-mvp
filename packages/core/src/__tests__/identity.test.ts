import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("@x402-gateway-mvp/chain", () => ({
  checkAgentIdentity: vi.fn(),
}));

const mockDb = {
  getAgentCache: vi.fn(() => undefined),
  upsertAgentCache: vi.fn(),
  insertRequest: vi.fn(),
};

vi.mock("../db.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

import { checkAgentIdentity } from "@x402-gateway-mvp/chain";
import { identityMiddleware } from "../middleware/identity.js";

const mockService = { id: "svc_1", minReputation: 0, network: "optimism-sepolia" } as any;

describe("identityMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getAgentCache.mockReturnValue(undefined);
  });

  it("returns 403 when agent is not registered", async () => {
    vi.mocked(checkAgentIdentity).mockResolvedValue({ isRegistered: false, reputation: 0 });

    const app = new Hono();
    app.use("*", identityMiddleware(() => mockService));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not registered/i);
  });

  it("returns 403 when agent reputation is below threshold", async () => {
    vi.mocked(checkAgentIdentity).mockResolvedValue({ isRegistered: true, reputation: 30 });

    const app = new Hono();
    app.use("*", identityMiddleware(() => ({ ...mockService, minReputation: 50 })));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/reputation/i);
  });

  it("passes through when agent is registered with sufficient reputation", async () => {
    vi.mocked(checkAgentIdentity).mockResolvedValue({ isRegistered: true, reputation: 80 });

    const app = new Hono();
    app.use("*", identityMiddleware(() => ({ ...mockService, minReputation: 50 })));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 when X-Agent-Address header is missing", async () => {
    const app = new Hono();
    app.use("*", identityMiddleware(() => mockService));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/agent address required/i);
  });

  it("passes through when service is not found (unprotected route)", async () => {
    const app = new Hono();
    app.use("*", identityMiddleware(() => undefined));
    app.get("/public", (c) => c.text("ok"));

    const res = await app.request("/public");
    expect(res.status).toBe(200);
  });

  it("uses fresh cache and skips chain call when cache is valid", async () => {
    const now = Date.now();
    mockDb.getAgentCache.mockReturnValue({
      address: "0xabc",
      isRegistered: true,
      reputation: 90,
      cachedAt: now - 1000, // 1 second ago, within 5-min TTL
    });

    const app = new Hono();
    app.use("*", identityMiddleware(() => ({ ...mockService, minReputation: 50 })));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    expect(res.status).toBe(200);
    expect(checkAgentIdentity).not.toHaveBeenCalled();
  });

  it("ignores expired cache and calls chain when cache is stale", async () => {
    const now = Date.now();
    mockDb.getAgentCache.mockReturnValue({
      address: "0xabc",
      isRegistered: true,
      reputation: 90,
      cachedAt: now - 10 * 60 * 1000, // 10 minutes ago, past 5-min TTL
    });
    vi.mocked(checkAgentIdentity).mockResolvedValue({ isRegistered: true, reputation: 90 });

    const app = new Hono();
    app.use("*", identityMiddleware(() => mockService));
    app.get("/api", (c) => c.text("ok"));

    await app.request("/api", { headers: { "X-Agent-Address": "0xabc" } });
    expect(checkAgentIdentity).toHaveBeenCalledOnce();
  });

  it("returns 503 when chain RPC fails and no cache exists", async () => {
    vi.mocked(checkAgentIdentity).mockRejectedValue(new Error("RPC unreachable"));

    const app = new Hono();
    app.use("*", identityMiddleware(() => mockService));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/chain unavailable/i);
  });

  it("falls back to stale cache when chain RPC fails", async () => {
    const now = Date.now();
    mockDb.getAgentCache.mockReturnValue({
      address: "0xabc",
      isRegistered: true,
      reputation: 80,
      cachedAt: now - 10 * 60 * 1000, // stale but present
    });
    vi.mocked(checkAgentIdentity).mockRejectedValue(new Error("RPC unreachable"));

    const app = new Hono();
    app.use("*", identityMiddleware(() => ({ ...mockService, minReputation: 50 })));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    // Should use stale cache (reputation 80 >= 50) and pass
    expect(res.status).toBe(200);
  });
});

