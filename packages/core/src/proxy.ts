import type { Context } from "hono";
import type { Service } from "@x402-gateway-mvp/shared";

// Headers that should be forwarded from the client to the backend.
// Everything else (browser security headers, hop-by-hop, x402-specific) is dropped.
const FORWARD_HEADERS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "content-length",
  "user-agent",
  "x-request-id",
  "x-forwarded-for",
]);

export async function proxyToBackend(c: Context, service: Service): Promise<Response> {
  const url = new URL(c.req.url);
  const { backendUrl, gatewayPath, apiKey } = service;

  // Strip the gateway path prefix from the incoming request, then append to backendUrl
  const gp = gatewayPath.replace(/\/$/, "");
  let subPath = url.pathname;
  if (gp && subPath.startsWith(gp)) {
    subPath = subPath.slice(gp.length);
  }
  const targetUrl = backendUrl.replace(/\/$/, "") + subPath + url.search;
  console.log(`[proxy] ${c.req.method} ${targetUrl}`);

  const backend = new URL(backendUrl);

  // Build a clean header set — only forward safe/useful headers
  const headers = new Headers();
  headers.set("host", backend.host);
  for (const [key, value] of c.req.raw.headers.entries()) {
    if (FORWARD_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  // Forward API key if configured
  if (apiKey) {
    headers.set("authorization", `Bearer ${apiKey}`);
  }

  const response = await fetch(targetUrl, {
    method: c.req.method,
    headers,
    body: c.req.method !== "GET" && c.req.method !== "HEAD"
      ? await c.req.arrayBuffer()
      : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  console.log(`[proxy] response ${response.status} (final url: ${response.url})`);
  return response;
}
