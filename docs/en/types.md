# Type Reference

This document lists all TypeScript types and Zod validation schemas defined in the `@x402-gateway-mvp/shared` package.

**Source files**: `packages/shared/src/types.ts` + `packages/shared/src/schemas.ts`

---

## Type Definitions (types.ts)

### Network

```typescript
/** Chain slug — dynamically configured (e.g., "optimism-sepolia") */
export type Network = string;
```

---

### ChainConfig

```typescript
export interface ChainConfig {
  id: string;              // Chain slug: "optimism-sepolia"
  name: string;            // Display name: "Optimism Sepolia"
  chainId: number;         // EVM chain ID (11155420)
  rpcUrl: string;          // JSON-RPC endpoint
  explorerUrl: string;     // Block explorer URL (empty = none)
  isTestnet: boolean;
  nativeCurrency: string;  // Native token symbol: "ETH"
  erc8004Identity: string; // ERC-8004 contract address (empty = none)
  createdAt: number;       // Unix ms
}
```

---

### TokenConfig

```typescript
export interface TokenConfig {
  id: string;              // "dmhkd-optimism-sepolia"
  symbol: string;          // "DMHKD"
  name: string;            // "DMHKD Stablecoin"
  chainSlug: string;       // FK → ChainConfig.id
  contractAddress: string; // Token contract address
  decimals: number;        // Precision (typically 6)
  domainName: string;      // EIP-712 domain name
  domainVersion: string;   // EIP-712 domain version ("1" or "2")
  isActive: boolean;       // Available for payments?
  createdAt: number;
}
```

---

### RpcEndpoint

```typescript
export type RpcHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface RpcEndpoint {
  id: string;
  chainSlug: string;       // FK → ChainConfig.id
  url: string;             // RPC URL
  label: string;           // e.g., "Alchemy Primary"
  priority: number;        // Lower = higher priority (0 = highest)
  isActive: boolean;
  healthStatus: RpcHealthStatus;
  lastHealthCheck: number; // Unix ms (0 = never)
  lastLatency: number;     // ms (-1 = unknown)
  totalRequests: number;
  totalErrors: number;
  createdAt: number;
}
```

---

### GatewayStatus

```typescript
export type GatewayStatus =
  | "unauthorized"         // 403 — identity check failed
  | "payment_required"     // 402 — awaiting payment (challenge issued)
  | "payment_rejected"     // 402 — payment invalid (bad sig / expired / etc.)
  | "verifying"            // Payment verified, proxying to backend
  | "proxy_error"          // 502/504 — backend unreachable/timeout
  | "backend_error"        // Backend returned non-2xx
  | "settling"             // Backend 2xx, settlement in progress
  | "settled"              // Settlement tx confirmed
  | "settlement_failed"    // Settlement tx failed
  | "success";             // Complete (no payment required path)
```

---

### GatewayRequest

```typescript
export interface GatewayRequest {
  id: string;
  serviceId: string;
  agentAddress: string;        // "" if not provided
  method: string;              // GET, POST, etc.
  path: string;                // Gateway path, e.g., "/echo/test"
  network: Network;
  gatewayStatus: GatewayStatus;
  httpStatus: number;          // Final HTTP status returned to client
  responseStatus: number;      // Backend HTTP status (0 if never reached)
  responseBody: string;        // Backend response (truncated to 4KB)
  errorReason: string;         // Error reason ("" if success)
  paymentId: string;           // Associated payment ID ("" if no payment)
  challengeAt: number;         // When 402 challenge was issued (0 = not reached)
  verifiedAt: number;          // When payment was verified
  proxyAt: number;             // When backend response was received
  settledAt: number;           // When settlement completed
  createdAt: number;
}
```

---

### ServiceProvider

```typescript
export interface ServiceProvider {
  id: string;            // "prov_<uuid>"
  name: string;          // e.g., "Acme AI Services"
  walletAddress: string; // EVM address — default payment recipient
  description: string;   // Description (empty = none)
  website: string;       // URL (empty = none)
  createdAt: number;
}
```

---

### Service

```typescript
export interface Service {
  id: string;
  providerId: string;    // FK → ServiceProvider.id (empty = unassigned)
  name: string;
  gatewayPath: string;   // Gateway route, e.g., "/echo"
  backendUrl: string;
  priceAmount: string;   // e.g., "0.001" (human-readable token amount)
  priceCurrency: string; // Token symbol — e.g., "DMHKD"
  network: Network;      // Chain slug — e.g., "optimism-sepolia"
  tokenId: string;       // FK → TokenConfig.id
  recipient: string;     // Payment recipient (overrides Provider wallet)
  apiKey: string;        // Optional backend API key (empty = none)
  minReputation: number; // 0 = no restriction
  createdAt: number;
}
```

---

### Payment

```typescript
export interface Payment {
  id: string;
  requestId: string;           // Associated request ID
  serviceId: string;
  agentAddress: string;
  txHash: string;
  network: Network;
  amount: string;
  status: "settled" | "failed";
  settlementError: string;     // Empty if settled OK
  createdAt: number;
}
```

---

### AgentInfo

```typescript
export interface AgentInfo {
  address: string;
  isRegistered: boolean;
  reputation: number;
  cachedAt: number;
}
```

---

### PaymentRequirement

```typescript
export interface PaymentRequirement {
  network: Network;
  chainId: number;
  maxAmountRequired: string; // Smallest unit (6 decimals: "1000" = 0.001)
  resource: string;
  description: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;             // Token contract address
  assetSymbol: string;       // Token symbol (e.g., "DMHKD")
  assetDecimals: number;     // Token decimals (e.g., 6)
  domainSeparator: string;   // EIP-712 domain separator (bytes32 hex)
  domainName: string;        // EIP-712 domain name
  domainVersion: string;     // EIP-712 domain version
}
```

---

### TransferAuthorization

```typescript
export interface TransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;             // bytes32 hex
}
```

---

### PaymentPayload

```typescript
export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: Network;
  payload: {
    signature: string;
    authorization: TransferAuthorization;
  };
}
```

---

### VerifyResult / SettleResult

```typescript
export interface VerifyResult {
  isValid: boolean;
  error?: string;
}

export interface SettleResult {
  txHash: string;
  network: Network;
}
```

---

## Zod Validation Schemas (schemas.ts)

### NetworkSchema

```typescript
const NetworkSchema = z.string().min(1);
```

### CreateServiceProviderSchema

```typescript
z.object({
  name: z.string().min(1).max(100),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  description: z.string().max(500).default(""),
  website: z.string().url().or(z.literal("")).default(""),
})
```

### UpdateServiceProviderSchema

```typescript
z.object({
  name: z.string().min(1).max(100).optional(),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  description: z.string().max(500).optional(),
  website: z.string().url().or(z.literal("")).optional(),
}).refine(data => Object.keys(data).length > 0)
```

### CreateServiceSchema

```typescript
z.object({
  name: z.string().min(1).max(100),
  providerId: z.string().default(""),
  gatewayPath: z.string().min(1).regex(/^\//),      // Must start with /
  backendUrl: z.string().url(),
  priceAmount: z.string().regex(/^\d+(\.\d{1,6})?$/), // Up to 6 decimals
  network: NetworkSchema,
  tokenId: z.string().min(1),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  apiKey: z.string().default(""),
  minReputation: z.number().int().min(0).default(0),
})
```

### CreateChainSchema

```typescript
z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(100),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url(),
  explorerUrl: z.string().default(""),
  isTestnet: z.boolean().default(false),
  nativeCurrency: z.string().default("ETH"),
  erc8004Identity: z.string().default(""),
})
```

### CreateTokenSchema

```typescript
z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  chainSlug: z.string().min(1),
  contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  decimals: z.number().int().min(0).max(18).default(6),
  domainName: z.string().min(1),
  domainVersion: z.string().min(1).default("1"),
  isActive: z.boolean().default(true),
})
```

### PaymentPayloadSchema

```typescript
z.object({
  x402Version: z.number().int().positive(),
  scheme: z.literal("exact"),
  network: NetworkSchema,
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),  // 65-byte ECDSA
    authorization: z.object({
      from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      value: z.string().regex(/^\d+$/),
      validAfter: z.string().regex(/^\d+$/),
      validBefore: z.string().regex(/^\d+$/),
      nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),     // bytes32
    }),
  }),
})
```

---

## Utility Functions (utils.ts)

```typescript
/** Human-readable amount → smallest unit (6 decimals) */
toUsdcUnits(amount: string): bigint
// "0.001" → 1000n

/** Smallest unit → human-readable amount */
fromUsdcUnits(units: bigint): string
// 1000n → "0.001"

/** Normalize to checksum-formatted EVM address */
normalizeAddress(address: string): string
```
