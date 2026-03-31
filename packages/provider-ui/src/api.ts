// packages/provider-ui/src/api.ts
import type { Service, ServicePaymentScheme, Payment, GatewayRequest, ServiceProvider, ChainConfig, TokenConfig } from "@x402-gateway-mvp/shared";
import { getStoredToken, clearAuth } from "./auth.js";

const BASE = "/provider";

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = { error: text }; }
  if (res.status === 401) {
    clearAuth();
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
  return body as T;
}

// Auth
export async function fetchNonce(address: string): Promise<string> {
  const data = await req<{ nonce: string }>(`/auth/nonce?address=${encodeURIComponent(address)}`);
  return data.nonce;
}

export interface VerifyResult {
  token: string;
  provider: ServiceProvider;
  needsProfile?: boolean;
}
export async function verifySignature(walletAddress: string, signature: string): Promise<VerifyResult> {
  return req<VerifyResult>("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ walletAddress, signature }),
  });
}

// Me
export async function getMe(): Promise<ServiceProvider> {
  return req<ServiceProvider>("/me");
}
export async function updateMe(data: Partial<Pick<ServiceProvider, "name" | "description" | "website">>): Promise<ServiceProvider> {
  return req<ServiceProvider>("/me", { method: "PUT", body: JSON.stringify(data) });
}

// Services
export async function listMyServices(): Promise<Service[]> {
  return req<Service[]>("/services");
}
export async function createService(data: object): Promise<Service> {
  return req<Service>("/services", { method: "POST", body: JSON.stringify(data) });
}
export async function updateService(id: string, data: object): Promise<Service> {
  return req<Service>(`/services/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function deleteService(id: string): Promise<void> {
  await req(`/services/${id}`, { method: "DELETE" });
}

// Schemes
export async function listSchemes(serviceId: string): Promise<ServicePaymentScheme[]> {
  return req<ServicePaymentScheme[]>(`/services/${serviceId}/schemes`);
}
export async function createScheme(serviceId: string, data: { network: string; tokenId: string; priceAmount: string; recipient?: string }): Promise<ServicePaymentScheme> {
  return req<ServicePaymentScheme>(`/services/${serviceId}/schemes`, { method: "POST", body: JSON.stringify(data) });
}
export async function updateScheme(serviceId: string, schemeId: string, data: { priceAmount?: string; recipient?: string }): Promise<ServicePaymentScheme> {
  return req<ServicePaymentScheme>(`/services/${serviceId}/schemes/${schemeId}`, { method: "PUT", body: JSON.stringify(data) });
}
export async function deleteScheme(serviceId: string, schemeId: string): Promise<void> {
  await req(`/services/${serviceId}/schemes/${schemeId}`, { method: "DELETE" });
}

// Data
export interface SummaryStats {
  totalRequests: number;
  settledRequests: number;
  successRate: number;
  totalRevenue: string;
  monthRevenue: string;
}
export interface TimeseriesDay {
  date: string;
  requests: number;
  settled: number;
  revenue: string;
}
export async function getSummaryStats(): Promise<SummaryStats> {
  return req<SummaryStats>("/stats/summary");
}
export async function getTimeseries(days = 7): Promise<TimeseriesDay[]> {
  const data = await req<{ days: TimeseriesDay[] }>(`/stats/timeseries?days=${days}`);
  return data.days;
}
export async function listRequests(serviceId?: string, status?: string): Promise<GatewayRequest[]> {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  if (status) params.set("status", status);
  return req<GatewayRequest[]>(`/requests${params.size ? "?" + params : ""}`);
}
export async function listPayments(serviceId?: string): Promise<Payment[]> {
  const params = new URLSearchParams();
  if (serviceId) params.set("serviceId", serviceId);
  return req<Payment[]>(`/payments${params.size ? "?" + params : ""}`);
}
export async function listAvailableTokens(): Promise<TokenConfig[]> {
  return req<TokenConfig[]>("/tokens");
}
export async function listAvailableChains(): Promise<ChainConfig[]> {
  return req<ChainConfig[]>("/chains");
}
