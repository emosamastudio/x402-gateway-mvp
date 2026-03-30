import type { Service, Payment, AgentInfo, GatewayRequest, ChainConfig, TokenConfig, RpcEndpoint, ServiceProvider } from "@x402-gateway-mvp/shared";

const BASE = "/api";
const ADMIN_KEY = import.meta.env.VITE_ADMIN_API_KEY ?? "change-me-in-production";

const authHeaders = () => ({
  "Authorization": `Bearer ${ADMIN_KEY}`,
});

/* ── Safe response helpers ──────────────────────────────────── */

/** Parse response body as JSON; throw a readable error on failure. */
async function safeJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(`Empty response (HTTP ${res.status})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from server (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

/** Assert res.ok, extract error message from JSON body, then throw. */
async function assertOk(res: Response): Promise<void> {
  if (res.ok) return;
  const text = await res.text();
  let msg = `HTTP ${res.status}`;
  try {
    const body = JSON.parse(text);
    if (body?.error) msg = body.error;
  } catch { /* use generic msg */ }
  throw new Error(msg);
}

/* ── Chains ──────────────────────────────────────────────────── */

export async function listChains(): Promise<ChainConfig[]> {
  const res = await fetch(`${BASE}/chains`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function createChain(data: Omit<ChainConfig, "createdAt">): Promise<ChainConfig> {
  const res = await fetch(`${BASE}/chains`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function updateChain(id: string, data: Partial<ChainConfig>): Promise<ChainConfig> {
  const res = await fetch(`${BASE}/chains/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function deleteChain(id: string): Promise<void> {
  const res = await fetch(`${BASE}/chains/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(res);
}

/* ── RPC Endpoints ───────────────────────────────────────────── */

export async function listRpcEndpoints(chainSlug?: string): Promise<RpcEndpoint[]> {
  const qs = chainSlug ? `?chainSlug=${chainSlug}` : "";
  const res = await fetch(`${BASE}/rpc-endpoints${qs}`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function createRpcEndpoint(data: { chainSlug: string; url: string; label?: string; priority?: number; isActive?: boolean }): Promise<RpcEndpoint> {
  const res = await fetch(`${BASE}/rpc-endpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function updateRpcEndpoint(id: string, data: Partial<RpcEndpoint>): Promise<RpcEndpoint> {
  const res = await fetch(`${BASE}/rpc-endpoints/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function deleteRpcEndpoint(id: string): Promise<void> {
  const res = await fetch(`${BASE}/rpc-endpoints/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(res);
}

export async function triggerRpcHealthCheck(): Promise<{ checked: number; endpoints: RpcEndpoint[] }> {
  const res = await fetch(`${BASE}/rpc-endpoints/health-check`, {
    method: "POST",
    headers: authHeaders(),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function resetRpcEndpointStats(id: string): Promise<RpcEndpoint> {
  const res = await fetch(`${BASE}/rpc-endpoints/${id}/reset-stats`, {
    method: "POST",
    headers: authHeaders(),
  });
  await assertOk(res);
  return safeJson(res);
}

export interface RpcStatsSnapshot {
  id: string;
  endpointId: string;
  chainSlug: string;
  timestamp: number;
  totalRequests: number;
  totalErrors: number;
  latency: number;
  healthStatus: string;
}

export interface RpcChainSummary {
  chainSlug: string;
  endpointCount: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  totalRequests: number;
  totalErrors: number;
  avgLatency: number;
}

export async function listRpcStatsHistory(chainSlug: string, hours = 1): Promise<RpcStatsSnapshot[]> {
  const res = await fetch(`${BASE}/rpc-endpoints/stats-history?chainSlug=${encodeURIComponent(chainSlug)}&hours=${hours}`, {
    headers: authHeaders(),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function listRpcChainSummary(): Promise<RpcChainSummary[]> {
  const res = await fetch(`${BASE}/rpc-endpoints/chain-summary`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}



/* ── Tokens ──────────────────────────────────────────────────── */

export async function listTokens(): Promise<TokenConfig[]> {
  const res = await fetch(`${BASE}/tokens`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

/* ── Providers ───────────────────────────────────────────────── */

export type { ServiceProvider };

export async function listProviders(): Promise<ServiceProvider[]> {
  const res = await fetch(`${BASE}/providers`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function getProvider(id: string): Promise<ServiceProvider> {
  const res = await fetch(`${BASE}/providers/${id}`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function createProvider(data: { name: string; walletAddress: string; description?: string; website?: string }): Promise<ServiceProvider> {
  const res = await fetch(`${BASE}/providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function updateProvider(id: string, data: Partial<{ name: string; walletAddress: string; description: string; website: string }>): Promise<ServiceProvider> {
  const res = await fetch(`${BASE}/providers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function deleteProvider(id: string): Promise<void> {
  const res = await fetch(`${BASE}/providers/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(res);
}

export async function listProviderServices(providerId: string): Promise<Service[]> {
  const res = await fetch(`${BASE}/providers/${providerId}/services`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function createToken(data: Omit<TokenConfig, "createdAt">): Promise<TokenConfig> {
  const res = await fetch(`${BASE}/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function updateToken(id: string, data: Partial<TokenConfig>): Promise<TokenConfig> {
  const res = await fetch(`${BASE}/tokens/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function deleteToken(id: string): Promise<void> {
  const res = await fetch(`${BASE}/tokens/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(res);
}

export interface TokenVerifyResult {
  contractAddress: string;
  chainSlug: string;
  erc20: boolean;
  erc3009: boolean;
  erc3009Warning?: string;
  eip712Domain: boolean;
  domainSeparator: string | null;
  domainSeparatorWarning?: string;
  x402Compatible?: boolean;
  name?: string;
  symbol?: string;
  decimals?: number;
  domainName?: string;
  domainVersion?: string;
  domainChainId?: number;
  domainVerifyingContract?: string;
  domainNameSource?: string; // "eip5267" = on-chain verified, "inferred" = derived from symbol
  domainNameWarning?: string;
  suggestedId?: string;
  error?: string;
  proxyDetected?: boolean;
  implementationAddress?: string;
}

export async function verifyTokenContract(chainSlug: string, contractAddress: string): Promise<TokenVerifyResult> {
  const res = await fetch(`${BASE}/tokens/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ chainSlug, contractAddress }),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function listServices(): Promise<Service[]> {
  const res = await fetch(`${BASE}/services`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function createService(data: {
  name: string; gatewayPath: string; backendUrl: string; priceAmount: string;
  network: string; tokenId: string; recipient?: string; providerId?: string; apiKey: string; minReputation: number;
}): Promise<Service> {
  const res = await fetch(`${BASE}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function updateService(id: string, data: Partial<{
  name: string; gatewayPath: string; backendUrl: string; priceAmount: string;
  network: string; tokenId: string; recipient?: string; providerId?: string; apiKey: string; minReputation: number;
}>): Promise<Service> {
  const res = await fetch(`${BASE}/services/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  await assertOk(res);
  return safeJson(res);
}

export async function deleteService(id: string): Promise<void> {
  const res = await fetch(`${BASE}/services/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await assertOk(res);
}

export async function listPayments(serviceId?: string): Promise<Payment[]> {
  const url = serviceId
    ? `${BASE}/payments?serviceId=${serviceId}`
    : `${BASE}/payments`;
  const res = await fetch(url, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function listRequests(serviceId?: string, status?: string): Promise<GatewayRequest[]> {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = qs ? `${BASE}/requests?${qs}` : `${BASE}/requests`;
  const res = await fetch(url, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function lookupAgent(address: string, network: string): Promise<AgentInfo & { address: string }> {
  const res = await fetch(`${BASE}/agents/${address}?network=${network}`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export interface AgentStats {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalPayments: number;
  settledPayments: number;
  failedPayments: number;
  totalSpent: string;
  lastSeen: number;
}

export interface AgentWithStats extends AgentInfo {
  stats: AgentStats;
}

export async function listAgents(): Promise<AgentWithStats[]> {
  const res = await fetch(`${BASE}/agents`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}

export async function getAgentDetail(address: string): Promise<{
  address: string;
  cached: AgentInfo | null;
  stats: AgentStats;
}> {
  const res = await fetch(`${BASE}/agents/${address}/stats`, { headers: authHeaders() });
  await assertOk(res);
  return safeJson(res);
}
