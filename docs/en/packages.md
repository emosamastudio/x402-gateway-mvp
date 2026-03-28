# Package Details

x402-gateway-mvp consists of 6 internal packages (pnpm workspace). Build order: shared → chain → facilitator → core → admin-api.

---

## @x402-gateway-mvp/shared

**Path**: `packages/shared/`  
**Purpose**: Shared type definitions, Zod validation schemas, utility functions

### Exported Modules

| File | Exports |
|------|---------|
| `types.ts` | All TypeScript interfaces and types |
| `schemas.ts` | Zod validation schemas (API input validation) |
| `utils.ts` | Utility functions |

### Key Types

- **`ChainConfig`** — Blockchain network config (id, chainId, rpcUrl, erc8004Identity, etc.)
- **`TokenConfig`** — ERC-20 token config (symbol, contractAddress, domainName, etc.)
- **`Service`** — API service definition (gatewayPath, backendUrl, priceAmount, etc.)
- **`ServiceProvider`** — Service provider (name, walletAddress)
- **`GatewayRequest`** — Request record (10 gatewayStatus values, 4 lifecycle timestamps)
- **`Payment`** — Payment record (txHash, settlementError)
- **`RpcEndpoint`** — RPC endpoint config (healthStatus, lastLatency)
- **`PaymentPayload`** — Agent signature payload (x402Version, payload.signature, payload.authorization)
- **`PaymentRequirement`** — Payment requirement in 402 response
- **`GatewayStatus`** — Union type of 10 request lifecycle states

### Utility Functions

```typescript
toUsdcUnits("0.001")    // → 1000n (BigInt)
fromUsdcUnits(1000n)    // → "0.001"
normalizeAddress("0x...") // → checksum format
```

---

## @x402-gateway-mvp/chain

**Path**: `packages/chain/`  
**Purpose**: Blockchain interaction layer — ERC-8004 identity queries, EIP-712 domain separator, RPC health checks, chain/token registry

### Exported Modules

| File | Exports |
|------|---------|
| `erc8004.ts` | Agent identity checks (ERC-8004 contract interaction) |
| `erc8183.ts` | Job creation/querying (ERC-8183, experimental) |
| `client.ts` | viem PublicClient / WalletClient factories |
| `networks.ts` | EIP-712 domainSeparator cached read |
| `registry.ts` | Runtime chain/token registry (in-memory cache) |
| `rpc-health.ts` | RPC endpoint health checking & smart routing |

### Key Functions

#### Identity Checks
```typescript
// Check if Agent is registered on ERC-8004
checkAgentIdentity(agentAddress, chainSlug)
// → { isRegistered: boolean, reputation: number }

// Check Provider identity across all chains
checkProviderIdentityAllChains(walletAddress)
// → [{ chainSlug, isRegistered, reputation }]
```

**Mock mode**: Set `ERC8004_MOCK=true` to skip chain calls and return `{ isRegistered: true, reputation: 100 }`.

#### Client Factories
```typescript
getPublicClient(chainSlug)   // → Read-only viem client (for contract reads)
getWalletClient(chainSlug)   // → Writable viem client (requires FACILITATOR_PRIVATE_KEY)
```

Clients automatically use health-aware routing to select the best RPC URL.

#### Domain Separator
```typescript
getDomainSeparator(chainSlug, contractAddress)
// → Reads DOMAIN_SEPARATOR() from chain (auto-cached)
```

#### Registry
```typescript
registerChain(chain)        // Register chain config in memory
registerToken(token)        // Register token config in memory
getChainConfig(slug)        // Get chain config
getViemChain(slug)          // Construct viem Chain object
getTokenConfig(id)          // Get token config
findTokenByChainAndSymbol(chainSlug, symbol) // Find by chain + symbol
```

#### RPC Health Checking
```typescript
registerRpcEndpoints(endpoints)     // Bulk register
selectRpcUrl(chainSlug)             // Smart-select best URL
startHealthChecker(config)          // Start periodic health checks (default 30s)
stopHealthChecker()                 // Stop
triggerHealthCheck()                // Manual trigger
checkEndpointHealth(endpoint)       // Check single endpoint
```

---

## @x402-gateway-mvp/facilitator

**Path**: `packages/facilitator/`  
**Purpose**: Payment verification and on-chain settlement (Facilitator role)

### Exported Modules

| File | Exports |
|------|---------|
| `verify.ts` | Payment signature verification |
| `settle.ts` | On-chain settlement (calls `transferWithAuthorization`) |
| `nonce.ts` | Nonce management (replay protection) |
| `app.ts` | Standalone Facilitator HTTP service (optional) |

### Key Functions

#### Verification
```typescript
verifyPayment(payload: PaymentPayload, requirement: PaymentRequirement)
// → { isValid: true } or { isValid: false, error: "..." }
```

Verification steps:
1. Network match check
2. Expiry check (validBefore < now)
3. Valid-from check (validAfter > now)
4. Amount check (value >= maxAmountRequired)
5. Recipient check (to === payTo)
6. Nonce replay check
7. EIP-712 digest computation + signature recovery
8. Recovered address vs from address comparison

#### Settlement
```typescript
settlePayment(authorization, signature, network, tokenAddress)
// → { txHash: "0x...", network: "optimism-sepolia" }
```

Settlement flow:
1. Split signature into v, r, s
2. Call `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)` via WalletClient
3. Mark nonce as used immediately after broadcast (don't wait for confirmation)
4. Return transaction hash

#### Nonce Management
```typescript
globalNonceStore.setDb(db)           // Inject SQLite persistence
globalNonceStore.isUsed(nonce)       // Check if used
globalNonceStore.markUsed(nonce)     // Mark as used
```

Uses in-memory Set when no DB is configured (testing).

---

## @x402-gateway-mvp/core

**Path**: `packages/core/`  
**Purpose**: Gateway core server — HTTP proxy, middleware pipeline, database management

### Modules

| File | Exports |
|------|---------|
| `app.ts` | Hono app creation + proxy handler |
| `db.ts` | SQLite database creation + CRUD operations |
| `index.ts` | Startup entry (initializes registry, starts health checker) |
| `proxy.ts` | HTTP proxy forwarding implementation |
| `middleware/identity.ts` | ERC-8004 identity middleware |
| `middleware/x402.ts` | x402 payment middleware |

### Startup Sequence

```
index.ts:
  1. createDb() — Init SQLite + migrations + seed data
  2. registerChain/Token() — Load chain/token configs from DB to memory registry
  3. globalNonceStore.setDb() — Inject nonce persistence
  4. pruneExpiredNonces() — Clean expired nonces
  5. registerRpcEndpoints() — Load RPC endpoints
  6. startHealthChecker() — Start 30s interval health checks
  7. createCoreApp() — Create Hono app
  8. serve() — Listen on :8402
```

### Middleware Pipeline

```
Request → identityMiddleware → x402Middleware → proxy
  │            │                    │              │
  │     Verify ERC-8004      Verify/Settle     Forward to
  │     (cache 5min)          (EIP-3009)       backend
  │            │                    │           (10s timeout)
  └── 403 ────┘              └── 402 ────┘   └── 200/502 ──┘
```

### Database API

`db.ts` creates the SQLite database and exposes full CRUD methods covering 10 tables. See [Database Documentation](./database.md).

---

## @x402-gateway-mvp/admin-api

**Path**: `packages/admin-api/`  
**Purpose**: Management REST API (Bearer token auth)

### Module Structure

| File | Content |
|------|---------|
| `app.ts` | Hono app creation + auth middleware |
| `index.ts` | Startup entry (:8403) |
| `routes/services.ts` | Service CRUD |
| `routes/agents.ts` | Agent cache + stats |
| `routes/payments.ts` | Payment/request queries + Provider/Chain/Token/RPC management |

### Authentication

All requests require `Authorization: Bearer {ADMIN_API_KEY}`.

See [Admin API Reference](./api-reference.md) for full endpoint documentation.

---

## @x402-gateway-mvp/admin-ui

**Path**: `packages/admin-ui/`  
**Purpose**: React admin dashboard

### Tech Stack

- React 18 + TypeScript
- Vite 5 (dev server + build)
- Inline styles (dark theme, no CSS framework)

### Pages

| Path | Component | Function |
|------|-----------|----------|
| `/` | `Services.tsx` | Service list + CRUD |
| `/agents` | `Agents.tsx` | Agent cache list + stats |
| `/payments` | `Payments.tsx` | Payment records |
| `/requests` | `Requests.tsx` | Request records (lifecycle timeline) |
| `/providers` | — | Service provider management |
| `/chains` | — | Chain config management |
| `/tokens` | — | Token config management |
| `/rpc` | — | RPC endpoint management + health monitoring |
| `/payment-test` | `PaymentTest.tsx` | Payment flow testing tool |

See [Admin UI Guide](./admin-ui.md) for details.

---

## Package Dependency Graph

```
shared (zero dependencies — pure types/utils)
  ↑
chain (depends on shared + viem)
  ↑
facilitator (depends on shared + chain + viem)
  ↑
core (depends on shared + chain + facilitator + hono + better-sqlite3)
  ↑
admin-api (depends on shared + chain + core + hono)
admin-ui (depends on shared — calls admin-api via HTTP)
```

### Build Commands

```bash
# Build all packages (Turborepo handles dependency order)
pnpm build

# Build single package
cd packages/shared && pnpm build

# Development mode
pnpm dev  # Starts core + admin-api + admin-ui
```
