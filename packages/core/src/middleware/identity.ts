import type { Context, Next } from "hono";
import type { Service, ServicePaymentScheme } from "@x402-gateway-mvp/shared";
import { checkAgentIdentity } from "@x402-gateway-mvp/chain";
import { getDb } from "../db.js";
import { randomUUID } from "crypto";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type SchemeResolver = (path: string) => { service: Service; scheme: ServicePaymentScheme } | undefined;

function recordUnauthorized(c: Context, service: Service, network: string, agentAddress: string, errorReason: string, httpStatus: number) {
  const now = Date.now();
  const db = getDb();
  db.insertRequest({
    id: randomUUID(),
    serviceId: service.id,
    agentAddress,
    method: c.req.method,
    path: c.req.path,
    network,
    gatewayStatus: "unauthorized",
    httpStatus,
    responseStatus: 0,
    responseBody: "",
    errorReason,
    paymentId: "",
    challengeAt: 0,
    verifiedAt: 0,
    proxyAt: 0,
    settledAt: 0,
    createdAt: now,
  });
}

export function identityMiddleware(resolveScheme: SchemeResolver) {
  return async (c: Context, next: Next) => {
    const resolved = resolveScheme(c.req.path);
    if (!resolved) return next();

    const { service, scheme } = resolved;
    const agentAddress = c.req.header("X-Agent-Address") ??
                         c.req.header("x-agent-address");

    if (!agentAddress) {
      recordUnauthorized(c, service, scheme.network, "", "Agent address required (X-Agent-Address header)", 403);
      return c.json({ error: "Agent address required (X-Agent-Address header)" }, 403);
    }

    const db = getDb();
    const now = Date.now();

    // Check cache first
    const cached = db.getAgentCache(agentAddress.toLowerCase());
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return enforcePolicy(c, next, service, scheme.network, cached.isRegistered, cached.reputation, agentAddress);
    }

    // Query chain
    let isRegistered = false;
    let reputation = 0;
    try {
      const info = await checkAgentIdentity(agentAddress, scheme.network);
      isRegistered = info.isRegistered;
      reputation = info.reputation;
    } catch {
      // Chain RPC failure: use stale cache if available, else 503
      if (cached) {
        return enforcePolicy(c, next, service, scheme.network, cached.isRegistered, cached.reputation, agentAddress);
      }
      recordUnauthorized(c, service, scheme.network, agentAddress, "Chain unavailable, cannot verify agent identity", 503);
      return c.json({ error: "Chain unavailable, cannot verify agent identity" }, 503);
    }

    // Update cache
    db.upsertAgentCache({ address: agentAddress.toLowerCase(), isRegistered, reputation, cachedAt: now });

    return enforcePolicy(c, next, service, scheme.network, isRegistered, reputation, agentAddress);
  };
}

function enforcePolicy(
  c: Context, next: Next, service: Service, network: string,
  isRegistered: boolean, reputation: number, agentAddress: string
) {
  if (!isRegistered) {
    recordUnauthorized(c, service, network, agentAddress, "Agent not registered (ERC-8004)", 403);
    return c.json({ error: "Agent not registered (ERC-8004)", agentAddress }, 403);
  }
  if (reputation < service.minReputation) {
    recordUnauthorized(c, service, network, agentAddress, `Agent reputation insufficient (${reputation} < ${service.minReputation})`, 403);
    return c.json({
      error: "Agent reputation insufficient",
      current: reputation,
      required: service.minReputation,
    }, 403);
  }
  return next();
}
