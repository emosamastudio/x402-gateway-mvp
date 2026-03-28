# 类型参考

本文档列出 `@x402-gateway-mvp/shared` 包中定义的所有 TypeScript 类型和 Zod 校验模式。

**源文件**: `packages/shared/src/types.ts` + `packages/shared/src/schemas.ts`

---

## 类型定义 (types.ts)

### Network

```typescript
/** 链标识符 — 动态配置（如 "optimism-sepolia"） */
export type Network = string;
```

---

### ChainConfig

```typescript
export interface ChainConfig {
  id: string;              // 链标识："optimism-sepolia"
  name: string;            // 显示名称："Optimism Sepolia"
  chainId: number;         // EVM chain ID (11155420)
  rpcUrl: string;          // JSON-RPC 端点
  explorerUrl: string;     // 区块浏览器 URL（空 = 无）
  isTestnet: boolean;
  nativeCurrency: string;  // 原生代币符号："ETH"
  erc8004Identity: string; // ERC-8004 合约地址（空 = 无）
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
  contractAddress: string; // 代币合约地址
  decimals: number;        // 精度（通常 6）
  domainName: string;      // EIP-712 域名称
  domainVersion: string;   // EIP-712 域版本（"1" 或 "2"）
  isActive: boolean;       // 是否可用于支付
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
  label: string;           // 如 "Alchemy Primary"
  priority: number;        // 越小优先级越高（0 最高）
  isActive: boolean;
  healthStatus: RpcHealthStatus;
  lastHealthCheck: number; // Unix ms（0 = 从未检查）
  lastLatency: number;     // ms（-1 = 未知）
  totalRequests: number;
  totalErrors: number;
  createdAt: number;
}
```

---

### GatewayStatus

```typescript
export type GatewayStatus =
  | "unauthorized"         // 403 — 身份验证失败
  | "payment_required"     // 402 — 等待支付（已发送质询）
  | "payment_rejected"     // 402 — 支付无效（签名错误/过期等）
  | "verifying"            // 支付验证中，准备代理
  | "proxy_error"          // 502/504 — 后端不可达/超时
  | "backend_error"        // 后端返回非 2xx
  | "settling"             // 后端 2xx，正在结算
  | "settled"              // 结算交易已确认
  | "settlement_failed"    // 结算交易失败
  | "success";             // 完成（无需支付路径）
```

---

### GatewayRequest

```typescript
export interface GatewayRequest {
  id: string;
  serviceId: string;
  agentAddress: string;        // "" = 未提供
  method: string;              // GET, POST 等
  path: string;                // 网关路径，如 "/echo/test"
  network: Network;
  gatewayStatus: GatewayStatus;
  httpStatus: number;          // 返回客户端的最终 HTTP 状态码
  responseStatus: number;      // 后端 HTTP 状态码（0 = 未到达后端）
  responseBody: string;        // 后端响应体（截断至 4KB）
  errorReason: string;         // 错误原因（"" = 成功）
  paymentId: string;           // 关联支付 ID（"" = 无支付）
  challengeAt: number;         // 402 质询时间（0 = 未到达）
  verifiedAt: number;          // 签名验证时间
  proxyAt: number;             // 后端响应时间
  settledAt: number;           // 结算完成时间
  createdAt: number;
}
```

---

### ServiceProvider

```typescript
export interface ServiceProvider {
  id: string;            // "prov_<uuid>"
  name: string;          // 如 "Acme AI Services"
  walletAddress: string; // EVM 地址 — 默认收款地址
  description: string;   // 描述（空 = 无）
  website: string;       // URL（空 = 无）
  createdAt: number;
}
```

---

### Service

```typescript
export interface Service {
  id: string;
  providerId: string;    // FK → ServiceProvider.id（空 = 未分配）
  name: string;
  gatewayPath: string;   // 网关路由，如 "/echo"
  backendUrl: string;
  priceAmount: string;   // 如 "0.001"（人类可读代币数量）
  priceCurrency: string; // 代币符号 — 如 "DMHKD"
  network: Network;      // 链标识 — 如 "optimism-sepolia"
  tokenId: string;       // FK → TokenConfig.id
  recipient: string;     // 收款地址（覆盖 Provider 钱包）
  apiKey: string;        // 可选后端 API Key（空 = 无）
  minReputation: number; // 0 = 无限制
  createdAt: number;
}
```

---

### Payment

```typescript
export interface Payment {
  id: string;
  requestId: string;           // 关联请求 ID
  serviceId: string;
  agentAddress: string;
  txHash: string;
  network: Network;
  amount: string;
  status: "settled" | "failed";
  settlementError: string;     // 空 = 成功
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
  maxAmountRequired: string; // 最小单位（6 位小数："1000" = 0.001）
  resource: string;
  description: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;             // 代币合约地址
  assetSymbol: string;       // 代币符号（如 "DMHKD"）
  assetDecimals: number;     // 代币精度（如 6）
  domainSeparator: string;   // EIP-712 域分隔符（bytes32 hex）
  domainName: string;        // EIP-712 域名称
  domainVersion: string;     // EIP-712 域版本
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

## Zod 校验模式 (schemas.ts)

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
  gatewayPath: z.string().min(1).regex(/^\//),      // 必须以 / 开头
  backendUrl: z.string().url(),
  priceAmount: z.string().regex(/^\d+(\.\d{1,6})?$/), // 最多 6 位小数
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
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),  // 65 字节 ECDSA
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

## 工具函数 (utils.ts)

```typescript
/** 人类可读金额 → 最小单位 (6 位小数) */
toUsdcUnits(amount: string): bigint
// "0.001" → 1000n

/** 最小单位 → 人类可读金额 */
fromUsdcUnits(units: bigint): string
// 1000n → "0.001"

/** 规范化为 checksum 格式的 EVM 地址 */
normalizeAddress(address: string): string
```
