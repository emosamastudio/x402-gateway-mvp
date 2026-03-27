import type { Context } from "hono";

export async function proxyToBackend(c: Context, backendUrl: string): Promise<Response> {
  const url = new URL(c.req.url);
  const targetUrl = backendUrl.replace(/\/$/, "") + url.pathname + url.search;

  const headers = new Headers(c.req.raw.headers);
  // Remove x402-specific headers before forwarding
  headers.delete("PAYMENT-SIGNATURE");
  headers.delete("X-Agent-Address");

  const response = await fetch(targetUrl, {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD"
      ? await c.req.arrayBuffer()
      : undefined,
    signal: AbortSignal.timeout(10_000), // 10s backend timeout
  });

  return response;
}
