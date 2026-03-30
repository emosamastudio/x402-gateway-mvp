// packages/admin-api/src/routes/provider-data.ts
import { Hono } from "hono";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import type { Payment, GatewayRequest } from "@x402-gateway-mvp/shared";
import type { ProviderEnv } from "../middleware/provider-jwt.js";

export const providerDataRouter = new Hono<ProviderEnv>();

// Helper: get all service IDs for a provider
function getProviderServiceIds(providerId: string): string[] {
  const db = getDb();
  return db.listServicesByProvider(providerId).map(s => s.id);
}

// GET /provider/requests?serviceId=&status=
providerDataRouter.get("/requests", (c) => {
  const providerId = c.get("providerId") as string;
  const filterServiceId = c.req.query("serviceId");
  const filterStatus = c.req.query("status");

  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);
  if (filterServiceId && !serviceIds.includes(filterServiceId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetIds = filterServiceId ? [filterServiceId] : serviceIds;
  const results: GatewayRequest[] = [];
  for (const sid of targetIds) {
    results.push(...db.listRequests(sid, filterStatus));
  }
  results.sort((a, b) => b.createdAt - a.createdAt);
  return c.json(results);
});

// GET /provider/payments?serviceId=
providerDataRouter.get("/payments", (c) => {
  const providerId = c.get("providerId") as string;
  const filterServiceId = c.req.query("serviceId");

  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);
  if (filterServiceId && !serviceIds.includes(filterServiceId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetIds = filterServiceId ? [filterServiceId] : serviceIds;
  const results: Payment[] = [];
  for (const sid of targetIds) {
    results.push(...db.listPayments(sid));
  }
  results.sort((a, b) => b.createdAt - a.createdAt);
  return c.json(results);
});

// GET /provider/stats/summary
providerDataRouter.get("/stats/summary", (c) => {
  const providerId = c.get("providerId") as string;
  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);

  let totalRequests = 0;
  let settledRequests = 0;
  let totalRevenue = 0;
  let monthRevenue = 0;
  const now = Date.now();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  for (const sid of serviceIds) {
    const requests = db.listRequests(sid);
    totalRequests += requests.length;
    settledRequests += requests.filter(r => r.gatewayStatus === "settled").length;

    const payments = db.listPayments(sid);
    for (const p of payments) {
      if (p.status === "settled") {
        const amount = parseFloat(p.amount) || 0;
        totalRevenue += amount;
        if (p.createdAt >= monthStart.getTime()) {
          monthRevenue += amount;
        }
      }
    }
  }

  return c.json({
    totalRequests,
    settledRequests,
    successRate: totalRequests > 0 ? Number((settledRequests / totalRequests).toFixed(4)) : 0,
    totalRevenue: totalRevenue.toFixed(6),
    monthRevenue: monthRevenue.toFixed(6),
  });
});

// GET /provider/stats/timeseries?days=7
providerDataRouter.get("/stats/timeseries", (c) => {
  const providerId = c.get("providerId") as string;
  const days = Math.min(30, Math.max(1, parseInt(c.req.query("days") ?? "7")));
  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);

  // Build date buckets for the last `days` days
  const buckets: Record<string, { requests: number; settled: number; revenue: number }> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    buckets[key] = { requests: 0, settled: 0, revenue: 0 };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  for (const sid of serviceIds) {
    for (const r of db.listRequests(sid)) {
      if (r.createdAt < cutoff) continue;
      const key = new Date(r.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      buckets[key].requests++;
      if (r.gatewayStatus === "settled") buckets[key].settled++;
    }
    for (const p of db.listPayments(sid)) {
      if (p.createdAt < cutoff || p.status !== "settled") continue;
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      buckets[key].revenue += parseFloat(p.amount) || 0;
    }
  }

  const result = Object.entries(buckets).map(([date, b]) => ({
    date,
    requests: b.requests,
    settled: b.settled,
    revenue: b.revenue.toFixed(6),
  }));

  return c.json({ days: result });
});

// GET /provider/tokens
providerDataRouter.get("/tokens", (c) => {
  const db = getDb();
  return c.json(db.listTokens().filter(t => t.isActive));
});

// GET /provider/chains
providerDataRouter.get("/chains", (c) => {
  const db = getDb();
  return c.json(db.listChains());
});
