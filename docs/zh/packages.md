# 包详解 / Packages

x402-gateway-mvp 由 6 个内部包组成（pnpm workspace），编译顺序：shared → chain → facilitator → core → admin-api。

---

## @x402-gateway-mvp/shared

**路径**: `packages/shared/`  
**用途**: 共享类型定义、Zod 校验模式、工具函数

### 导出模块

| 文件 | 导出内容 |
|------|---------|
| `types.ts` | 所有 TypeScript 接口和类型 |
| `schemas.ts` | Zod 校验模式（API 输入验证） |
| `utils.ts` | 工具函数 |

### 关键类型

- **`ChainConfig`** — 区块链网络配置（id, chainId, rpcUrl, erc8004Identity 等）
- **`TokenConfig`** — ERC-20 代币配置（symbol, contractAddress, domainName 等）
- **`Service`** — API 服务定义（gatewayPath, backendUrl, priceAmount 等）
- **`ServiceProvider`** — 服务提供商（name, walletAddress）
- **`GatewayRequest`** — 请求记录（10 种 gatewayStatus，4 个生命周期时间戳）
- **`Payment`** — 支付记录（txHash, settlementError）
- **`RpcEndpoint`** — RPC 端点配置（healthStatus, lastLatency）
- **`PaymentPayload`** — Agent 签名载荷（x402Version, payload.signature, payload.authorization）
- **`PaymentRequirement`** — 402 响应中的支付要求
- **`GatewayStatus`** — 10 种请求生命周期状态的联合类型

### 工具函数

```typescript
toUsdcUnits("0.001")    // → 1000n (BigInt)
fromUsdcUnits(1000n)    // → "0.001"
normalizeAddress("0x...") // → checksum format
```

---

## @x402-gateway-mvp/chain

**路径**: `packages/chain/`  
**用途**: 区块链交互层 — ERC-8004 身份查询、EIP-712 域分隔符、RPC 健康检查、链/代币注册表

### 导出模块

| 文件 | 导出内容 |
|------|---------|
| `erc8004.ts` | Agent 身份检查（ERC-8004 合约交互） |
| `erc8183.ts` | 任务创建/查询（ERC-8183，实验性） |
| `client.ts` | viem PublicClient / WalletClient 工厂 |
| `networks.ts` | EIP-712 domainSeparator 缓存读取 |
| `registry.ts` | 运行时链/代币注册表（内存缓存） |
| `rpc-health.ts` | RPC 端点健康检查与智能路由 |

### 关键函数

#### 身份检查
```typescript
// 查询 Agent 是否已在 ERC-8004 注册
checkAgentIdentity(agentAddress, chainSlug)
// → { isRegistered: boolean, reputation: number }

// 在所有链上查询 Provider 身份
checkProviderIdentityAllChains(walletAddress)
// → [{ chainSlug, isRegistered, reputation }]
```

**Mock 模式**：设置 `ERC8004_MOCK=true` 跳过链上调用，返回 `{ isRegistered: true, reputation: 100 }`

#### 客户端工厂
```typescript
getPublicClient(chainSlug)   // → 只读 viem client（用于合约读取）
getWalletClient(chainSlug)   // → 可写 viem client（需要 FACILITATOR_PRIVATE_KEY）
```

客户端自动使用健康检查路由选择最佳 RPC URL。

#### Domain Separator
```typescript
getDomainSeparator(chainSlug, contractAddress)
// → 从链上读取 DOMAIN_SEPARATOR()（自动缓存）
```

#### 注册表
```typescript
registerChain(chain)        // 注册链配置到内存
registerToken(token)        // 注册代币配置到内存
getChainConfig(slug)        // 获取链配置
getViemChain(slug)          // 构造 viem Chain 对象
getTokenConfig(id)          // 获取代币配置
findTokenByChainAndSymbol(chainSlug, symbol) // 按链+符号查找
```

#### RPC 健康检查
```typescript
registerRpcEndpoints(endpoints)     // 批量注册
selectRpcUrl(chainSlug)             // 智能选择最佳 URL
startHealthChecker(config)          // 启动定时健康检查（默认 30s）
stopHealthChecker()                 // 停止
triggerHealthCheck()                // 手动触发
checkEndpointHealth(endpoint)       // 检查单个端点
```

---

## @x402-gateway-mvp/facilitator

**路径**: `packages/facilitator/`  
**用途**: 支付验证与链上结算（Facilitator 角色）

### 导出模块

| 文件 | 导出内容 |
|------|---------|
| `verify.ts` | 支付签名验证 |
| `settle.ts` | 链上结算（调用 `transferWithAuthorization`） |
| `nonce.ts` | Nonce 管理（防重放） |
| `app.ts` | 独立 Facilitator HTTP 服务（可选） |

### 关键函数

#### 验证
```typescript
verifyPayment(payload: PaymentPayload, requirement: PaymentRequirement)
// → { isValid: true } 或 { isValid: false, error: "..." }
```

验证步骤：
1. 网络匹配检查
2. 过期时间检查（validBefore < now）
3. 有效开始时间检查（validAfter > now）
4. 金额检查（value >= maxAmountRequired）
5. 收款方检查（to === payTo）
6. Nonce 重放检查
7. EIP-712 摘要计算 + 签名恢复
8. 恢复的地址 vs from 地址比对

#### 结算
```typescript
settlePayment(authorization, signature, network, tokenAddress)
// → { txHash: "0x...", network: "optimism-sepolia" }
```

结算流程：
1. 拆分签名为 v, r, s
2. 通过 WalletClient 调用 `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)`
3. 广播后立即标记 nonce 为已使用（不等待确认）
4. 返回交易哈希

#### Nonce 管理
```typescript
globalNonceStore.setDb(db)           // 注入 SQLite 持久化
globalNonceStore.isUsed(nonce)       // 检查是否已使用
globalNonceStore.markUsed(nonce)     // 标记为已使用
```

非 DB 模式下使用内存 Set（测试用）。

---

## @x402-gateway-mvp/core

**路径**: `packages/core/`  
**用途**: 网关核心服务器 — HTTP 代理、中间件管道、数据库管理

### 导出模块

| 文件 | 导出内容 |
|------|---------|
| `app.ts` | Hono 应用创建 + 代理处理 |
| `db.ts` | SQLite 数据库创建 + CRUD 操作 |
| `index.ts` | 启动入口（初始化注册表、启动健康检查） |
| `proxy.ts` | HTTP 代理转发实现 |
| `middleware/identity.ts` | ERC-8004 身份中间件 |
| `middleware/x402.ts` | x402 支付中间件 |

### 启动流程

```
index.ts:
  1. createDb() — 初始化 SQLite + 迁移 + 种子数据
  2. registerChain/Token() — 从 DB 加载链/代币配置到内存注册表
  3. globalNonceStore.setDb() — 注入 nonce 持久化
  4. pruneExpiredNonces() — 清理过期 nonce
  5. registerRpcEndpoints() — 加载 RPC 端点
  6. startHealthChecker() — 启动 30s 间隔健康检查
  7. createCoreApp() — 创建 Hono 应用
  8. serve() — 监听 :8402
```

### 中间件管道

```
请求 → identityMiddleware → x402Middleware → proxy
  │         │                    │              │
  │    验证 ERC-8004       验证/结算支付     转发到后端
  │    (缓存 5min)          (EIP-3009)      (10s 超时)
  │         │                    │              │
  └─ 403 ──┘              └─ 402 ──┘      └─ 200/502 ──┘
```

### 数据库 API

`db.ts` 创建 SQLite 数据库并暴露完整的 CRUD 方法，覆盖 10 张表。详见[数据库文档](./database.md)。

---

## @x402-gateway-mvp/admin-api

**路径**: `packages/admin-api/`  
**用途**: 管理 REST API（Bearer 认证）

### 模块结构

| 文件 | 内容 |
|------|------|
| `app.ts` | Hono 应用创建 + auth 中间件 |
| `index.ts` | 启动入口（:8403） |
| `routes/services.ts` | 服务 CRUD |
| `routes/agents.ts` | Agent 缓存 + 统计 |
| `routes/payments.ts` | 支付/请求查询 + Provider/Chain/Token/RPC 管理 |

### 认证

所有请求必须携带 `Authorization: Bearer {ADMIN_API_KEY}`。

详见 [Admin API 参考文档](./api-reference.md)。

---

## @x402-gateway-mvp/admin-ui

**路径**: `packages/admin-ui/`  
**用途**: React 管理仪表板

### 技术栈

- React 18 + TypeScript
- Vite 5（开发服务器 + 构建）
- 内联样式（暗色主题，无 CSS 框架）

### 页面

| 路径 | 组件 | 功能 |
|------|------|------|
| `/` | `Services.tsx` | 服务列表 + CRUD |
| `/agents` | `Agents.tsx` | Agent 缓存列表 + 统计 |
| `/payments` | `Payments.tsx` | 支付记录查询 |
| `/requests` | `Requests.tsx` | 请求记录查询（生命周期时间线） |
| `/providers` | — | 服务提供商管理 |
| `/chains` | — | 链配置管理 |
| `/tokens` | — | 代币配置管理 |
| `/rpc` | — | RPC 端点管理 + 健康监控 |
| `/payment-test` | `PaymentTest.tsx` | 支付流程测试工具 |

详见 [Admin UI 指南](./admin-ui.md)。

---

## 包依赖关系

```
shared (零依赖 — 纯类型/工具)
  ↑
chain (依赖 shared + viem)
  ↑
facilitator (依赖 shared + chain + viem)
  ↑
core (依赖 shared + chain + facilitator + hono + better-sqlite3)
  ↑
admin-api (依赖 shared + chain + core + hono)
admin-ui (依赖 shared — 通过 HTTP 调用 admin-api)
```

### 构建命令

```bash
# 构建所有包（Turborepo 自动处理依赖顺序）
pnpm build

# 构建单个包
cd packages/shared && pnpm build

# 开发模式
pnpm dev  # 启动 core + admin-api + admin-ui
```
