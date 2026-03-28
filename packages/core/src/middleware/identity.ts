import type { Context, Next } from "hono";
import type { Service } from "@x402-gateway-mvp/shared";
import { checkAgentIdentity } from "@x402-gateway-mvp/chain";
import { getDb } from "../db.js";
import { randomUUID } from "crypto";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type ServiceResolver = (path: string) => Service | undefined;

function recordUnauthorized(c: Context, service: Service, agentAddress: string, errorReason: string, httpStatus: number) {
  const now = Date.now();
  const db = getDb();
  db.insertRequest({
    id: randomUUID(),
    serviceId: service.id,
    agentAddress,
    method: c.req.method,
    path: c.req.path,
    network: service.network,
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

export function identityMiddleware(resolveService: ServiceResolver) {
  return async (c: Context, next: Next) => {
    const service = resolveService(c.req.path);
    if (!service) return next();

    const agentAddress = c.req.header("X-Agent-Address") ??
                         c.req.header("x-agent-address");

    if (!agentAddress) {
      recordUnauthorized(c, service, "", "Agent address required (X-Agent-Address header)", 403);
      return c.json({ error: "Agent address required (X-Agent-Address header)" }, 403);
    }

    const db = getDb();
    const now = Date.now();

    // Check cache first
    const cached = db.getAgentCache(agentAddress.toLowerCase());
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return enforcePolicy(c, next, service, cached.isRegistered, cached.reputation, agentAddress);
    }

    // Query chain
    let isRegistered = false;
    let reputation = 0;
    try {
      const info = await checkAgentIdentity(agentAddress, service.network);
      isRegistered = info.isRegistered;
      reputation = info.reputation;
    } catch {
      // Chain RPC failure: use stale cache if available, else 503
      if (cached) {
        return enforcePolicy(c, next, service, cached.isRegistered, cached.reputation, agentAddress);
      }
      recordUnauthorized(c, service, agentAddress, "Chain unavailable, cannot verify agent identity", 503);
      return c.json({ error: "Chain unavailable, cannot verify agent identity" }, 503);
    }

    // Update cache
    db.upsertAgentCache({ address: agentAddress.toLowerCase(), isRegistered, reputation, cachedAt: now });

    return enforcePolicy(c, next, service, isRegistered, reputation, agentAddress);
  };
}

function enforcePolicy(
  c: Context, next: Next, service: Service,
  isRegistered: boolean, reputation: number, agentAddress: string
) {
  if (!isRegistered) {
    recordUnauthorized(c, service, agentAddress, "Agent not registered (ERC-8004)", 403);
    return c.json({ error: "Agent not registered (ERC-8004)", agentAddress }, 403);
  }
  if (reputation < service.minReputation) {
    recordUnauthorized(c, service, agentAddress, `Agent reputation insufficient (${reputation} < ${service.minReputation})`, 403);
    return c.json({
      error: "Agent reputation insufficient",
      current: reputation,
      required: service.minReputation,
    }, 403);
  }
  return next();
}
