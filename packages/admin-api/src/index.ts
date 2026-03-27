import { serve } from "@hono/node-server";
import { createAdminApp } from "./app.js";

const port = Number(process.env.ADMIN_PORT ?? 8403);
const app = createAdminApp();
serve({ fetch: app.fetch, port }, () => {
  console.log(`Admin API running on :${port}`);
});
