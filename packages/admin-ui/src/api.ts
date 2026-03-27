import type { Service, Payment, AgentInfo } from "@x402-gateway/shared";

const BASE = "/api";

export async function listServices(): Promise<Service[]> {
  const res = await fetch(`${BASE}/services`);
  return res.json();
}

export async function createService(data: {
  name: string; backendUrl: string; priceAmount: string;
  network: string; recipient: string; minReputation: number;
}): Promise<Service> {
  const res = await fetch(`${BASE}/services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}

export async function listPayments(serviceId?: string): Promise<Payment[]> {
  const url = serviceId
    ? `${BASE}/payments?serviceId=${serviceId}`
    : `${BASE}/payments`;
  const res = await fetch(url);
  return res.json();
}

export async function lookupAgent(address: string, network: string): Promise<AgentInfo & { address: string }> {
  const res = await fetch(`${BASE}/agents/${address}?network=${network}`);
  return res.json();
}
