import { Hono } from "hono";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import {
  addRpcEndpoint,
  removeRpcEndpoint,
  getRpcEndpoints,
  getAllRpcEndpoints,
  triggerHealthCheck,
  checkEndpointHealth,
} from "@x402-gateway-mvp/chain";
import type { RpcEndpoint } from "@x402-gateway-mvp/shared";

export const rpcEndpointsRouter = new Hono();

// List all RPC endpoints, optionally filtered by chainSlug
rpcEndpointsRouter.get("/", (c) => {
  const chainSlug = c.req.query("chainSlug");
  const db = getDb();
  const endpoints = chainSlug ? db.listRpcEndpoints(chainSlug) : db.listRpcEndpoints();
  return c.json(endpoints);
});

// Get time-series stats history for a chain
// Query params: chainSlug (required), hours (optional, default 1)
rpcEndpointsRouter.get("/stats-history", (c) => {
  const chainSlug = c.req.query("chainSlug");
  if (!chainSlug) return c.json({ error: "chainSlug is required" }, 400);
  const hours = Number(c.req.query("hours") ?? "1");
  const sinceMs = Date.now() - Math.min(hours, 24) * 3600_000;
  const db = getDb();
  const rows = db.getRpcStatsHistory(chainSlug, sinceMs);
  return c.json(rows);
});

// Get per-chain summary (aggregated from rpc_endpoints)
rpcEndpointsRouter.get("/chain-summary", (c) => {
  const db = getDb();
  return c.json(db.getRpcChainSummary());
});

// Get single endpoint
rpcEndpointsRouter.get("/:id", (c) => {
  const ep = getDb().getRpcEndpoint(c.req.param("id"));
  if (!ep) return c.json({ error: "RPC endpoint not found" }, 404);
  return c.json(ep);
});

// Create RPC endpoint
rpcEndpointsRouter.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.chainSlug || !body?.url) {
    return c.json({ error: "chainSlug and url are required" }, 400);
  }

  const db = getDb();

  // Validate chain exists
  if (!db.getChain(body.chainSlug)) {
    return c.json({ error: `Chain "${body.chainSlug}" not found` }, 400);
  }

  // Duplicate check
  const existing = db.getRpcEndpointByChainAndUrl(body.chainSlug, body.url);
  if (existing) {
    return c.json({
      error: `该链上已存在相同 URL 的 RPC 端点: "${existing.label || existing.id}"`,
      existingId: existing.id,
    }, 409);
  }

  // Connectivity check — probe before accepting
  const probeEp = {
    id: "__probe__",
    chainSlug: body.chainSlug,
    url: body.url,
    label: "", priority: 0, isActive: true,
    healthStatus: "unknown" as const,
    lastHealthCheck: 0, lastLatency: -1,
    totalRequests: 0, totalErrors: 0, createdAt: 0,
  };
  const { status: probeStatus, latency } = await checkEndpointHealth(probeEp);
  if (probeStatus === "down") {
    return c.json({
      error: `RPC 端点无法连通，请检查 URL 是否正确（连接超时或拒绝）`,
    }, 422);
  }

  const ep: RpcEndpoint = {
    id: `rpc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chainSlug: body.chainSlug,
    url: body.url,
    label: body.label || "",
    priority: body.priority ?? 0,
    isActive: body.isActive !== false,
    healthStatus: probeStatus,
    lastHealthCheck: Date.now(),
    lastLatency: latency,
    totalRequests: 0,
    totalErrors: 0,
    createdAt: Date.now(),
  };

  db.insertRpcEndpoint(ep);
  addRpcEndpoint(ep); // Update in-memory
  return c.json(ep, 201);
});

// Update RPC endpoint
rpcEndpointsRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getDb();
  const existing = db.getRpcEndpoint(id);
  if (!existing) return c.json({ error: "RPC endpoint not found" }, 404);

  const ok = db.updateRpcEndpoint(id, body);
  if (!ok) return c.json({ error: "No fields updated" }, 400);

  // Reload into in-memory
  const updated = db.getRpcEndpoint(id)!;
  addRpcEndpoint(updated);
  return c.json(updated);
});

// Delete RPC endpoint
rpcEndpointsRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();

  // Ensure at least one endpoint remains for the chain
  const ep = db.getRpcEndpoint(id);
  if (!ep) return c.json({ error: "RPC endpoint not found" }, 404);

  const siblings = db.listRpcEndpoints(ep.chainSlug);
  if (siblings.length <= 1) {
    return c.json({ error: "不能删除最后一个 RPC 端点，每条链至少需要一个端点" }, 400);
  }

  const ok = db.deleteRpcEndpoint(id);
  if (!ok) return c.json({ error: "RPC endpoint not found" }, 404);
  removeRpcEndpoint(id);
  return c.json({ deleted: true });
});

// Trigger manual health check
rpcEndpointsRouter.post("/health-check", async (c) => {
  await triggerHealthCheck();
  // Return fresh data from memory
  const endpoints = getAllRpcEndpoints();
  return c.json({ checked: endpoints.length, endpoints });
});

// Reset stats for an endpoint
rpcEndpointsRouter.post("/:id/reset-stats", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const ep = db.getRpcEndpoint(id);
  if (!ep) return c.json({ error: "RPC endpoint not found" }, 404);

  db.updateRpcEndpoint(id, { totalRequests: 0, totalErrors: 0 });
  const updated = db.getRpcEndpoint(id)!;
  addRpcEndpoint(updated);
  return c.json(updated);
});
