/**
 * Simple echo API server for testing the x402 gateway proxy.
 * Listens on port 9999 and echoes back request info as JSON.
 */
import { createServer } from "http";

const PORT = 9999;

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  console.log(`[echo] ${req.method} ${url.pathname}`);

  let body = "";
  req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
  req.on("end", () => {
    const payload = {
      message: "Hello from echo server!",
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      body: body || undefined,
      timestamp: new Date().toISOString(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload, null, 2));
  });
}).listen(PORT, () => {
  console.log(`✅ Echo server running on http://localhost:${PORT}`);
});
