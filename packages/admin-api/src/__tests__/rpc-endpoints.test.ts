import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const sampleEndpoint = {
  id: "rpc_1",
  chainSlug: "optimism-sepolia",
  url: "https://sepolia.optimism.io",
  label: "Primary",
  priority: 0,
  isActive: true,
  healthStatus: "healthy",
  lastHealthCheck: 1000,
  lastLatency: 120,
  totalRequests: 0,
  totalErrors: 0,
  createdAt: 1000,
};

const mockDb = {
  listRpcEndpoints: vi.fn(() => [sampleEndpoint]),
  getRpcEndpoint: vi.fn(() => sampleEndpoint as any),
  updateRpcEndpoint: vi.fn(() => true),
  deleteRpcEndpoint: vi.fn(() => true),
  getChain: vi.fn(() => ({ id: "optimism-sepolia" })),
  getRpcEndpointByChainAndUrl: vi.fn(() => undefined),
  insertRpcEndpoint: vi.fn(),
  getRpcStatsHistory: vi.fn(() => []),
  getRpcChainSummary: vi.fn(() => []),
};

vi.mock("@x402-gateway-mvp/core/src/db.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("@x402-gateway-mvp/chain", () => ({
  addRpcEndpoint: vi.fn(),
  removeRpcEndpoint: vi.fn(),
  getRpcEndpoints: vi.fn(() => []),
  getAllRpcEndpoints: vi.fn(() => []),
  triggerHealthCheck: vi.fn(),
  checkEndpointHealth: vi.fn().mockResolvedValue({ status: "healthy", latency: 100 }),
}));

import { rpcEndpointsRouter } from "../routes/rpc-endpoints.js";

function makeApp() {
  const app = new Hono();
  app.route("/rpc-endpoints", rpcEndpointsRouter);
  return app;
}

describe("GET /rpc-endpoints", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.listRpcEndpoints.mockReturnValue([sampleEndpoint]); });

  it("returns all endpoints", async () => {
    const res = await makeApp().request("/rpc-endpoints");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("rpc_1");
  });

  it("filters by chainSlug query param", async () => {
    await makeApp().request("/rpc-endpoints?chainSlug=optimism-sepolia");
    expect(mockDb.listRpcEndpoints).toHaveBeenCalledWith("optimism-sepolia");
  });
});

describe("GET /rpc-endpoints/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns endpoint when found", async () => {
    mockDb.getRpcEndpoint.mockReturnValue(sampleEndpoint);
    const res = await makeApp().request("/rpc-endpoints/rpc_1");
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://sepolia.optimism.io");
  });

  it("returns 404 when not found", async () => {
    mockDb.getRpcEndpoint.mockReturnValue(undefined);
    const res = await makeApp().request("/rpc-endpoints/ghost");
    expect(res.status).toBe(404);
  });
});

describe("PUT /rpc-endpoints/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getRpcEndpoint.mockReturnValue(sampleEndpoint); // both existence check and re-fetch
    mockDb.updateRpcEndpoint.mockReturnValue(true);
  });

  it("updates label successfully", async () => {
    const res = await makeApp().request("/rpc-endpoints/rpc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "Backup" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.updateRpcEndpoint).toHaveBeenCalledWith("rpc_1", { label: "Backup" });
  });

  it("returns 400 when url is not a valid URL", async () => {
    const res = await makeApp().request("/rpc-endpoints/rpc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid URL/i);
  });

  it("returns 400 when url uses non-http protocol", async () => {
    const res = await makeApp().request("/rpc-endpoints/rpc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "ws://example.com" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/http/i);
  });

  it("accepts valid https url", async () => {
    const res = await makeApp().request("/rpc-endpoints/rpc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://new-rpc.example.com" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when no fields are updated", async () => {
    mockDb.updateRpcEndpoint.mockReturnValue(false);
    const res = await makeApp().request("/rpc-endpoints/rpc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when endpoint not found", async () => {
    vi.clearAllMocks();
    mockDb.getRpcEndpoint.mockReturnValue(undefined);
    const res = await makeApp().request("/rpc-endpoints/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "X" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /rpc-endpoints/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getRpcEndpoint.mockReturnValue(sampleEndpoint);
    mockDb.deleteRpcEndpoint.mockReturnValue(true);
  });

  it("deletes endpoint when siblings exist", async () => {
    mockDb.listRpcEndpoints.mockReturnValue([sampleEndpoint, { ...sampleEndpoint, id: "rpc_2" }]);
    const res = await makeApp().request("/rpc-endpoints/rpc_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });

  it("returns 400 when trying to delete the last endpoint on a chain", async () => {
    mockDb.listRpcEndpoints.mockReturnValue([sampleEndpoint]); // only one
    const res = await makeApp().request("/rpc-endpoints/rpc_1", { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when endpoint not found", async () => {
    mockDb.getRpcEndpoint.mockReturnValue(undefined);
    const res = await makeApp().request("/rpc-endpoints/ghost", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
