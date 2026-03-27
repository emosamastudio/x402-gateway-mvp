import type { Context, Next } from "hono";
import type { Service } from "@x402-gateway/shared";
import { checkAgentIdentity } from "@x402-gateway/chain";
import { getDb } from "../db.js";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type ServiceResolver = (path: string) => Service | undefined;

export function identityMiddleware(resolveService: ServiceResolver) {
  return async (c: Context, next: Next) => {
    const service = resolveService(c.req.path);
    if (!service) return next();

    const agentAddress = c.req.header("X-Agent-Address") ??
                         c.req.header("x-agent-address");

    if (!agentAddress) {
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
    return c.json({ error: "Agent not registered (ERC-8004)", agentAddress }, 403);
  }
  if (reputation < service.minReputation) {
    return c.json({
      error: "Agent reputation insufficient",
      current: reputation,
      required: service.minReputation,
    }, 403);
  }
  return next();
}
