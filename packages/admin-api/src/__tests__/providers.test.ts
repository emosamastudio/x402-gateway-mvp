import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const sampleProvider = {
  id: "prov_1",
  name: "Acme Corp",
  walletAddress: "0x1111111111111111111111111111111111111111",
  description: "Test provider",
  website: "https://acme.example.com",
  createdAt: 1000,
};

const mockDb = {
  listProviders: vi.fn(() => []),
  getProvider: vi.fn(() => undefined as any),
  getProviderByWallet: vi.fn(() => undefined as any),
  insertProvider: vi.fn(),
  updateProvider: vi.fn(() => true),
  deleteProvider: vi.fn(() => true),
  listServicesByProvider: vi.fn(() => [] as any[]),
  updateService: vi.fn(),
};

vi.mock("@x402-gateway-mvp/core/src/db.js", () => ({
  getDb: vi.fn(() => mockDb),
}));

import { providersRouter } from "../routes/providers.js";

function makeApp() {
  const app = new Hono();
  app.route("/providers", providersRouter);
  return app;
}

const validBody = {
  name: "Acme Corp",
  walletAddress: "0x1111111111111111111111111111111111111111",
  description: "A test provider",
  website: "https://acme.example.com",
};

describe("POST /providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getProviderByWallet.mockReturnValue(undefined);
  });

  it("creates a provider with valid input", async () => {
    const res = await makeApp().request("/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Acme Corp");
    expect(body.id).toBeTruthy();
    expect(mockDb.insertProvider).toHaveBeenCalledOnce();
  });

  it("returns 409 when wallet address is already registered", async () => {
    mockDb.getProviderByWallet.mockReturnValue(sampleProvider);
    const res = await makeApp().request("/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already registered/i);
  });

  it("returns 400 on invalid input (missing required fields)", async () => {
    const res = await makeApp().request("/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /providers", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns empty array when no providers", async () => {
    mockDb.listProviders.mockReturnValue([]);
    const res = await makeApp().request("/providers");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns provider list", async () => {
    mockDb.listProviders.mockReturnValue([sampleProvider]);
    const res = await makeApp().request("/providers");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Acme Corp");
  });
});

describe("GET /providers/:id", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns provider when found", async () => {
    mockDb.getProvider.mockReturnValue(sampleProvider);
    const res = await makeApp().request("/providers/prov_1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Acme Corp");
  });

  it("returns 404 when not found", async () => {
    mockDb.getProvider.mockReturnValue(undefined);
    const res = await makeApp().request("/providers/ghost");
    expect(res.status).toBe(404);
  });
});

describe("GET /providers/:id/services", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 404 when provider not found", async () => {
    mockDb.getProvider.mockReturnValue(undefined);
    const res = await makeApp().request("/providers/ghost/services");
    expect(res.status).toBe(404);
  });

  it("returns services for provider", async () => {
    mockDb.getProvider.mockReturnValue(sampleProvider);
    mockDb.listServicesByProvider.mockReturnValue([{ id: "svc_1", name: "My API" }]);
    const res = await makeApp().request("/providers/prov_1/services");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("PUT /providers/:id", () => {
  const newWallet = "0x2222222222222222222222222222222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getProvider.mockReturnValue(sampleProvider); // both existence check and re-fetch
    mockDb.getProviderByWallet.mockReturnValue(undefined);
    mockDb.listServicesByProvider.mockReturnValue([]);
  });

  it("updates provider name", async () => {
    const res = await makeApp().request("/providers/prov_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Corp" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.updateProvider).toHaveBeenCalledWith("prov_1", { name: "Updated Corp" });
  });

  it("returns 404 when provider not found", async () => {
    mockDb.getProvider.mockReturnValue(undefined);
    const res = await makeApp().request("/providers/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ghost" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when new wallet is already taken by another provider", async () => {
    mockDb.getProviderByWallet.mockReturnValue({ ...sampleProvider, id: "prov_other" });
    const res = await makeApp().request("/providers/prov_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: newWallet }),
    });
    expect(res.status).toBe(409);
  });

  it("cascades wallet change to service recipients", async () => {
    // Existing service uses the old wallet as recipient
    const linkedService = {
      id: "svc_1",
      recipient: sampleProvider.walletAddress,
    };
    mockDb.listServicesByProvider.mockReturnValue([linkedService]);

    const res = await makeApp().request("/providers/prov_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: newWallet }),
    });
    expect(res.status).toBe(200);
    // Should have updated the service recipient to the new wallet
    expect(mockDb.updateService).toHaveBeenCalledWith("svc_1", { recipient: newWallet });
  });

  it("does not cascade when wallet is unchanged", async () => {
    const res = await makeApp().request("/providers/prov_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.updateService).not.toHaveBeenCalled();
  });
});

describe("DELETE /providers/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.getProvider.mockReturnValue(sampleProvider);
    mockDb.listServicesByProvider.mockReturnValue([]);
    mockDb.deleteProvider.mockReturnValue(true);
  });

  it("deletes provider with no services", async () => {
    const res = await makeApp().request("/providers/prov_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(mockDb.deleteProvider).toHaveBeenCalledWith("prov_1");
  });

  it("returns 409 when provider has associated services", async () => {
    mockDb.listServicesByProvider.mockReturnValue([
      { id: "svc_1", name: "My API" },
      { id: "svc_2", name: "Other API" },
    ]);
    const res = await makeApp().request("/providers/prov_1", { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.services).toHaveLength(2);
  });

  it("returns 404 when provider not found", async () => {
    mockDb.getProvider.mockReturnValue(undefined);
    const res = await makeApp().request("/providers/ghost", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
