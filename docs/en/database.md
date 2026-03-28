# Database Design

This document describes the SQLite database schema used by x402-gateway-mvp (powered by `better-sqlite3`).

Default database path: `./gateway.db` (configurable via `DB_PATH` environment variable).

---

## Database Engine

| Property | Value |
|----------|-------|
| Engine | SQLite 3 |
| Driver | better-sqlite3 |
| File | `gateway.db` |
| Init | `createDb()` auto-creates tables + migrations + seed data |

---

## Table Overview

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `chains` | Blockchain network configs | `id` (TEXT) |
| `tokens` | ERC-20 token configs | `id` (TEXT) |
| `service_providers` | Service providers | `id` (TEXT) |
| `services` | Registered API services | `id` (TEXT) |
| `requests` | Gateway request records | `id` (TEXT) |
| `payments` | On-chain payment records | `id` (TEXT) |
| `agent_cache` | Agent identity cache | `address` (TEXT) |
| `rpc_endpoints` | RPC endpoint configs | `id` (TEXT) |
| `rpc_stats_history` | RPC stats snapshots | `id` (TEXT) |
| `used_nonces` | Used nonces (replay protection) | `nonce` (TEXT) |

---

## Detailed Table Schemas

### chains — Blockchain Networks

```sql
CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,              -- Chain slug (e.g., "optimism-sepolia")
  name TEXT NOT NULL,               -- Display name
  chain_id INTEGER NOT NULL,        -- EVM chain ID
  rpc_url TEXT NOT NULL,            -- Default RPC URL
  explorer_url TEXT NOT NULL DEFAULT '',  -- Block explorer URL
  is_testnet INTEGER NOT NULL DEFAULT 0, -- Whether testnet (0/1)
  native_currency TEXT NOT NULL DEFAULT 'ETH', -- Native token symbol
  erc8004_identity TEXT NOT NULL DEFAULT '', -- ERC-8004 registry contract address
  created_at INTEGER NOT NULL       -- Creation time (Unix ms)
);
```

**Seed data**: Two chains auto-inserted on first init:
- `optimism-sepolia` — Optimism Sepolia (chainId: 11155420)
- `sepolia` — Ethereum Sepolia (chainId: 11155111)

---

### tokens — ERC-20 Tokens

```sql
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,              -- Token ID (e.g., "dmhkd-optimism-sepolia")
  symbol TEXT NOT NULL,             -- Symbol (e.g., "DMHKD")
  name TEXT NOT NULL,               -- Full name
  chain_slug TEXT NOT NULL,         -- Parent chain (FK → chains.id)
  contract_address TEXT NOT NULL,   -- Contract address
  decimals INTEGER NOT NULL DEFAULT 6,  -- Decimal places
  domain_name TEXT NOT NULL DEFAULT '',  -- EIP-712 domain name
  domain_version TEXT NOT NULL DEFAULT '1', -- EIP-712 domain version
  is_active INTEGER NOT NULL DEFAULT 1,  -- Whether active
  created_at INTEGER NOT NULL
);
```

**Unique index**: `(chain_slug, contract_address COLLATE NOCASE)` — no duplicates per chain.

**Seed data**:
- `dmhkd-optimism-sepolia` — DMHKD on Optimism Sepolia
- `dmhkd-sepolia` — DMHKD on Ethereum Sepolia

---

### service_providers — Service Providers

```sql
CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,              -- UUID
  name TEXT NOT NULL,               -- Provider name
  wallet_address TEXT NOT NULL,     -- Wallet address
  description TEXT NOT NULL DEFAULT '',  -- Description
  website TEXT NOT NULL DEFAULT '',  -- Website URL
  created_at INTEGER NOT NULL
);
```

---

### services — API Services

```sql
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,              -- UUID
  provider_id TEXT NOT NULL DEFAULT '',  -- Parent provider (FK → service_providers.id)
  name TEXT NOT NULL,               -- Service name
  gateway_path TEXT NOT NULL,       -- Gateway path prefix (e.g., "/echo")
  backend_url TEXT NOT NULL,        -- Backend URL (e.g., "http://localhost:9999/echo")
  price_amount TEXT NOT NULL,       -- Price per call (e.g., "0.001")
  price_currency TEXT NOT NULL,     -- Price currency (e.g., "DMHKD")
  network TEXT NOT NULL,            -- Payment network (e.g., "optimism-sepolia")
  token_id TEXT NOT NULL DEFAULT '',-- Token ID (FK → tokens.id)
  recipient TEXT NOT NULL,          -- Payment recipient address
  api_key TEXT NOT NULL DEFAULT '', -- Backend API key (auto-injected as Authorization header)
  min_reputation INTEGER NOT NULL DEFAULT 0, -- Minimum reputation requirement
  created_at INTEGER NOT NULL
);
```

**Auto-migration**: `gateway_path`, `api_key`, `token_id`, `provider_id` fields auto-added via ALTER TABLE.

**Auto-fill**: Empty `token_id` auto-computed as `LOWER(price_currency) || '-' || network`.

---

### requests — Gateway Request Records

```sql
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,              -- UUID
  service_id TEXT NOT NULL,         -- Associated service
  agent_address TEXT NOT NULL DEFAULT '',  -- Agent address
  method TEXT NOT NULL DEFAULT '',  -- HTTP method (GET/POST/…)
  path TEXT NOT NULL DEFAULT '',    -- Request path
  network TEXT NOT NULL DEFAULT '', -- Payment network
  gateway_status TEXT NOT NULL DEFAULT '', -- Lifecycle status
  http_status INTEGER NOT NULL DEFAULT 0, -- Final HTTP status code
  response_status INTEGER NOT NULL DEFAULT 0, -- Backend response status
  response_body TEXT NOT NULL DEFAULT '',  -- Backend response body (may be truncated)
  error_reason TEXT NOT NULL DEFAULT '',   -- Error message
  payment_id TEXT NOT NULL DEFAULT '',     -- Associated payment ID
  challenge_at INTEGER NOT NULL DEFAULT 0, -- 402 challenge time (Unix ms)
  verified_at INTEGER NOT NULL DEFAULT 0,  -- Signature verification time
  proxy_at INTEGER NOT NULL DEFAULT 0,     -- Proxy forwarding time
  settled_at INTEGER NOT NULL DEFAULT 0,   -- On-chain settlement time
  created_at INTEGER NOT NULL              -- Creation time
);
```

**Lifecycle statuses (gateway_status)**:

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `payment_required` | 402 returned, awaiting Agent signature | No |
| `verifying` | Verifying signature | No |
| `settling` | Backend returned 2xx, broadcasting on-chain settlement | No |
| `success` | Full flow completed (no payment path) | Yes |
| `settled` | On-chain settlement succeeded | Yes |
| `settlement_failed` | Settlement failed but backend responded | Yes |
| `payment_rejected` | Signature verification failed | Yes |
| `proxy_error` | Backend proxy failed | Yes |
| `backend_error` | Backend returned non-2xx | Yes |
| `unauthorized` | Identity check failed | Yes |

**Lifecycle timestamps**:

| Timestamp | Set When |
|-----------|----------|
| `challenge_at` | 402 response returned |
| `verified_at` | Signature verified successfully |
| `proxy_at` | Backend response received |
| `settled_at` | On-chain settlement completed |

**Key query — findPendingRequest**:
```sql
SELECT * FROM requests
WHERE service_id = ? AND agent_address = ?
  AND gateway_status = 'payment_required'
  AND created_at > ?  -- 5-minute window
ORDER BY created_at DESC LIMIT 1
```

---

### payments — On-chain Payment Records

```sql
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,              -- UUID
  request_id TEXT NOT NULL DEFAULT '',  -- Associated request ID
  service_id TEXT NOT NULL,         -- Associated service
  agent_address TEXT NOT NULL,      -- Agent address
  tx_hash TEXT NOT NULL,            -- On-chain transaction hash
  network TEXT NOT NULL,            -- Payment network
  amount TEXT NOT NULL,             -- Payment amount
  status TEXT NOT NULL,             -- "settled" / "failed"
  settlement_error TEXT NOT NULL DEFAULT '', -- Settlement error message
  created_at INTEGER NOT NULL
);
```

---

### agent_cache — Agent Identity Cache

```sql
CREATE TABLE IF NOT EXISTS agent_cache (
  address TEXT PRIMARY KEY,         -- Agent address (lowercase)
  is_registered INTEGER NOT NULL,   -- 0 or 1
  reputation INTEGER NOT NULL,      -- On-chain reputation value
  cached_at INTEGER NOT NULL        -- Cache time (Unix ms)
);
```

**Cache policy**: 5-minute TTL. Re-queries on-chain ERC-8004 after expiry. Uses `UPSERT` (`ON CONFLICT DO UPDATE`).

---

### rpc_endpoints — RPC Endpoints

```sql
CREATE TABLE IF NOT EXISTS rpc_endpoints (
  id TEXT PRIMARY KEY,
  chain_slug TEXT NOT NULL,         -- Parent chain
  url TEXT NOT NULL,                -- RPC URL
  label TEXT NOT NULL DEFAULT '',   -- Display label
  priority INTEGER NOT NULL DEFAULT 0,  -- Priority (lower = higher)
  is_active INTEGER NOT NULL DEFAULT 1,
  health_status TEXT NOT NULL DEFAULT 'unknown', -- healthy/degraded/down/unknown
  last_health_check INTEGER NOT NULL DEFAULT 0,
  last_latency INTEGER NOT NULL DEFAULT -1,  -- Latest latency (ms)
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

**Unique index**: `(chain_slug, url COLLATE NOCASE)` — no duplicates per chain.

**Auto-seed**: Endpoints auto-created from chains' `rpc_url` field.

---

### rpc_stats_history — RPC Stats Snapshots

```sql
CREATE TABLE IF NOT EXISTS rpc_stats_history (
  id TEXT PRIMARY KEY,              -- "stat_{endpointId}_{timestamp}"
  endpoint_id TEXT NOT NULL,        -- Associated RPC endpoint
  chain_slug TEXT NOT NULL,
  timestamp INTEGER NOT NULL,       -- Snapshot time (Unix ms)
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  latency INTEGER NOT NULL DEFAULT -1,
  health_status TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_rpc_stats_chain_time
  ON rpc_stats_history (chain_slug, timestamp);
CREATE INDEX IF NOT EXISTS idx_rpc_stats_endpoint_time
  ON rpc_stats_history (endpoint_id, timestamp);
```

**Cleanup**: `pruneRpcStatsHistory(retainMs)` deletes records older than the retention period.

---

### used_nonces — Replay Protection

```sql
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,           -- Nonce (lowercase hex)
  network TEXT NOT NULL DEFAULT '', -- Network
  agent_address TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
```

**Purpose**: EIP-3009 signature nonces are recorded after use to prevent replay attacks.

**Cleanup**: `pruneExpiredNonces(maxAgeMs)` removes expired nonces.

---

## Index Summary

| Index Name | Table | Columns |
|------------|-------|---------|
| `idx_tokens_chain_contract` | tokens | (chain_slug, contract_address) UNIQUE |
| `idx_rpc_chain_url` | rpc_endpoints | (chain_slug, url) UNIQUE |
| `idx_rpc_stats_chain_time` | rpc_stats_history | (chain_slug, timestamp) |
| `idx_rpc_stats_endpoint_time` | rpc_stats_history | (endpoint_id, timestamp) |

---

## Auto-Migration Mechanism

`createDb()` performs the following steps:

1. **Execute DDL**: `CREATE TABLE IF NOT EXISTS` for all tables
2. **Detect missing columns**: Via `PRAGMA table_info()`, auto `ALTER TABLE ADD COLUMN`
3. **Create indexes**: `CREATE UNIQUE INDEX IF NOT EXISTS`
4. **Seed data**: Insert default chains/tokens if tables are empty
5. **Data repair**: Auto-compute empty `token_id` for existing services

This means the database schema evolves safely without manual migration scripts.

---

## Database API Methods

All database methods are accessed via the `getDb()` singleton.

### Chains
- `insertChain(chain)` — Insert new chain
- `getChain(id)` — Get by ID
- `listChains()` — List all chains
- `updateChain(id, updates)` — Update fields
- `deleteChain(id)` — Delete

### Tokens
- `insertToken(token)` — Insert new token
- `getToken(id)` — Get by ID
- `getTokenByChainAndAddress(chainSlug, address)` — Find by chain + contract
- `listTokens()` — List all tokens
- `updateToken(id, updates)` — Update
- `deleteToken(id)` — Delete

### Providers
- `insertProvider(p)` — Insert
- `getProvider(id)` — Get by ID
- `getProviderByWallet(walletAddress)` — Find by wallet
- `listProviders()` — List all
- `listServicesByProvider(providerId)` — List provider's services
- `updateProvider(id, updates)` — Update
- `deleteProvider(id)` — Delete

### Services
- `insertService(svc)` — Insert
- `getServiceById(id)` — Get by ID
- `listServices()` — List all
- `updateService(id, updates)` — Update
- `deleteService(id)` — Delete

### Requests
- `insertRequest(r)` — Insert new request
- `updateRequest(id, updates)` — Update request (status, timestamps, etc.)
- `findPendingRequest(serviceId, agentAddress)` — Find pending request within 5-min window
- `updateRequestPaymentId(requestId, paymentId)` — Associate payment
- `listRequests(serviceId?, status?)` — Filtered listing

### Payments
- `insertPayment(p)` — Insert
- `listPayments(serviceId?)` — List

### Agent Cache
- `upsertAgentCache(agent)` — Upsert cache entry
- `getAgentCache(address)` — Get cached data
- `listAgentCache()` — List all
- `getAgentStats(address)` — Get Agent statistics

### RPC Endpoints
- `insertRpcEndpoint(ep)` — Insert
- `getRpcEndpoint(id)` — Get
- `listRpcEndpoints(chainSlug?)` — List
- `getRpcEndpointByChainAndUrl(chainSlug, url)` — Find
- `updateRpcEndpoint(id, updates)` — Update
- `incrementRpcStats(id, isError)` — Increment counters
- `deleteRpcEndpoint(id)` — Delete

### RPC Stats History
- `insertRpcStatsSnapshot(row)` — Insert snapshot
- `getRpcStatsHistory(chainSlug, sinceMs?)` — Get history
- `pruneRpcStatsHistory(retainMs)` — Cleanup old data
- `getRpcChainSummary()` — Get chain-level summary

### Nonce Management
- `isNonceUsed(nonce)` — Check if used
- `markNonceUsed(nonce, network?, agentAddress?)` — Mark as used
- `pruneExpiredNonces(maxAgeMs)` — Cleanup expired nonces
