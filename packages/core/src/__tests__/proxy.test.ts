import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { proxyToBackend } from "../proxy.js";
import type { Service } from "@x402-gateway-mvp/shared";

const mockService: Service = {
  id: "svc_1", name: "Test", gatewayPath: "/weather",
  backendUrl: "http://backend:3001",
  priceAmount: "0.001", priceCurrency: "DMHKD", network: "optimism-sepolia",
  tokenId: "dmhkd-optimism-sepolia",
  recipient: "0x1111111111111111111111111111111111111111",
  apiKey: "", minReputation: 0, createdAt: 1, providerId: "",
};

describe("proxyToBackend", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeApp(svc: Service = mockService) {
    const app = new Hono();
    app.all("/*", (c) => proxyToBackend(c, svc));
    return app;
  }

  it("strips gatewayPath prefix and forwards sub-path to backend", async () => {
    await makeApp().request("/weather/forecast?q=rain");
    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://backend:3001/forecast?q=rain");
  });

  it("handles exact gatewayPath match with no sub-path", async () => {
    await makeApp().request("/weather");
    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://backend:3001");
  });

  it("strips trailing slash from backendUrl", async () => {
    const svc = { ...mockService, backendUrl: "http://backend:3001/" };
    await makeApp(svc).request("/weather/data");
    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://backend:3001/data");
  });

  it("preserves query string", async () => {
    await makeApp().request("/weather/forecast?city=hk&units=metric");
    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toContain("?city=hk&units=metric");
  });

  it("forwards only allowed headers, drops sensitive ones", async () => {
    await makeApp().request("/weather/data", {
      headers: {
        "accept": "application/json",
        "content-type": "text/plain",
        "x-custom-secret": "should-not-pass",
        "payment-signature": "sig123",
      },
    });
    const [, opts] = fetchSpy.mock.calls[0];
    const headers = opts.headers as Headers;
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBe("text/plain");
    expect(headers.get("x-custom-secret")).toBeNull();
    expect(headers.get("payment-signature")).toBeNull();
  });

  it("injects Authorization: Bearer when apiKey is set", async () => {
    const svc = { ...mockService, apiKey: "my-secret-key" };
    await makeApp(svc).request("/weather/data");
    const [, opts] = fetchSpy.mock.calls[0];
    expect((opts.headers as Headers).get("authorization")).toBe("Bearer my-secret-key");
  });

  it("does not inject Authorization when apiKey is empty", async () => {
    await makeApp().request("/weather/data");
    const [, opts] = fetchSpy.mock.calls[0];
    expect((opts.headers as Headers).get("authorization")).toBeNull();
  });

  it("sends body for POST requests", async () => {
    await makeApp().request("/weather/data", {
      method: "POST",
      body: "hello",
      headers: { "content-type": "text/plain" },
    });
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeDefined();
  });

  it("sends no body for GET requests", async () => {
    await makeApp().request("/weather/data");
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.method).toBe("GET");
    expect(opts.body).toBeUndefined();
  });

  it("sends no body for HEAD requests", async () => {
    await makeApp().request("/weather/data", { method: "HEAD" });
    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.body).toBeUndefined();
  });
});
