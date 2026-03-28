/**
 * RPC Health Checker & Smart Router
 *
 * - Periodically pings each active RPC endpoint (eth_blockNumber)
 * - Tracks health status, latency, request count, error count
 * - Provides health-aware endpoint selection (failover + load balancing)
 */

import type { RpcEndpoint, RpcHealthStatus } from "@x402-gateway-mvp/shared";

/* ── In-memory state ── */

// chainSlug → sorted list of endpoints (by priority)
const _endpoints = new Map<string, RpcEndpoint[]>();
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;
let _persistFn: ((id: string, updates: Partial<RpcEndpoint>) => void) | null = null;
let _statsFn: ((id: string, isError: boolean) => void) | null = null;
let _snapshotFn: ((endpointId: string, chainSlug: string, snap: {
  totalRequests: number; totalErrors: number; latency: number; healthStatus: string; timestamp: number;
}) => void) | null = null;

/* ── Registration ── */

export function registerRpcEndpoints(endpoints: RpcEndpoint[]): void {
  _endpoints.clear();
  for (const ep of endpoints) {
    const list = _endpoints.get(ep.chainSlug) || [];
    list.push({ ...ep });
    _endpoints.set(ep.chainSlug, list);
  }
  // Sort each list by priority
  for (const [, list] of _endpoints) {
    list.sort((a, b) => a.priority - b.priority);
  }
}

export function addRpcEndpoint(ep: RpcEndpoint): void {
  const list = _endpoints.get(ep.chainSlug) || [];
  // Remove existing if same id
  const idx = list.findIndex((e) => e.id === ep.id);
  if (idx >= 0) list.splice(idx, 1);
  list.push({ ...ep });
  list.sort((a, b) => a.priority - b.priority);
  _endpoints.set(ep.chainSlug, list);
}

export function removeRpcEndpoint(id: string): void {
  for (const [slug, list] of _endpoints) {
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      if (list.length === 0) _endpoints.delete(slug);
      return;
    }
  }
}

export function getRpcEndpoints(chainSlug: string): RpcEndpoint[] {
  return _endpoints.get(chainSlug) || [];
}

export function getAllRpcEndpoints(): RpcEndpoint[] {
  const result: RpcEndpoint[] = [];
  for (const list of _endpoints.values()) result.push(...list);
  return result;
}

/* ── Smart endpoint selection ── */

/**
 * Select the best available RPC URL for a chain.
 * Strategy: prefer active + healthy endpoints sorted by priority.
 * Falls back to degraded, then any active endpoint.
 */
export function selectRpcUrl(chainSlug: string): string {
  const eps = _endpoints.get(chainSlug);
  if (!eps || eps.length === 0) {
    throw new Error(`No RPC endpoints registered for chain "${chainSlug}"`);
  }

  // Phase 1: active + healthy
  const healthy = eps.filter((e) => e.isActive && e.healthStatus === "healthy");
  if (healthy.length > 0) return healthy[0].url;

  // Phase 2: active + degraded
  const degraded = eps.filter((e) => e.isActive && e.healthStatus === "degraded");
  if (degraded.length > 0) return degraded[0].url;

  // Phase 3: active + unknown (not yet checked)
  const unknown = eps.filter((e) => e.isActive && e.healthStatus === "unknown");
  if (unknown.length > 0) return unknown[0].url;

  // Phase 4: any active (even "down" — better than nothing)
  const anyActive = eps.filter((e) => e.isActive);
  if (anyActive.length > 0) return anyActive[0].url;

  // Phase 5: completely fallback to first
  return eps[0].url;
}

/**
 * Select an endpoint and return its ID + URL for stats tracking.
 */
export function selectRpcEndpoint(chainSlug: string): { id: string; url: string } {
  const eps = _endpoints.get(chainSlug);
  if (!eps || eps.length === 0) {
    throw new Error(`No RPC endpoints registered for chain "${chainSlug}"`);
  }

  const candidates = [
    eps.filter((e) => e.isActive && e.healthStatus === "healthy"),
    eps.filter((e) => e.isActive && e.healthStatus === "degraded"),
    eps.filter((e) => e.isActive && e.healthStatus === "unknown"),
    eps.filter((e) => e.isActive),
    eps,
  ];
  for (const list of candidates) {
    if (list.length > 0) return { id: list[0].id, url: list[0].url };
  }
  return { id: eps[0].id, url: eps[0].url };
}

/**
 * Record an RPC call result (success/error) for stats.
 */
export function recordRpcCall(endpointId: string, isError: boolean): void {
  // Update in-memory
  for (const list of _endpoints.values()) {
    const ep = list.find((e) => e.id === endpointId);
    if (ep) {
      ep.totalRequests++;
      if (isError) ep.totalErrors++;
      break;
    }
  }
  // Persist to DB
  if (_statsFn) _statsFn(endpointId, isError);
}

/* ── Health checking ── */

export async function checkEndpointHealth(ep: RpcEndpoint): Promise<{ status: RpcHealthStatus; latency: number }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

    const res = await fetch(ep.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latency = Date.now() - start;

    if (!res.ok) return { status: "down", latency };

    const data = await res.json() as any;
    if (data.error) return { status: "degraded", latency };

    // Healthy but slow? Mark as degraded (>5s)
    if (latency > 5000) return { status: "degraded", latency };
    return { status: "healthy", latency };
  } catch {
    return { status: "down", latency: Date.now() - start };
  }
}

async function runHealthChecks(): Promise<void> {
  const allEndpoints: RpcEndpoint[] = [];
  for (const list of _endpoints.values()) {
    for (const ep of list) {
      if (ep.isActive) allEndpoints.push(ep);
    }
  }

  // Check all endpoints in parallel (with concurrency limit)
  const batchSize = 5;
  for (let i = 0; i < allEndpoints.length; i += batchSize) {
    const batch = allEndpoints.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (ep) => {
        const result = await checkEndpointHealth(ep);
        // Update in-memory
        ep.healthStatus = result.status;
        ep.lastLatency = result.latency;
        ep.lastHealthCheck = Date.now();
        const now = Date.now();
        // Persist
        if (_persistFn) {
          _persistFn(ep.id, {
            healthStatus: result.status,
            lastLatency: result.latency,
            lastHealthCheck: now,
          });
        }
        // Snapshot for time-series stats
        if (_snapshotFn) {
          _snapshotFn(ep.id, ep.chainSlug, {
            totalRequests: ep.totalRequests,
            totalErrors: ep.totalErrors,
            latency: result.latency,
            healthStatus: result.status,
            timestamp: now,
          });
        }
        return { id: ep.id, ...result };
      })
    );

    // Log any failures silently
    for (const r of results) {
      if (r.status === "rejected") {
        console.warn("[rpc-health] Health check failed:", r.reason);
      }
    }
  }
}

/* ── Lifecycle ── */

export interface RpcHealthConfig {
  /** How often to check health in ms (default: 30_000 = 30s) */
  intervalMs?: number;
  /** Function to persist endpoint updates to DB */
  persist?: (id: string, updates: Partial<RpcEndpoint>) => void;
  /** Function to record per-call stats to DB */
  recordStats?: (id: string, isError: boolean) => void;
  /** Function to record a time-series snapshot for the stats dashboard */
  snapshotStats?: (endpointId: string, chainSlug: string, snap: {
    totalRequests: number; totalErrors: number; latency: number; healthStatus: string; timestamp: number;
  }) => void;
}

export function startHealthChecker(config: RpcHealthConfig = {}): void {
  const intervalMs = config.intervalMs ?? 30_000;
  _persistFn = config.persist ?? null;
  _statsFn = config.recordStats ?? null;
  _snapshotFn = config.snapshotStats ?? null;

  // Run once immediately
  runHealthChecks().catch((err) => console.warn("[rpc-health] Initial check error:", err));

  // Then periodically
  if (_healthCheckInterval) clearInterval(_healthCheckInterval);
  _healthCheckInterval = setInterval(() => {
    runHealthChecks().catch((err) => console.warn("[rpc-health] Check error:", err));
  }, intervalMs);
}

export function stopHealthChecker(): void {
  if (_healthCheckInterval) {
    clearInterval(_healthCheckInterval);
    _healthCheckInterval = null;
  }
  _persistFn = null;
  _statsFn = null;
  _snapshotFn = null;
}

/** Trigger a manual health check (e.g. from admin UI) */
export async function triggerHealthCheck(): Promise<void> {
  await runHealthChecks();
}
