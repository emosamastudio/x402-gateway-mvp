# 管理 API 参考 / Admin API Reference

**Base URL**: `http://localhost:8403`

**认证 / Authentication**: Bearer Token in `Authorization` header

```
Authorization: Bearer <ADMIN_API_KEY>
```

> 如果 `ADMIN_API_KEY` 未设置，则不需要认证（仅开发环境）。

---

## 健康检查 / Health Check

### `GET /health`

```json
{ "status": "ok" }
```

---

## 服务管理 / Services

### `POST /services` — 创建服务

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

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 服务名称 |
| `providerId` | string | ✓ | 服务提供商 ID |
| `gatewayPath` | string | ✓ | 网关路由前缀，必须以 `/` 开头 |
| `backendUrl` | string | ✓ | 后端 URL |
| `priceAmount` | string | ✓ | 每次调用价格（人类可读，如 "0.001"） |
| `network` | string | ✓ | 链标识（必须已注册） |
| `tokenId` | string | ✓ | 代币 ID（必须已注册） |
| `recipient` | string | ✓ | 收款 EVM 地址 |
| `apiKey` | string | 否 | 转发给后端的 API Key |
| `minReputation` | number | 否 | 最低信誉分要求（0 = 无限制） |

**Response:** `201` — 返回创建的 Service 对象

**Errors:**
- `400` — 验证失败
- `404` — Provider/Chain/Token 不存在
- `409` — `gatewayPath` 已被占用

### `GET /services` — 列出所有服务

**Response:** `200` — Service 数组

### `GET /services/:id` — 获取单个服务

**Response:** `200` — Service 对象 | `404`

### `PUT /services/:id` — 更新服务

**Request Body:** 部分更新（只传需要改的字段）

```json
{
  "name": "Updated Name",
  "backendUrl": "http://new-backend:8080"
}
```

**Response:** `200` — 更新后的 Service 对象

### `DELETE /services/:id` — 删除服务

**Response:** `204` | `404`

---

## 服务提供商 / Providers

### `POST /providers` — 创建提供商

```json
{
  "name": "Acme AI Services",
  "walletAddress": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c",
  "description": "AI service provider",
  "website": "https://acme.ai"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 提供商名称 |
| `walletAddress` | string | ✓ | EVM 钱包地址（默认收款方） |
| `description` | string | 否 | 说明 |
| `website` | string | 否 | 网站 URL |

**Response:** `201`

**Errors:** `409` — 钱包地址已存在

### `GET /providers` — 列出所有

### `GET /providers/:id` — 获取单个

### `GET /providers/:id/services` — 获取提供商的所有服务

### `PUT /providers/:id` — 更新

> 更新钱包地址时，自动更新该提供商下所有使用旧地址作为 `recipient` 的服务。

### `DELETE /providers/:id` — 删除

> 如果提供商下还有服务，返回 `409`（需先删除服务）。

---

## 链管理 / Chains

### `POST /chains` — 创建链

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

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 链 slug（小写字母 + 连字符） |
| `name` | string | ✓ | 显示名称 |
| `chainId` | number | ✓ | EVM chain ID |
| `rpcUrl` | string | ✓ | 默认 JSON-RPC URL |
| `explorerUrl` | string | 否 | 区块浏览器 URL |
| `isTestnet` | boolean | ✓ | 是否测试网 |
| `nativeCurrency` | string | ✓ | 原生代币符号 |
| `erc8004Identity` | string | 否 | ERC-8004 合约地址 |

**Response:** `201`

### `GET /chains` — 列出所有

### `GET /chains/:id` — 获取单个

### `PUT /chains/:id` — 更新（自动重载运行时注册表）

### `DELETE /chains/:id` — 删除

> 如果有代币引用此链，返回 `409`。

---

## 代币管理 / Tokens

### `POST /tokens/verify` — 链上合约验证

对代币合约进行全面的链上验证：

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

验证内容：
- ERC-20 基础（name, symbol, decimals）
- EIP-3009 `transferWithAuthorization` 支持（字节码扫描 / EIP-1967 代理 / eth_call 模拟）
- `DOMAIN_SEPARATOR()` 读取
- EIP-5267 `eip712Domain()` 读取

### `POST /tokens` — 创建代币

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

### `GET /tokens` — 列出所有

### `GET /tokens/:id` — 获取单个

### `PUT /tokens/:id` — 更新

### `DELETE /tokens/:id` — 删除

> 如果有服务引用此代币，返回 `409`。

---

## RPC 端点管理 / RPC Endpoints

### `POST /rpc-endpoints` — 创建端点

创建时自动探测连接性。

```json
{
  "chainSlug": "optimism-sepolia",
  "url": "https://opt-sepolia.g.alchemy.com/v2/<key>",
  "label": "Alchemy",
  "priority": 10,
  "isActive": true
}
```

### `GET /rpc-endpoints` — 列出所有

**Query:** `?chainSlug=optimism-sepolia` — 按链过滤

### `GET /rpc-endpoints/:id` — 获取单个

### `PUT /rpc-endpoints/:id` — 更新

### `DELETE /rpc-endpoints/:id` — 删除

> 每条链至少保留 1 个端点，否则返回 `409`。

### `POST /rpc-endpoints/health-check` — 触发健康检查

### `POST /rpc-endpoints/:id/reset-stats` — 重置统计

### `GET /rpc-endpoints/stats-history` — 获取时序统计

**Query:** `?chainSlug=&hours=24`

### `GET /rpc-endpoints/chain-summary` — 获取链级汇总

---

## Agent 管理 / Agents

### `GET /agents` — 列出所有缓存的 Agent

返回所有缓存的 Agent 以及其活动统计。

### `GET /agents/:address` — 查询 Agent 身份

从链上查询（1 分钟缓存）。

**Response:**

```json
{
  "address": "0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646",
  "isRegistered": true,
  "reputation": 100,
  "cachedAt": 1711612800000
}
```

### `GET /agents/:address/stats` — Agent 活动统计

```json
{
  "totalRequests": 42,
  "successRequests": 38,
  "totalPayments": 35,
  "totalSpent": "0.035"
}
```

---

## 请求记录 / Requests

### `GET /requests` — 列出请求记录

**Query:**
- `?serviceId=svc_xxx` — 按服务过滤
- `?status=settled` — 按状态过滤

**Response:** GatewayRequest 数组

---

## 支付记录 / Payments

### `GET /payments` — 列出支付记录

**Query:**
- `?serviceId=svc_xxx` — 按服务过滤

**Response:** Payment 数组
