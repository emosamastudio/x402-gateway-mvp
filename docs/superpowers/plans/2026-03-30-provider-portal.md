# Provider Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-serve Provider Portal where API service providers can register via wallet signature, manage their services, and view usage analytics.

**Architecture:** Extend `packages/admin-api` with new `/provider/*` routes protected by JWT (issued after wallet signature verification). Add a new `packages/provider-ui` Vite React app running on port 5174 that proxies `/provider/*` to admin-api on port 8403.

**Tech Stack:** Hono (existing), `hono/jwt` (built-in, no extra deps), viem `verifyMessage` (already in admin-api), React + Recharts (mirror admin-ui), TypeScript, pnpm workspace.

---

## File Map

### New files — admin-api
| File | Responsibility |
|------|---------------|
| `packages/admin-api/src/middleware/provider-jwt.ts` | In-memory nonce store, JWT sign/verify middleware, provider context type |
| `packages/admin-api/src/routes/provider-auth.ts` | `GET /provider/auth/nonce`, `POST /provider/auth/verify` |
| `packages/admin-api/src/routes/provider-me.ts` | `GET /provider/me`, `PUT /provider/me` |
| `packages/admin-api/src/routes/provider-services.ts` | `GET/POST/PUT/DELETE /provider/services[/:id]` |
| `packages/admin-api/src/routes/provider-data.ts` | `/provider/requests`, `/provider/payments`, `/provider/stats/*`, `/provider/tokens`, `/provider/chains` |

### Modified files — admin-api
| File | Change |
|------|--------|
| `packages/admin-api/src/app.ts` | Skip admin auth for `/provider/*`, mount `providerRouter` |

### New files — provider-ui
| File | Responsibility |
|------|---------------|
| `packages/provider-ui/package.json` | Package config, React + Recharts deps |
| `packages/provider-ui/tsconfig.json` | TypeScript config |
| `packages/provider-ui/vite.config.ts` | Port 5174, proxy `/provider` → `:8403` |
| `packages/provider-ui/index.html` | Entry HTML |
| `packages/provider-ui/src/main.tsx` | React mount point |
| `packages/provider-ui/src/App.tsx` | BrowserRouter + Routes (Login/Register/protected routes) |
| `packages/provider-ui/src/auth.ts` | JWT localStorage store, `useAuth` hook, `ProtectedRoute` |
| `packages/provider-ui/src/api.ts` | HTTP client with JWT header, typed API functions |
| `packages/provider-ui/src/components/Layout.tsx` | Sidebar nav + top bar |
| `packages/provider-ui/src/pages/Login.tsx` | Wallet connect → sign → exchange for JWT |
| `packages/provider-ui/src/pages/Register.tsx` | Fill name/description/website after first sign-in |
| `packages/provider-ui/src/pages/Dashboard.tsx` | KPI cards + line chart + bar chart + service summary |
| `packages/provider-ui/src/pages/Services.tsx` | List + CRUD own services |
| `packages/provider-ui/src/pages/Requests.tsx` | Request log table with filters |
| `packages/provider-ui/src/pages/Payments.tsx` | Payment table with explorer links |
| `packages/provider-ui/src/pages/Account.tsx` | Edit profile, disconnect wallet |

---

## Task 1: Provider JWT Middleware

**Files:**
- Create: `packages/admin-api/src/middleware/provider-jwt.ts`

- [ ] **Step 1: Write the file**

```typescript
// packages/admin-api/src/middleware/provider-jwt.ts
import { sign, verify } from "hono/jwt";
import type { Context, Next } from "hono";

const JWT_SECRET = process.env.PROVIDER_JWT_SECRET ?? (() => {
  const fallback = crypto.randomUUID();
  console.warn("⚠️  PROVIDER_JWT_SECRET not set — provider tokens will be invalidated on restart.");
  return fallback;
})();

const JWT_EXPIRES_IN = 60 * 60 * 24; // 24 hours in seconds

// In-memory nonce store: address → { nonce, expiresAt }
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

export function generateNonce(address: string): string {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  nonceStore.set(address.toLowerCase(), { nonce, expiresAt });
  return nonce;
}

export function getNonceMessage(address: string): string | null {
  const entry = nonceStore.get(address.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return null;
  }
  return `Sign in to x402 Gateway\nAddress: ${address}\nNonce: ${entry.nonce}`;
}

export function consumeNonce(address: string): boolean {
  const entry = nonceStore.get(address.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return false;
  }
  nonceStore.delete(address.toLowerCase());
  return true;
}

export async function signProviderJwt(providerId: string, walletAddress: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: providerId, address: walletAddress.toLowerCase(), iat: now, exp: now + JWT_EXPIRES_IN },
    JWT_SECRET,
    "HS256"
  );
}

export interface ProviderJwtPayload {
  sub: string;        // providerId
  address: string;    // walletAddress (lowercase)
  iat: number;
  exp: number;
}

export async function verifyProviderJwt(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing provider token" }, 401);
  }
  const token = header.slice(7);
  try {
    const payload = await verify(token, JWT_SECRET, "HS256") as ProviderJwtPayload;
    c.set("providerId", payload.sub);
    c.set("providerAddress", payload.address);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired provider token" }, 401);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/admin-api && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors on the new file.

- [ ] **Step 3: Commit**

```bash
git add packages/admin-api/src/middleware/provider-jwt.ts
git commit -m "feat(provider): add JWT middleware and nonce store"
```

---

## Task 2: Provider Auth Routes

**Files:**
- Create: `packages/admin-api/src/routes/provider-auth.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/admin-api/src/__tests__/provider-auth.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { providerAuthRouter } from "../routes/provider-auth.js";

// Mock viem verifyMessage
vi.mock("viem", () => ({
  verifyMessage: vi.fn(),
}));
// Mock db
vi.mock("@x402-gateway-mvp/core/src/db.js", () => ({
  getDb: vi.fn(() => ({
    getProviderByWallet: vi.fn(() => undefined),
    insertProvider: vi.fn(),
    getProvider: vi.fn((id: string) => ({
      id, name: "Test Provider", walletAddress: "0xabc",
      description: "", website: "", createdAt: Date.now(),
    })),
  })),
}));

const app = new Hono().route("/provider/auth", providerAuthRouter);

describe("GET /provider/auth/nonce", () => {
  it("returns a nonce message for a given address", async () => {
    const res = await app.request("/provider/auth/nonce?address=0xabc123");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(typeof body.message).toBe("string");
    expect(body.message).toContain("Sign in to x402 Gateway");
    expect(body.message).toContain("0xabc123");
  });

  it("returns 400 when address is missing", async () => {
    const res = await app.request("/provider/auth/nonce");
    expect(res.status).toBe(400);
  });
});

describe("POST /provider/auth/verify", () => {
  it("returns 400 when nonce not requested first", async () => {
    const { verifyMessage } = await import("viem");
    vi.mocked(verifyMessage).mockResolvedValue(true);

    const res = await app.request("/provider/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: "0xnew", signature: "0xsig" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/nonce/i);
  });

  it("returns 401 on bad signature", async () => {
    const { verifyMessage } = await import("viem");
    vi.mocked(verifyMessage).mockResolvedValue(false);

    // First get a nonce
    await app.request("/provider/auth/nonce?address=0xbadsig");

    const res = await app.request("/provider/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: "0xbadsig", signature: "0xwrong" }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd packages/admin-api && pnpm test --reporter=verbose 2>&1 | grep -A5 "provider-auth"
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the auth route**

```typescript
// packages/admin-api/src/routes/provider-auth.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { verifyMessage } from "viem";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import { generateNonce, getNonceMessage, consumeNonce, signProviderJwt } from "../middleware/provider-jwt.js";

export const providerAuthRouter = new Hono();

// GET /provider/auth/nonce?address=0x...
providerAuthRouter.get("/nonce", (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "address query param required" }, 400);
  generateNonce(address);
  const message = getNonceMessage(address)!;
  return c.json({ message });
});

// POST /provider/auth/verify  { walletAddress, signature }
providerAuthRouter.post("/verify", async (c) => {
  const { walletAddress, signature } = await c.req.json();
  if (!walletAddress || !signature) {
    return c.json({ error: "walletAddress and signature required" }, 400);
  }

  const message = getNonceMessage(walletAddress);
  if (!message) {
    return c.json({ error: "No valid nonce found. Call /nonce first." }, 400);
  }

  const valid = await verifyMessage({
    address: walletAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  // Consume nonce (prevent replay)
  consumeNonce(walletAddress);

  const db = getDb();
  let provider = db.getProviderByWallet(walletAddress);
  let needsProfile = false;

  if (!provider) {
    // Auto-create minimal provider record on first sign-in
    const id = `prov_${randomUUID()}`;
    const now = Date.now();
    db.insertProvider({ id, name: "", walletAddress, description: "", website: "", createdAt: now });
    provider = db.getProvider(id)!;
    needsProfile = true;
  }

  const token = await signProviderJwt(provider.id, walletAddress);
  return c.json({ token, provider, needsProfile });
});
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
cd packages/admin-api && pnpm test --reporter=verbose 2>&1 | grep -A5 "provider-auth"
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-api/src/routes/provider-auth.ts packages/admin-api/src/__tests__/provider-auth.test.ts
git commit -m "feat(provider): auth routes — nonce generation and wallet signature verification"
```

---

## Task 3: Provider Me Routes

**Files:**
- Create: `packages/admin-api/src/routes/provider-me.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/admin-api/src/routes/provider-me.ts
import { Hono } from "hono";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

export const providerMeRouter = new Hono();

// GET /provider/me
providerMeRouter.get("/", (c) => {
  const providerId = c.get("providerId") as string;
  const db = getDb();
  const provider = db.getProvider(providerId);
  if (!provider) return c.json({ error: "Provider not found" }, 404);
  return c.json(provider);
});

// PUT /provider/me  { name?, description?, website? }
providerMeRouter.put("/", async (c) => {
  const providerId = c.get("providerId") as string;
  const body = await c.req.json();
  const { name, description, website } = body;

  if (name !== undefined && typeof name !== "string") {
    return c.json({ error: "name must be a string" }, 400);
  }
  if (name !== undefined && name.trim() === "") {
    return c.json({ error: "name cannot be empty" }, 400);
  }

  const db = getDb();
  const updates: Record<string, string> = {};
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = String(description);
  if (website !== undefined) updates.website = String(website);

  db.updateProvider(providerId, updates);
  return c.json(db.getProvider(providerId));
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/admin-api && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/admin-api/src/routes/provider-me.ts
git commit -m "feat(provider): /provider/me routes — get and update own profile"
```

---

## Task 4: Provider Service Management Routes

**Files:**
- Create: `packages/admin-api/src/routes/provider-services.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/admin-api/src/routes/provider-services.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { CreateServiceSchema } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";

export const providerServicesRouter = new Hono();

// GET /provider/services
providerServicesRouter.get("/", (c) => {
  const providerId = c.get("providerId") as string;
  const db = getDb();
  return c.json(db.listServicesByProvider(providerId));
});

// POST /provider/services
providerServicesRouter.post("/", async (c) => {
  const providerId = c.get("providerId") as string;
  const body = await c.req.json();

  // Force providerId to be the authenticated provider
  const parsed = CreateServiceSchema.safeParse({ ...body, providerId });
  if (!parsed.success) {
    return c.json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  }

  const db = getDb();

  if (!db.getChain(parsed.data.network)) {
    return c.json({ error: `Chain "${parsed.data.network}" not found` }, 400);
  }
  const token = db.getToken(parsed.data.tokenId);
  if (!token) {
    return c.json({ error: `Token "${parsed.data.tokenId}" not found` }, 400);
  }
  if (token.chainSlug !== parsed.data.network) {
    return c.json({ error: `Token "${parsed.data.tokenId}" is on chain "${token.chainSlug}", not "${parsed.data.network}"` }, 400);
  }

  const provider = db.getProvider(providerId)!;
  const recipient = parsed.data.recipient || provider.walletAddress;

  const service = {
    ...parsed.data,
    id: `svc_${randomUUID()}`,
    priceCurrency: token.symbol,
    providerId,
    recipient,
    createdAt: Date.now(),
  };
  db.insertService(service);
  return c.json(service, 201);
});

// PUT /provider/services/:id
providerServicesRouter.put("/:id", async (c) => {
  const providerId = c.get("providerId") as string;
  const serviceId = c.req.param("id");
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service) return c.json({ error: "Service not found" }, 404);
  if (service.providerId !== providerId) return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const allowed = ["name", "backendUrl", "priceAmount", "apiKey", "minReputation", "recipient"];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  db.updateService(serviceId, updates);
  return c.json(db.getServiceById(serviceId));
});

// DELETE /provider/services/:id
providerServicesRouter.delete("/:id", (c) => {
  const providerId = c.get("providerId") as string;
  const serviceId = c.req.param("id");
  const db = getDb();

  const service = db.getServiceById(serviceId);
  if (!service) return c.json({ error: "Service not found" }, 404);
  if (service.providerId !== providerId) return c.json({ error: "Forbidden" }, 403);

  db.deleteService(serviceId);
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Check if `db.updateService` and `db.deleteService` exist**

```bash
grep -n "updateService\|deleteService\|insertService\|getServiceById" packages/core/src/db.ts
```
Expected: all four methods found. If `updateService` or `deleteService` are missing, add them to `db.ts` (see note below).

> **If `updateService` is missing**, add to `packages/core/src/db.ts` after `insertService`:
> ```typescript
> updateService(id: string, updates: Partial<Omit<Service,"id"|"createdAt">>): boolean {
>   const fields: string[] = [];
>   const values: any[] = [];
>   if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
>   if (updates.backendUrl !== undefined) { fields.push("backend_url = ?"); values.push(updates.backendUrl); }
>   if (updates.priceAmount !== undefined) { fields.push("price_amount = ?"); values.push(updates.priceAmount); }
>   if (updates.apiKey !== undefined) { fields.push("api_key = ?"); values.push(updates.apiKey); }
>   if (updates.minReputation !== undefined) { fields.push("min_reputation = ?"); values.push(updates.minReputation); }
>   if (updates.recipient !== undefined) { fields.push("recipient = ?"); values.push(updates.recipient); }
>   if (fields.length === 0) return false;
>   values.push(id);
>   return db.prepare(`UPDATE services SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
> },
> deleteService(id: string): boolean {
>   return db.prepare("DELETE FROM services WHERE id = ?").run(id).changes > 0;
> },
> ```

- [ ] **Step 3: Verify TypeScript**

```bash
cd packages/admin-api && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add packages/admin-api/src/routes/provider-services.ts packages/core/src/db.ts
git commit -m "feat(provider): service CRUD routes with ownership enforcement"
```

---

## Task 5: Provider Data Routes (requests, payments, stats, tokens, chains)

**Files:**
- Create: `packages/admin-api/src/routes/provider-data.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/admin-api/src/routes/provider-data.ts
import { Hono } from "hono";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import type { Payment, GatewayRequest } from "@x402-gateway-mvp/shared";

export const providerDataRouter = new Hono();

// Helper: get all service IDs for a provider
function getProviderServiceIds(providerId: string): string[] {
  const db = getDb();
  return db.listServicesByProvider(providerId).map(s => s.id);
}

// GET /provider/requests?serviceId=&status=
providerDataRouter.get("/requests", (c) => {
  const providerId = c.get("providerId") as string;
  const filterServiceId = c.req.query("serviceId");
  const filterStatus = c.req.query("status");

  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);
  if (filterServiceId && !serviceIds.includes(filterServiceId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetIds = filterServiceId ? [filterServiceId] : serviceIds;
  const results: GatewayRequest[] = [];
  for (const sid of targetIds) {
    results.push(...db.listRequests(sid, filterStatus));
  }
  results.sort((a, b) => b.createdAt - a.createdAt);
  return c.json(results);
});

// GET /provider/payments?serviceId=
providerDataRouter.get("/payments", (c) => {
  const providerId = c.get("providerId") as string;
  const filterServiceId = c.req.query("serviceId");

  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);
  if (filterServiceId && !serviceIds.includes(filterServiceId)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const targetIds = filterServiceId ? [filterServiceId] : serviceIds;
  const results: Payment[] = [];
  for (const sid of targetIds) {
    results.push(...db.listPayments(sid));
  }
  results.sort((a, b) => b.createdAt - a.createdAt);
  return c.json(results);
});

// GET /provider/stats/summary
providerDataRouter.get("/stats/summary", (c) => {
  const providerId = c.get("providerId") as string;
  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);

  let totalRequests = 0;
  let settledRequests = 0;
  let totalRevenue = 0;
  let monthRevenue = 0;
  const now = Date.now();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  for (const sid of serviceIds) {
    const requests = db.listRequests(sid);
    totalRequests += requests.length;
    settledRequests += requests.filter(r => r.gatewayStatus === "settled").length;

    const payments = db.listPayments(sid);
    for (const p of payments) {
      if (p.status === "settled") {
        const amount = parseFloat(p.amount) || 0;
        totalRevenue += amount;
        if (p.createdAt >= monthStart.getTime()) {
          monthRevenue += amount;
        }
      }
    }
  }

  return c.json({
    totalRequests,
    settledRequests,
    successRate: totalRequests > 0 ? Number((settledRequests / totalRequests).toFixed(4)) : 0,
    totalRevenue: totalRevenue.toFixed(6),
    monthRevenue: monthRevenue.toFixed(6),
  });
});

// GET /provider/stats/timeseries?days=7
providerDataRouter.get("/stats/timeseries", (c) => {
  const providerId = c.get("providerId") as string;
  const days = Math.min(30, Math.max(1, parseInt(c.req.query("days") ?? "7")));
  const db = getDb();
  const serviceIds = getProviderServiceIds(providerId);

  // Build date buckets for the last `days` days
  const buckets: Record<string, { requests: number; settled: number; revenue: number }> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    buckets[key] = { requests: 0, settled: 0, revenue: 0 };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  for (const sid of serviceIds) {
    for (const r of db.listRequests(sid)) {
      if (r.createdAt < cutoff) continue;
      const key = new Date(r.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      buckets[key].requests++;
      if (r.gatewayStatus === "settled") buckets[key].settled++;
    }
    for (const p of db.listPayments(sid)) {
      if (p.createdAt < cutoff || p.status !== "settled") continue;
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      if (!buckets[key]) continue;
      buckets[key].revenue += parseFloat(p.amount) || 0;
    }
  }

  const result = Object.entries(buckets).map(([date, b]) => ({
    date,
    requests: b.requests,
    settled: b.settled,
    revenue: b.revenue.toFixed(6),
  }));

  return c.json({ days: result });
});

// GET /provider/tokens
providerDataRouter.get("/tokens", (c) => {
  const db = getDb();
  return c.json(db.listTokens().filter(t => t.isActive));
});

// GET /provider/chains
providerDataRouter.get("/chains", (c) => {
  const db = getDb();
  return c.json(db.listChains());
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd packages/admin-api && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/admin-api/src/routes/provider-data.ts
git commit -m "feat(provider): data routes — requests, payments, stats timeseries, tokens, chains"
```

---

## Task 6: Wire All Provider Routes in admin-api

**Files:**
- Modify: `packages/admin-api/src/app.ts`

- [ ] **Step 1: Read current app.ts** (already done — see File Map above)

- [ ] **Step 2: Apply changes**

Replace the contents of `packages/admin-api/src/app.ts`:

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { servicesRouter } from "./routes/services.js";
import { providersRouter } from "./routes/providers.js";
import { paymentsRouter } from "./routes/payments.js";
import { requestsRouter } from "./routes/requests.js";
import { agentsRouter } from "./routes/agents.js";
import { chainsRouter } from "./routes/chains.js";
import { tokensRouter } from "./routes/tokens.js";
import { rpcEndpointsRouter } from "./routes/rpc-endpoints.js";
import { providerAuthRouter } from "./routes/provider-auth.js";
import { providerMeRouter } from "./routes/provider-me.js";
import { providerServicesRouter } from "./routes/provider-services.js";
import { providerDataRouter } from "./routes/provider-data.js";
import { verifyProviderJwt } from "./middleware/provider-jwt.js";

export function createAdminApp() {
  const app = new Hono();
  app.use("*", logger());
  app.use("*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  // ── Provider Portal routes — own JWT auth, NOT admin key ──────────
  // Auth endpoints (no JWT required)
  app.route("/provider/auth", providerAuthRouter);

  // All other /provider/* require a valid provider JWT
  const providerApp = new Hono();
  providerApp.use("*", verifyProviderJwt);
  providerApp.route("/me", providerMeRouter);
  providerApp.route("/services", providerServicesRouter);
  providerApp.use("*", async (c, next) => { await next(); }); // pass-through for data routes
  providerApp.route("/", providerDataRouter);           // handles /requests /payments /stats/* /tokens /chains
  app.route("/provider", providerApp);

  // ── Admin routes — require ADMIN_API_KEY ──────────────────────────
  const adminApiKey = process.env.ADMIN_API_KEY;
  if (!adminApiKey) {
    console.warn("⚠️  ADMIN_API_KEY not set — admin API is unauthenticated. Set ADMIN_API_KEY in production.");
  } else {
    app.use("/services/*", async (c, next) => {
      const key = c.req.header("Authorization")?.replace("Bearer ", "");
      if (key !== adminApiKey) return c.json({ error: "Unauthorized" }, 401);
      await next();
    });
    // Apply to all admin routes
    const adminPaths = ["/services", "/providers", "/payments", "/requests", "/agents", "/chains", "/tokens", "/rpc-endpoints"];
    for (const path of adminPaths) {
      app.use(`${path}/*`, async (c, next) => {
        const key = c.req.header("Authorization")?.replace("Bearer ", "");
        if (key !== adminApiKey) return c.json({ error: "Unauthorized" }, 401);
        await next();
      });
      app.use(path, async (c, next) => {
        const key = c.req.header("Authorization")?.replace("Bearer ", "");
        if (key !== adminApiKey) return c.json({ error: "Unauthorized" }, 401);
        await next();
      });
    }
  }

  app.route("/services", servicesRouter);
  app.route("/providers", providersRouter);
  app.route("/payments", paymentsRouter);
  app.route("/requests", requestsRouter);
  app.route("/agents", agentsRouter);
  app.route("/chains", chainsRouter);
  app.route("/tokens", tokensRouter);
  app.route("/rpc-endpoints", rpcEndpointsRouter);

  return app;
}
```

- [ ] **Step 3: Build and verify no TypeScript errors**

```bash
cd packages/admin-api && pnpm build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 4: Run existing tests to confirm nothing broke**

```bash
cd packages/admin-api && pnpm test 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/admin-api/src/app.ts
git commit -m "feat(provider): mount provider routes in admin-api with JWT-based auth isolation"
```

---

## Task 7: Scaffold provider-ui Package

**Files:**
- Create: `packages/provider-ui/package.json`
- Create: `packages/provider-ui/tsconfig.json`
- Create: `packages/provider-ui/vite.config.ts`
- Create: `packages/provider-ui/index.html`

- [ ] **Step 1: Create package.json**

```json
// packages/provider-ui/package.json
{
  "name": "@x402-gateway-mvp/provider-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "@x402-gateway-mvp/shared": "workspace:*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.24.0",
    "recharts": "^2.12.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/provider-ui/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
// packages/provider-ui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/provider": {
        target: "http://localhost:8403",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
// packages/provider-ui/tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create index.html**

```html
<!-- packages/provider-ui/index.html -->
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>x402 Provider Portal</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #0d1117; color: #e2e8f0; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Install dependencies**

```bash
cd /path/to/x402-gateway-mvp && pnpm install
```
Expected: `@x402-gateway-mvp/provider-ui` added to workspace.

- [ ] **Step 7: Commit**

```bash
git add packages/provider-ui/
git commit -m "feat(provider-ui): scaffold Vite package with proxy config"
```

---

## Task 8: Auth State and API Client

**Files:**
- Create: `packages/provider-ui/src/auth.ts`
- Create: `packages/provider-ui/src/api.ts`

- [ ] **Step 1: Create auth.ts**

```typescript
// packages/provider-ui/src/auth.ts
import { useState, useEffect, useCallback } from "react";
import type { ServiceProvider } from "@x402-gateway-mvp/shared";

const TOKEN_KEY = "x402_provider_token";
const PROVIDER_KEY = "x402_provider_info";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeAuth(token: string, provider: ServiceProvider): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PROVIDER_KEY, JSON.stringify(provider));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROVIDER_KEY);
}

export function getStoredProvider(): ServiceProvider | null {
  const raw = localStorage.getItem(PROVIDER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ServiceProvider; } catch { return null; }
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [provider, setProvider] = useState<ServiceProvider | null>(getStoredProvider);

  const login = useCallback((t: string, p: ServiceProvider) => {
    storeAuth(t, p);
    setToken(t);
    setProvider(p);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setProvider(null);
  }, []);

  const updateProvider = useCallback((p: ServiceProvider) => {
    localStorage.setItem(PROVIDER_KEY, JSON.stringify(p));
    setProvider(p);
  }, []);

  return { token, provider, isLoggedIn: !!token, login, logout, updateProvider };
}
```

- [ ] **Step 2: Create api.ts**

```typescript
// packages/provider-ui/src/api.ts
import type { Service, Payment, GatewayRequest, ServiceProvider, ChainConfig, TokenConfig } from "@x402-gateway-mvp/shared";
import { getStoredToken } from "./auth.js";

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
  let body: any;
  try { body = JSON.parse(text); } catch { body = { error: text }; }
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

// Auth
export async function fetchNonce(address: string): Promise<string> {
  const data = await req<{ message: string }>(`/auth/nonce?address=${encodeURIComponent(address)}`);
  return data.message;
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
```

- [ ] **Step 3: Commit**

```bash
git add packages/provider-ui/src/auth.ts packages/provider-ui/src/api.ts
git commit -m "feat(provider-ui): auth state management and typed API client"
```

---

## Task 9: Login and Register Pages

**Files:**
- Create: `packages/provider-ui/src/pages/Login.tsx`
- Create: `packages/provider-ui/src/pages/Register.tsx`

- [ ] **Step 1: Create Login.tsx**

```typescript
// packages/provider-ui/src/pages/Login.tsx
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNonce, verifySignature } from "../api.js";
import { useAuth } from "../auth.js";

declare global { interface Window { ethereum?: any; } }

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "connecting" | "signing" | "error">("idle");
  const [error, setError] = useState("");
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("请安装 MetaMask 或兼容钱包");
      return;
    }
    setStatus("connecting");
    setError("");
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("用户取消连接");
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setStatus("signing");
    setError("");
    try {
      const message = await fetchNonce(address);
      const signature: string = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
      const result = await verifySignature(address, signature);
      login(result.token, result.provider);
      navigate(result.needsProfile ? "/register" : "/");
    } catch (e: any) {
      setStatus("error");
      setError(e.message ?? "签名失败，请重试");
    }
  }, [address, login, navigate]);

  const CARD: React.CSSProperties = {
    background: "#111827", border: "1px solid #1e2d45", borderRadius: 16,
    padding: 40, width: 400, textAlign: "center",
  };
  const BTN: React.CSSProperties = {
    background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
    padding: "12px 24px", fontSize: 15, cursor: "pointer", width: "100%", marginTop: 16,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={CARD}>
        <h1 style={{ color: "#e2e8f0", fontSize: 24, marginBottom: 8 }}>x402 Provider Portal</h1>
        <p style={{ color: "#6b7280", marginBottom: 32 }}>使用钱包登录，管理你的服务</p>

        {!address ? (
          <button style={BTN} onClick={connect} disabled={status === "connecting"}>
            {status === "connecting" ? "连接中..." : "Connect Wallet"}
          </button>
        ) : (
          <>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 8 }}>已连接钱包</p>
            <p style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: 13, marginBottom: 16, wordBreak: "break-all" }}>
              {address}
            </p>
            <button style={BTN} onClick={signIn} disabled={status === "signing"}>
              {status === "signing" ? "签名中..." : "Sign In"}
            </button>
          </>
        )}

        {error && <p style={{ color: "#ef4444", marginTop: 16, fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Register.tsx**

```typescript
// packages/provider-ui/src/pages/Register.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateMe } from "../api.js";
import { useAuth } from "../auth.js";

export function Register() {
  const { provider, updateProvider } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const CARD: React.CSSProperties = {
    background: "#111827", border: "1px solid #1e2d45", borderRadius: 16,
    padding: 40, width: 480,
  };
  const INPUT: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#0d1117",
    border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14,
    outline: "none", marginTop: 6,
  };
  const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 13, display: "block", marginTop: 16 };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("名称为必填项"); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await updateMe({ name: name.trim(), description, website });
      updateProvider(updated);
      navigate("/");
    } catch (e: any) {
      setError(e.message ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={CARD}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 4 }}>完善 Provider 资料</h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
          钱包地址: <span style={{ fontFamily: "monospace", color: "#3b82f6" }}>{provider?.walletAddress}</span>
        </p>

        <label style={LABEL}>名称 *</label>
        <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="My API Service" />

        <label style={LABEL}>简介</label>
        <textarea
          style={{ ...INPUT, height: 80, resize: "vertical" }}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="提供优质 API 服务..."
        />

        <label style={LABEL}>网站</label>
        <input style={INPUT} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" />

        {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
            padding: "12px 24px", fontSize: 15, cursor: saving ? "not-allowed" : "pointer",
            width: "100%", marginTop: 24, opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "保存中..." : "完成注册"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/provider-ui/src/pages/Login.tsx packages/provider-ui/src/pages/Register.tsx
git commit -m "feat(provider-ui): Login and Register pages with wallet signature flow"
```

---

## Task 10: App Routing, Layout, and main.tsx

**Files:**
- Create: `packages/provider-ui/src/components/Layout.tsx`
- Create: `packages/provider-ui/src/App.tsx`
- Create: `packages/provider-ui/src/main.tsx`

- [ ] **Step 1: Create Layout.tsx**

```typescript
// packages/provider-ui/src/components/Layout.tsx
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.js";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊" },
  { to: "/services", label: "我的服务", icon: "🔌" },
  { to: "/requests", label: "请求记录", icon: "📋" },
  { to: "/payments", label: "收款记录", icon: "💰" },
  { to: "/account", label: "账号设置", icon: "👤" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { provider, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  const SIDEBAR: React.CSSProperties = {
    width: 220, background: "#0d1117", borderRight: "1px solid #1e2d45",
    display: "flex", flexDirection: "column", minHeight: "100vh", flexShrink: 0,
  };
  const HEADER: React.CSSProperties = {
    padding: "24px 16px 16px", borderBottom: "1px solid #1e2d45",
  };
  const NAV_LINK_STYLE: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
    color: "#9ca3af", textDecoration: "none", fontSize: 14, borderRadius: 8,
    margin: "2px 8px", transition: "background 0.15s, color 0.15s",
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={SIDEBAR}>
        <div style={HEADER}>
          <p style={{ color: "#3b82f6", fontWeight: 700, fontSize: 16 }}>x402 Provider</p>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4, wordBreak: "break-all", fontFamily: "monospace" }}>
            {provider?.name || provider?.walletAddress?.slice(0, 16) + "..."}
          </p>
        </div>
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                ...NAV_LINK_STYLE,
                background: isActive ? "#1e2d45" : "transparent",
                color: isActive ? "#e2e8f0" : "#9ca3af",
              })}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: "1px solid #1e2d45" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "8px 12px", background: "transparent",
              border: "1px solid #1e2d45", borderRadius: 8, color: "#9ca3af",
              cursor: "pointer", fontSize: 13,
            }}
          >
            断开连接
          </button>
        </div>
      </div>
      <main style={{ flex: 1, background: "#0d1117", padding: 32, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create App.tsx**

```typescript
// packages/provider-ui/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth.js";
import { Layout } from "./components/Layout.js";
import { Login } from "./pages/Login.js";
import { Register } from "./pages/Register.js";
import { Dashboard } from "./pages/Dashboard.js";
import { Services } from "./pages/Services.js";
import { Requests } from "./pages/Requests.js";
import { Payments } from "./pages/Payments.js";
import { Account } from "./pages/Account.js";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
        <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
        <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Create main.tsx**

```typescript
// packages/provider-ui/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 4: Commit**

```bash
git add packages/provider-ui/src/
git commit -m "feat(provider-ui): app routing, layout sidebar, protected routes"
```

---

## Task 11: Dashboard Page

**Files:**
- Create: `packages/provider-ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Write Dashboard.tsx**

```typescript
// packages/provider-ui/src/pages/Dashboard.tsx
import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getSummaryStats, getTimeseries, listMyServices } from "../api.js";
import type { SummaryStats, TimeseriesDay } from "../api.js";
import type { Service } from "@x402-gateway-mvp/shared";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";
const ACCENT = "#3b82f6";

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "20px 24px", flex: 1, minWidth: 160,
    }}>
      <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>{label}</p>
      <p style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [series, setSeries] = useState<TimeseriesDay[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSummaryStats(), getTimeseries(7), listMyServices()])
      .then(([s, ts, svcs]) => { setStats(s); setSeries(ts); setServices(svcs); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#6b7280" }}>加载中...</p>;
  if (!stats) return <p style={{ color: "#ef4444" }}>加载失败</p>;

  return (
    <div>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>Dashboard</h1>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        <KpiCard label="总收入" value={`${parseFloat(stats.totalRevenue).toFixed(4)} DMHKD`} />
        <KpiCard label="本月收入" value={`${parseFloat(stats.monthRevenue).toFixed(4)} DMHKD`} />
        <KpiCard label="总请求数" value={String(stats.totalRequests)} />
        <KpiCard
          label="结算成功率"
          value={`${(stats.successRate * 100).toFixed(1)}%`}
          sub={`${stats.settledRequests} / ${stats.totalRequests} 次结算`}
        />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
          <p style={{ color: "#e2e8f0", marginBottom: 16, fontWeight: 600 }}>近 7 天请求量</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}` }} />
              <Legend />
              <Line type="monotone" dataKey="requests" stroke={ACCENT} name="总请求" dot={false} />
              <Line type="monotone" dataKey="settled" stroke="#10b981" name="已结算" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
          <p style={{ color: "#e2e8f0", marginBottom: 16, fontWeight: 600 }}>近 7 天收入（DMHKD）</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}` }} />
              <Bar dataKey="revenue" fill={ACCENT} name="收入" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Service Summary Table */}
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
        <p style={{ color: "#e2e8f0", marginBottom: 16, fontWeight: 600 }}>我的服务</p>
        {services.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>还没有服务，去「我的服务」页面创建一个。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["名称", "路径", "网络", "价格", "创建时间"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "8px 12px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "10px 12px", color: "#e2e8f0" }}>{s.name}</td>
                  <td style={{ padding: "10px 12px", color: "#3b82f6", fontFamily: "monospace" }}>{s.gatewayPath}</td>
                  <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{s.network}</td>
                  <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{s.priceAmount} {s.priceCurrency}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{new Date(s.createdAt).toLocaleDateString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/provider-ui/src/pages/Dashboard.tsx
git commit -m "feat(provider-ui): Dashboard with KPI cards and Recharts line/bar charts"
```

---

## Task 12: Services Page

**Files:**
- Create: `packages/provider-ui/src/pages/Services.tsx`

- [ ] **Step 1: Write Services.tsx**

```typescript
// packages/provider-ui/src/pages/Services.tsx
import { useState, useEffect, useCallback } from "react";
import { listMyServices, createService, deleteService, listAvailableTokens, listAvailableChains } from "../api.js";
import type { Service, TokenConfig, ChainConfig } from "@x402-gateway-mvp/shared";
import { useAuth } from "../auth.js";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#0d1117",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none",
};
const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6, marginTop: 14 };

interface FormData {
  name: string; gatewayPath: string; backendUrl: string;
  priceAmount: string; network: string; tokenId: string; minReputation: number;
}
const EMPTY: FormData = { name: "", gatewayPath: "", backendUrl: "", priceAmount: "0.001", network: "", tokenId: "", minReputation: 0 };

export function Services() {
  const { provider } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [svcs, toks, chs] = await Promise.all([listMyServices(), listAvailableTokens(), listAvailableChains()]);
    setServices(svcs); setTokens(toks); setChains(chs);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter tokens by selected network
  const availableTokens = form.network ? tokens.filter(t => t.chainSlug === form.network) : tokens;

  const handleCreate = async () => {
    if (!form.name || !form.gatewayPath || !form.backendUrl || !form.network || !form.tokenId) {
      setError("请填写所有必填字段"); return;
    }
    setSaving(true); setError("");
    try {
      await createService({ ...form, recipient: provider?.walletAddress ?? "" });
      setShowForm(false); setForm(EMPTY);
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除服务「${name}」？`)) return;
    await deleteService(id);
    await load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22 }}>我的服务</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer" }}
        >
          + 新建服务
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, width: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ color: "#e2e8f0", marginBottom: 16 }}>新建服务</h2>

            <label style={LABEL}>服务名称 *</label>
            <input style={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My API" />

            <label style={LABEL}>网关路径 * (例: /my-api)</label>
            <input style={INPUT} value={form.gatewayPath} onChange={e => setForm(f => ({ ...f, gatewayPath: e.target.value }))} placeholder="/my-api" />

            <label style={LABEL}>后端地址 *</label>
            <input style={INPUT} value={form.backendUrl} onChange={e => setForm(f => ({ ...f, backendUrl: e.target.value }))} placeholder="https://api.example.com" />

            <label style={LABEL}>网络 *</label>
            <select
              style={{ ...INPUT, cursor: "pointer" }}
              value={form.network}
              onChange={e => setForm(f => ({ ...f, network: e.target.value, tokenId: "" }))}
            >
              <option value="">-- 选择网络 --</option>
              {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label style={LABEL}>收款 Token *</label>
            <select
              style={{ ...INPUT, cursor: "pointer" }}
              value={form.tokenId}
              onChange={e => setForm(f => ({ ...f, tokenId: e.target.value }))}
            >
              <option value="">-- 选择 Token --</option>
              {availableTokens.map(t => <option key={t.id} value={t.id}>{t.symbol} ({t.id})</option>)}
            </select>

            <label style={LABEL}>价格 (DMHKD) *</label>
            <input style={INPUT} type="number" step="0.001" value={form.priceAmount} onChange={e => setForm(f => ({ ...f, priceAmount: e.target.value }))} />

            <label style={LABEL}>最低信誉分 (0 = 不限)</label>
            <input style={INPUT} type="number" min="0" max="100" value={form.minReputation} onChange={e => setForm(f => ({ ...f, minReputation: parseInt(e.target.value) || 0 }))} />

            {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={handleCreate} disabled={saving} style={{ flex: 1, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>
                {saving ? "创建中..." : "创建"}
              </button>
              <button onClick={() => { setShowForm(false); setForm(EMPTY); setError(""); }} style={{ flex: 1, background: "transparent", color: "#9ca3af", border: "1px solid #1e2d45", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Services List */}
      {services.length === 0 ? (
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280" }}>还没有服务，点击「新建服务」开始</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {services.map(s => (
            <div key={s.id} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ color: "#e2e8f0", fontWeight: 600 }}>{s.name}</p>
                <p style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: 13, marginTop: 4 }}>{s.gatewayPath}</p>
                <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{s.network} · {s.priceAmount} {s.priceCurrency}</p>
              </div>
              <button
                onClick={() => handleDelete(s.id, s.name)}
                style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/provider-ui/src/pages/Services.tsx
git commit -m "feat(provider-ui): Services page with CRUD and network/token dropdowns"
```

---

## Task 13: Requests and Payments Pages

**Files:**
- Create: `packages/provider-ui/src/pages/Requests.tsx`
- Create: `packages/provider-ui/src/pages/Payments.tsx`

- [ ] **Step 1: Create Requests.tsx**

```typescript
// packages/provider-ui/src/pages/Requests.tsx
import { useState, useEffect } from "react";
import { listRequests, listMyServices } from "../api.js";
import type { GatewayRequest, Service } from "@x402-gateway-mvp/shared";

const STATUS_COLOR: Record<string, string> = {
  settled: "#10b981", success: "#10b981",
  settling: "#f59e0b", verifying: "#f59e0b",
  payment_required: "#6b7280", unauthorized: "#6b7280",
  payment_rejected: "#ef4444", proxy_error: "#ef4444",
  backend_error: "#ef4444", settlement_failed: "#ef4444",
};

export function Requests() {
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyServices().then(setServices); }, []);

  useEffect(() => {
    setLoading(true);
    listRequests(filterService || undefined, filterStatus || undefined)
      .then(setRequests).finally(() => setLoading(false));
  }, [filterService, filterStatus]);

  const CARD_BG = "#111827"; const BORDER = "#1e2d45";
  const SELECT: React.CSSProperties = { padding: "8px 12px", background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13 };

  return (
    <div>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>请求记录</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <select style={SELECT} value={filterService} onChange={e => setFilterService(e.target.value)}>
          <option value="">所有服务</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select style={SELECT} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">所有状态</option>
          {["settled", "settlement_failed", "payment_required", "payment_rejected", "proxy_error", "backend_error"].map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#6b7280", padding: 24 }}>加载中...</p>
        ) : requests.length === 0 ? (
          <p style={{ color: "#6b7280", padding: 24 }}>暂无数据</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["时间", "路径", "Agent 地址", "状态", "HTTP"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "12px 16px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "10px 16px", color: "#6b7280" }}>{new Date(r.createdAt).toLocaleString("zh-CN")}</td>
                  <td style={{ padding: "10px 16px", color: "#3b82f6", fontFamily: "monospace" }}>{r.method} {r.path}</td>
                  <td style={{ padding: "10px 16px", color: "#9ca3af", fontFamily: "monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.agentAddress || "—"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ color: STATUS_COLOR[r.gatewayStatus] ?? "#9ca3af", fontFamily: "monospace", fontSize: 12 }}>
                      {r.gatewayStatus}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#9ca3af" }}>{r.httpStatus || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create Payments.tsx**

```typescript
// packages/provider-ui/src/pages/Payments.tsx
import { useState, useEffect } from "react";
import { listPayments, listMyServices } from "../api.js";
import type { Payment, Service } from "@x402-gateway-mvp/shared";

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filterService, setFilterService] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyServices().then(setServices); }, []);

  useEffect(() => {
    setLoading(true);
    listPayments(filterService || undefined).then(setPayments).finally(() => setLoading(false));
  }, [filterService]);

  const CARD_BG = "#111827"; const BORDER = "#1e2d45";
  const SELECT: React.CSSProperties = { padding: "8px 12px", background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13 };

  // Find explorer URL for a payment's network
  const getExplorerUrl = (p: Payment) => {
    const EXPLORERS: Record<string, string> = {
      "optimism-sepolia": "https://sepolia-optimism.etherscan.io/tx",
      "sepolia": "https://sepolia.etherscan.io/tx",
    };
    const base = EXPLORERS[p.network];
    return base && p.txHash !== "failed" ? `${base}/${p.txHash}` : null;
  };

  return (
    <div>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>收款记录</h1>

      <div style={{ marginBottom: 20 }}>
        <select style={SELECT} value={filterService} onChange={e => setFilterService(e.target.value)}>
          <option value="">所有服务</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#6b7280", padding: 24 }}>加载中...</p>
        ) : payments.length === 0 ? (
          <p style={{ color: "#6b7280", padding: 24 }}>暂无收款记录</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["时间", "金额", "状态", "交易 Hash", "Agent 地址"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "12px 16px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const explorerUrl = getExplorerUrl(p);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 16px", color: "#6b7280" }}>{new Date(p.createdAt).toLocaleString("zh-CN")}</td>
                    <td style={{ padding: "10px 16px", color: "#10b981", fontWeight: 600 }}>{p.amount} {p.network.includes("sepolia") ? "DMHKD" : ""}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ color: p.status === "settled" ? "#10b981" : "#ef4444", fontSize: 12, fontFamily: "monospace" }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12 }}>
                      {explorerUrl ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>
                          {p.txHash.slice(0, 10)}...{p.txHash.slice(-6)}
                        </a>
                      ) : (
                        <span style={{ color: "#6b7280" }}>{p.txHash.slice(0, 16)}...</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#9ca3af", fontFamily: "monospace", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.agentAddress || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/provider-ui/src/pages/Requests.tsx packages/provider-ui/src/pages/Payments.tsx
git commit -m "feat(provider-ui): Requests and Payments pages with filtering"
```

---

## Task 14: Account Page

**Files:**
- Create: `packages/provider-ui/src/pages/Account.tsx`

- [ ] **Step 1: Create Account.tsx**

```typescript
// packages/provider-ui/src/pages/Account.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateMe } from "../api.js";
import { useAuth } from "../auth.js";

export function Account() {
  const { provider, updateProvider, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(provider?.name ?? "");
  const [description, setDescription] = useState(provider?.description ?? "");
  const [website, setWebsite] = useState(provider?.website ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const CARD_BG = "#111827"; const BORDER = "#1e2d45";
  const INPUT: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#0d1117",
    border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none",
  };
  const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6, marginTop: 16 };

  const handleSave = async () => {
    if (!name.trim()) { setError("名称不能为空"); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await updateMe({ name: name.trim(), description, website });
      updateProvider(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>账号设置</h1>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
        <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>钱包地址（不可修改）</p>
        <p style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
          {provider?.walletAddress}
        </p>

        <label style={LABEL}>名称 *</label>
        <input style={INPUT} value={name} onChange={e => setName(e.target.value)} />

        <label style={LABEL}>简介</label>
        <textarea
          style={{ ...INPUT, height: 80, resize: "vertical" }}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        <label style={LABEL}>网站</label>
        <input style={INPUT} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" />

        {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>}
        {saved && <p style={{ color: "#10b981", fontSize: 13, marginTop: 12 }}>已保存</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", marginTop: 20, fontSize: 14 }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      <div style={{ background: CARD_BG, border: "1px solid #7f1d1d", borderRadius: 12, padding: 24, marginTop: 24 }}>
        <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 8 }}>退出登录</p>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>清除本地 token，返回登录页。</p>
        <button
          onClick={handleLogout}
          style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 13 }}
        >
          断开连接
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/provider-ui/src/pages/Account.tsx
git commit -m "feat(provider-ui): Account page — edit profile and logout"
```

---

## Task 15: End-to-End Verification

- [ ] **Step 1: Add PROVIDER_JWT_SECRET to .env**

```bash
echo "" >> .env
echo "# Provider Portal JWT Secret" >> .env
echo "PROVIDER_JWT_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> .env
```

- [ ] **Step 2: Build backend**

```bash
pnpm build
```
Expected: all packages build without errors.

- [ ] **Step 3: Start backend**

```bash
pnpm start
```
Expected output includes: `Admin API running on :8403`

- [ ] **Step 4: Start provider-ui**

```bash
cd packages/provider-ui && pnpm dev
```
Expected: Vite server on `http://localhost:5174`

- [ ] **Step 5: Test login flow in browser**

1. Open `http://localhost:5174`
2. Should redirect to `/login`
3. Click "Connect Wallet" → MetaMask prompts for connection
4. Click "Sign In" → MetaMask prompts for signature
5. First-time wallet → redirected to `/register`
6. Fill name → submit → redirected to `/dashboard`

- [ ] **Step 6: Test service creation**

1. Navigate to "我的服务"
2. Click "+ 新建服务"
3. Fill form: select network, select token, set price, set gateway path
4. Submit → service appears in list

- [ ] **Step 7: Test dashboard data**

1. Use admin-ui (`http://localhost:5173`) or the test page to trigger a payment on a service owned by the logged-in provider
2. Refresh dashboard → KPI cards should update
3. Charts should show data for today

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat: provider portal — complete implementation with auth, services, dashboard, analytics"
git push origin main
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Wallet signing → JWT auth | Task 1, 2 |
| Self-registration (first sign-in creates provider) | Task 2 |
| GET/PUT /provider/me | Task 3 |
| Service CRUD with ownership enforcement | Task 4 |
| Requests filtered to own services | Task 5 |
| Payments filtered to own services | Task 5 |
| Stats summary (revenue, requests, success rate) | Task 5 |
| Timeseries (7-day buckets) | Task 5 |
| Platform tokens/chains (read-only) | Task 5 |
| Admin auth unchanged | Task 6 |
| Independent port :5174 | Task 7 |
| JWT localStorage + ProtectedRoute | Task 8 |
| Login + Register pages | Task 9 |
| Sidebar layout | Task 10 |
| Dashboard KPI cards + two charts | Task 11 |
| Services page with create/delete | Task 12 |
| Requests page with filters | Task 13 |
| Payments page with explorer links | Task 13 |
| Account page + logout | Task 14 |
