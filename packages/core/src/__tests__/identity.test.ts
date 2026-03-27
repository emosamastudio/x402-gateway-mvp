import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("@x402-gateway/chain", () => ({
  checkAgentIdentity: vi.fn(),
}));

vi.mock("../db.js", () => ({
  getDb: vi.fn(() => ({
    getAgentCache: vi.fn(() => undefined),
    upsertAgentCache: vi.fn(),
  })),
}));

import { checkAgentIdentity } from "@x402-gateway/chain";
import { identityMiddleware } from "../middleware/identity.js";

describe("identityMiddleware", () => {
  it("returns 403 when agent is not registered", async () => {
    vi.mocked(checkAgentIdentity).mockResolvedValue({ isRegistered: false, reputation: 0 });

    const app = new Hono();
    app.use("*", identityMiddleware(() => ({ minReputation: 0, network: "base-sepolia" } as any)));
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
    app.use("*", identityMiddleware(() => ({ minReputation: 50, network: "base-sepolia" } as any)));
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
    app.use("*", identityMiddleware(() => ({ minReputation: 50, network: "base-sepolia" } as any)));
    app.get("/api", (c) => c.text("ok"));

    const res = await app.request("/api", {
      headers: { "X-Agent-Address": "0xabc" },
    });
    expect(res.status).toBe(200);
  });
});
