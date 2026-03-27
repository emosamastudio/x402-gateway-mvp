import { serve } from "@hono/node-server";
import { createCoreApp } from "./app.js";

const port = Number(process.env.CORE_PORT ?? 8402);
const app = createCoreApp();

serve({ fetch: app.fetch, port }, () => {
  console.log(`x402 Gateway running on :${port}`);
});
