import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockDb = {
  listChains: vi.fn(() => []),
  getChain: vi.fn(() => undefined as any),
  insertChain: vi.fn(),
  updateChain: vi.fn(() => true),
  deleteChain: vi.fn(() => true),
  listTokens: vi.fn(() => []),
};

vi.mock("@x402-gateway-mvp/core/src/db.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock("@x402-gateway-mvp/chain", () => ({
  registerChain: vi.fn(),
  unregisterChain: vi.fn(),
}));

import { chainsRouter } from "../routes/chains.js";

function makeApp() {
  const app = new Hono();
  app.route("/chains", chainsRouter);
  return app;
}

const sampleChain = {
  id: "optimism-sepolia",
  name: "Optimism Sepolia",
  chainId: 11155420,
  rpcUrl: "https://sepolia.optimism.io",
  explorerUrl: "https://sepolia-optimism.etherscan.io",
  isTestnet: true,
  nativeCurrency: "ETH",
  erc8004Identity: "",
  createdAt: 1000,
};

describe("GET /chains", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.listChains.mockReturnValue([]); });

  it("returns empty array when no chains", async () => {
    const res = await makeApp().request("/chains");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns chains list", async () => {
    mockDb.listChains.mockReturnValue([sampleChain]);
    const res = await makeApp().request("/chains");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("optimism-sepolia");
  });
});

describe("GET /chains/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.getChain.mockReturnValue(undefined); });

  it("returns 404 when chain not found", async () => {
    const res = await makeApp().request("/chains/unknown");
    expect(res.status).toBe(404);
  });

  it("returns chain when found", async () => {
    mockDb.getChain.mockReturnValue(sampleChain);
    const res = await makeApp().request("/chains/optimism-sepolia");
    expect(res.status).toBe(200);
    expect((await res.json()).chainId).toBe(11155420);
  });
});

describe("POST /chains", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getChain.mockReturnValue(undefined); // no duplicate by default
  });

  it("creates a chain with valid input", async () => {
    const res = await makeApp().request("/chains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "base-sepolia", name: "Base Sepolia", chainId: 84532,
        rpcUrl: "https://sepolia.base.org", explorerUrl: "", isTestnet: true,
        nativeCurrency: "ETH", erc8004Identity: "",
      }),
    });
    expect(res.status).toBe(201);
    expect(mockDb.insertChain).toHaveBeenCalledOnce();
  });

  it("returns 409 when chain already exists", async () => {
    mockDb.getChain.mockReturnValue(sampleChain);
    const res = await makeApp().request("/chains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "optimism-sepolia", name: "X", chainId: 1,
        rpcUrl: "https://example.com", explorerUrl: "", isTestnet: false,
        nativeCurrency: "ETH", erc8004Identity: "" }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 on invalid input", async () => {
    const res = await makeApp().request("/chains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bad" }), // missing required fields
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /chains/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getChain.mockReturnValue(sampleChain); // both existence check and re-fetch return chain
    mockDb.updateChain.mockReturnValue(true);
  });

  it("updates name successfully", async () => {
    const res = await makeApp().request("/chains/optimism-sepolia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "OP Sepolia" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.updateChain).toHaveBeenCalledWith("optimism-sepolia", { name: "OP Sepolia" });
  });

  it("returns 400 when rpcUrl is not a valid URL", async () => {
    const res = await makeApp().request("/chains/optimism-sepolia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpcUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toEqual(expect.arrayContaining([expect.stringMatching(/rpcUrl/i)]));
  });

  it("returns 400 when rpcUrl uses non-http protocol", async () => {
    const res = await makeApp().request("/chains/optimism-sepolia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rpcUrl: "ws://example.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("accepts empty string for explorerUrl", async () => {
    const res = await makeApp().request("/chains/optimism-sepolia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explorerUrl: "" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when explorerUrl is invalid non-empty string", async () => {
    const res = await makeApp().request("/chains/optimism-sepolia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explorerUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when no known fields are sent", async () => {
    mockDb.updateChain.mockReturnValue(false);
    const res = await makeApp().request("/chains/optimism-sepolia", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unknownField: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when chain not found", async () => {
    mockDb.getChain.mockReturnValue(undefined);
    const res = await makeApp().request("/chains/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ghost" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /chains/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.listTokens.mockReturnValue([]);
    mockDb.deleteChain.mockReturnValue(true);
  });

  it("deletes a chain successfully", async () => {
    const res = await makeApp().request("/chains/optimism-sepolia", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });

  it("returns 409 when tokens reference this chain", async () => {
    mockDb.listTokens.mockReturnValue([{ id: "dmhkd-optimism-sepolia", chainSlug: "optimism-sepolia" }]);
    const res = await makeApp().request("/chains/optimism-sepolia", { method: "DELETE" });
    expect(res.status).toBe(409);
    expect((await res.json()).tokens).toContain("dmhkd-optimism-sepolia");
  });

  it("returns 404 when chain not found", async () => {
    mockDb.deleteChain.mockReturnValue(false);
    const res = await makeApp().request("/chains/ghost", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
