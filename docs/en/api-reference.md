# Admin API Reference

**Base URL**: `http://localhost:8403`

**Authentication**: Bearer Token in `Authorization` header

```
Authorization: Bearer <ADMIN_API_KEY>
```

> If `ADMIN_API_KEY` is not set, authentication is not required (dev only).

---

## Health Check

### `GET /health`

```json
{ "status": "ok" }
```

---

## Services

### `POST /services` — Create Service

**Request Body:**

```json
{
  "name": "Echo Service",
  "providerId": "prov_xxx",
  "gatewayPath": "/echo",
  "backendUrl": "http://localhost:9999/echo",
  "priceAmount": "0.001",
  "network": "optimism-sepolia",
  "tokenId": "dmhkd-optimism-sepolia",
  "recipient": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c",
  "apiKey": "",
  "minReputation": 0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Service name |
| `providerId` | string | ✓ | Service Provider ID |
| `gatewayPath` | string | ✓ | Gateway route prefix, must start with `/` |
| `backendUrl` | string | ✓ | Backend URL |
| `priceAmount` | string | ✓ | Price per call (human-readable, e.g., "0.001") |
| `network` | string | ✓ | Chain slug (must be registered) |
| `tokenId` | string | ✓ | Token ID (must be registered) |
| `recipient` | string | ✓ | Payment recipient EVM address |
| `apiKey` | string | No | API Key forwarded to backend |
| `minReputation` | number | No | Minimum reputation (0 = no restriction) |

**Response:** `201` — Created Service object

**Errors:**
- `400` — Validation failed
- `404` — Provider/Chain/Token not found
- `409` — `gatewayPath` already in use

### `GET /services` — List All Services

**Response:** `200` — Array of Service objects

### `GET /services/:id` — Get Single Service

**Response:** `200` — Service object | `404`

### `PUT /services/:id` — Update Service

**Request Body:** Partial update (only include fields to change)

```json
{
  "name": "Updated Name",
  "backendUrl": "http://new-backend:8080"
}
```

**Response:** `200` — Updated Service object

### `DELETE /services/:id` — Delete Service

**Response:** `204` | `404`

---

## Providers

### `POST /providers` — Create Provider

```json
{
  "name": "Acme AI Services",
  "walletAddress": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c",
  "description": "AI service provider",
  "website": "https://acme.ai"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Provider name |
| `walletAddress` | string | ✓ | EVM wallet address (default payment recipient) |
| `description` | string | No | Description |
| `website` | string | No | Website URL |

**Response:** `201`

**Errors:** `409` — Wallet address already exists

### `GET /providers` — List All

### `GET /providers/:id` — Get Single

### `GET /providers/:id/services` — Get Provider's Services

### `PUT /providers/:id` — Update

> When updating wallet address, automatically updates all services using the old address as `recipient`.

### `DELETE /providers/:id` — Delete

> Returns `409` if provider still has services (delete services first).

---

## Chains

### `POST /chains` — Create Chain

```json
{
  "id": "optimism-sepolia",
  "name": "Optimism Sepolia",
  "chainId": 11155420,
  "rpcUrl": "https://sepolia.optimism.io",
  "explorerUrl": "https://sepolia-optimism.etherscan.io",
  "isTestnet": true,
  "nativeCurrency": "ETH",
  "erc8004Identity": ""
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✓ | Chain slug (lowercase + hyphens) |
| `name` | string | ✓ | Display name |
| `chainId` | number | ✓ | EVM chain ID |
| `rpcUrl` | string | ✓ | Default JSON-RPC URL |
| `explorerUrl` | string | No | Block explorer URL |
| `isTestnet` | boolean | ✓ | Whether it's a testnet |
| `nativeCurrency` | string | ✓ | Native token symbol |
| `erc8004Identity` | string | No | ERC-8004 contract address |

**Response:** `201`

### `GET /chains` — List All

### `GET /chains/:id` — Get Single

### `PUT /chains/:id` — Update (auto-reloads runtime registry)

### `DELETE /chains/:id` — Delete

> Returns `409` if tokens reference this chain.

---

## Tokens

### `POST /tokens/verify` — On-Chain Contract Verification

Comprehensive on-chain verification of a token contract:

```json
{
  "chainSlug": "optimism-sepolia",
  "contractAddress": "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6"
}
```

**Response:**

```json
{
  "erc20": { "supported": true, "name": "DMHKD", "symbol": "DMHKD", "decimals": 6 },
  "erc3009": { "supported": true, "method": "bytecode" },
  "domainSeparator": "0x...",
  "eip712Domain": { "name": "DMHKD", "version": "2", "chainId": 11155420, "verifyingContract": "0x..." }
}
```

Checks:
- ERC-20 basics (name, symbol, decimals)
- EIP-3009 `transferWithAuthorization` support (bytecode scan / EIP-1967 proxy / eth_call simulation)
- `DOMAIN_SEPARATOR()` read
- EIP-5267 `eip712Domain()` read

### `POST /tokens` — Create Token

```json
{
  "id": "dmhkd-optimism-sepolia",
  "symbol": "DMHKD",
  "name": "DMHKD Stablecoin",
  "chainSlug": "optimism-sepolia",
  "contractAddress": "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
  "decimals": 6,
  "domainName": "DMHKD",
  "domainVersion": "2",
  "isActive": true
}
```

### `GET /tokens` — List All

### `GET /tokens/:id` — Get Single

### `PUT /tokens/:id` — Update

### `DELETE /tokens/:id` — Delete

> Returns `409` if services reference this token.

---

## RPC Endpoints

### `POST /rpc-endpoints` — Create Endpoint

Connectivity is automatically probed on creation.

```json
{
  "chainSlug": "optimism-sepolia",
  "url": "https://opt-sepolia.g.alchemy.com/v2/<key>",
  "label": "Alchemy",
  "priority": 10,
  "isActive": true
}
```

### `GET /rpc-endpoints` — List All

**Query:** `?chainSlug=optimism-sepolia` — filter by chain

### `GET /rpc-endpoints/:id` — Get Single

### `PUT /rpc-endpoints/:id` — Update

### `DELETE /rpc-endpoints/:id` — Delete

> At least 1 endpoint per chain must remain; returns `409` otherwise.

### `POST /rpc-endpoints/health-check` — Trigger Health Check

### `POST /rpc-endpoints/:id/reset-stats` — Reset Statistics

### `GET /rpc-endpoints/stats-history` — Get Time-Series Stats

**Query:** `?chainSlug=&hours=24`

### `GET /rpc-endpoints/chain-summary` — Get Per-Chain Summary

---

## Agents

### `GET /agents` — List All Cached Agents

Returns all cached agents with their activity statistics.

### `GET /agents/:address` — Lookup Agent Identity

Queries on-chain (1-minute cache).

**Response:**

```json
{
  "address": "0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646",
  "isRegistered": true,
  "reputation": 100,
  "cachedAt": 1711612800000
}
```

### `GET /agents/:address/stats` — Agent Activity Stats

```json
{
  "totalRequests": 42,
  "successRequests": 38,
  "totalPayments": 35,
  "totalSpent": "0.035"
}
```

---

## Requests

### `GET /requests` — List Request Records

**Query:**
- `?serviceId=svc_xxx` — filter by service
- `?status=settled` — filter by status

**Response:** Array of GatewayRequest objects

---

## Payments

### `GET /payments` — List Payment Records

**Query:**
- `?serviceId=svc_xxx` — filter by service

**Response:** Array of Payment objects
