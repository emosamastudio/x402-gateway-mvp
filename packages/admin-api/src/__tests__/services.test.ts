import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@x402-gateway/core/src/db.js", () => ({
  getDb: vi.fn(() => ({
    insertService: vi.fn(),
    listServices: vi.fn(() => []),
    getServiceById: vi.fn(),
  })),
}));

import { createAdminApp } from "../app.js";

describe("POST /services", () => {
  it("creates a service with valid input", async () => {
    const app = createAdminApp();
    const res = await app.request("/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Weather API",
        backendUrl: "http://localhost:3001",
        priceAmount: "0.001",
        network: "optimism-sepolia",
        recipient: "0x1111111111111111111111111111111111111111",
        minReputation: 0,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Weather API");
    expect(body.id).toBeTruthy();
  });

  it("rejects invalid input", async () => {
    const app = createAdminApp();
    const res = await app.request("/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", backendUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /services", () => {
  it("returns empty array when no services", async () => {
    const app = createAdminApp();
    const res = await app.request("/services");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
