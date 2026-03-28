# 数据库设计文档

本文档详细描述 x402-gateway-mvp 使用的 SQLite 数据库结构（通过 `better-sqlite3` 驱动）。

数据库文件默认路径：`./gateway.db`（可通过 `DB_PATH` 环境变量覆盖）。

---

## 数据库引擎

| 属性 | 值 |
|------|-----|
| 引擎 | SQLite 3 |
| 驱动 | better-sqlite3 |
| 文件 | `gateway.db` |
| 初始化 | `createDb()` 函数自动创建表 + 迁移 + 种子数据 |

---

## 表结构总览

| 表名 | 用途 | 主键 |
|------|------|------|
| `chains` | 区块链网络配置 | `id` (TEXT) |
| `tokens` | ERC-20 代币配置 | `id` (TEXT) |
| `service_providers` | 服务提供商 | `id` (TEXT) |
| `services` | 注册的 API 服务 | `id` (TEXT) |
| `requests` | 网关请求记录 | `id` (TEXT) |
| `payments` | 链上支付记录 | `id` (TEXT) |
| `agent_cache` | Agent 身份缓存 | `address` (TEXT) |
| `rpc_endpoints` | RPC 端点配置 | `id` (TEXT) |
| `rpc_stats_history` | RPC 统计历史 | `id` (TEXT) |
| `used_nonces` | 已使用的 nonce（防重放） | `nonce` (TEXT) |

---

## 详细表结构

### chains — 区块链网络

```sql
CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,              -- 链标识（如 "optimism-sepolia"）
  name TEXT NOT NULL,               -- 显示名称
  chain_id INTEGER NOT NULL,        -- EVM chain ID
  rpc_url TEXT NOT NULL,            -- 默认 RPC URL
  explorer_url TEXT NOT NULL DEFAULT '',  -- 区块浏览器 URL
  is_testnet INTEGER NOT NULL DEFAULT 0, -- 是否测试网（0/1）
  native_currency TEXT NOT NULL DEFAULT 'ETH', -- 原生代币符号
  erc8004_identity TEXT NOT NULL DEFAULT '', -- ERC-8004 身份注册合约地址
  created_at INTEGER NOT NULL       -- 创建时间 (Unix ms)
);
```

**种子数据**：首次初始化时自动插入两条：
- `optimism-sepolia` — Optimism Sepolia (chainId: 11155420)
- `sepolia` — Ethereum Sepolia (chainId: 11155111)

---

### tokens — ERC-20 代币

```sql
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,              -- 代币 ID（如 "dmhkd-optimism-sepolia"）
  symbol TEXT NOT NULL,             -- 符号（如 "DMHKD"）
  name TEXT NOT NULL,               -- 全名
  chain_slug TEXT NOT NULL,         -- 所在链（外键→chains.id）
  contract_address TEXT NOT NULL,   -- 合约地址
  decimals INTEGER NOT NULL DEFAULT 6,  -- 精度
  domain_name TEXT NOT NULL DEFAULT '',  -- EIP-712 域名称
  domain_version TEXT NOT NULL DEFAULT '1', -- EIP-712 域版本
  is_active INTEGER NOT NULL DEFAULT 1,  -- 是否激活
  created_at INTEGER NOT NULL
);
```

**唯一索引**：`(chain_slug, contract_address COLLATE NOCASE)` — 同链同合约不可重复。

**种子数据**：
- `dmhkd-optimism-sepolia` — DMHKD on Optimism Sepolia
- `dmhkd-sepolia` — DMHKD on Ethereum Sepolia

---

### service_providers — 服务提供商

```sql
CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,              -- UUID
  name TEXT NOT NULL,               -- 提供商名称
  wallet_address TEXT NOT NULL,     -- 钱包地址
  description TEXT NOT NULL DEFAULT '',  -- 描述
  website TEXT NOT NULL DEFAULT '',  -- 网站
  created_at INTEGER NOT NULL
);
```

---

### services — API 服务

```sql
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,              -- UUID
  provider_id TEXT NOT NULL DEFAULT '',  -- 所属提供商（外键→service_providers.id）
  name TEXT NOT NULL,               -- 服务名称
  gateway_path TEXT NOT NULL,       -- 网关路径前缀（如 "/echo"）
  backend_url TEXT NOT NULL,        -- 后端 URL（如 "http://localhost:9999/echo"）
  price_amount TEXT NOT NULL,       -- 单次调用价格（如 "0.001"）
  price_currency TEXT NOT NULL,     -- 价格币种（如 "DMHKD"）
  network TEXT NOT NULL,            -- 支付网络（如 "optimism-sepolia"）
  token_id TEXT NOT NULL DEFAULT '',-- 代币 ID（外键→tokens.id）
  recipient TEXT NOT NULL,          -- 收款地址
  api_key TEXT NOT NULL DEFAULT '', -- 后端 API Key（自动注入 Authorization 头）
  min_reputation INTEGER NOT NULL DEFAULT 0, -- 最低声誉要求
  created_at INTEGER NOT NULL
);
```

**自动迁移**：`gateway_path`、`api_key`、`token_id`、`provider_id` 字段通过 ALTER TABLE 自动添加。

**自动填充**：`token_id` 为空时由 `LOWER(price_currency) || '-' || network` 自动生成。

---

### requests — 网关请求记录

```sql
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,              -- UUID
  service_id TEXT NOT NULL,         -- 关联服务
  agent_address TEXT NOT NULL DEFAULT '',  -- Agent 地址
  method TEXT NOT NULL DEFAULT '',  -- HTTP 方法（GET/POST/…）
  path TEXT NOT NULL DEFAULT '',    -- 请求路径
  network TEXT NOT NULL DEFAULT '', -- 支付网络
  gateway_status TEXT NOT NULL DEFAULT '', -- 生命周期状态
  http_status INTEGER NOT NULL DEFAULT 0, -- 最终 HTTP 状态码
  response_status INTEGER NOT NULL DEFAULT 0, -- 后端响应状态码
  response_body TEXT NOT NULL DEFAULT '',  -- 后端响应体（可能截断）
  error_reason TEXT NOT NULL DEFAULT '',   -- 错误原因
  payment_id TEXT NOT NULL DEFAULT '',     -- 关联支付 ID
  challenge_at INTEGER NOT NULL DEFAULT 0, -- 402 质询时间 (Unix ms)
  verified_at INTEGER NOT NULL DEFAULT 0,  -- 签名验证通过时间
  proxy_at INTEGER NOT NULL DEFAULT 0,     -- 代理转发时间
  settled_at INTEGER NOT NULL DEFAULT 0,   -- 链上结算完成时间
  created_at INTEGER NOT NULL              -- 创建时间
);
```

**生命周期状态（gateway_status）**：

| 状态 | 含义 | 终态？ |
|------|------|--------|
| `payment_required` | 已返回 402，等待 Agent 签名 | 否 |
| `verifying` | 正在验证签名 | 否 |
| `settling` | 后端已返回 2xx，正在广播链上结算 | 否 |
| `success` | 完整流程成功（无需支付路径） | ✅ |
| `settled` | 链上结算成功 | ✅ |
| `settlement_failed` | 结算失败但后端已响应 | ✅ |
| `payment_rejected` | 签名验证失败 | ✅ |
| `proxy_error` | 后端代理失败 | ✅ |
| `backend_error` | 后端返回非 2xx | ✅ |
| `unauthorized` | 身份验证失败 | ✅ |

**生命周期时间戳**：

| 时间戳 | 记录时机 |
|--------|----------|
| `challenge_at` | 返回 402 时 |
| `verified_at` | 签名验证通过时 |
| `proxy_at` | 后端响应返回时 |
| `settled_at` | 链上结算完成时 |

**关键查询 — findPendingRequest**：
```sql
SELECT * FROM requests
WHERE service_id = ? AND agent_address = ?
  AND gateway_status = 'payment_required'
  AND created_at > ?  -- 5分钟窗口
ORDER BY created_at DESC LIMIT 1
```

---

### payments — 链上支付记录

```sql
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,              -- UUID
  request_id TEXT NOT NULL DEFAULT '',  -- 关联请求 ID
  service_id TEXT NOT NULL,         -- 关联服务
  agent_address TEXT NOT NULL,      -- Agent 地址
  tx_hash TEXT NOT NULL,            -- 链上交易哈希
  network TEXT NOT NULL,            -- 支付网络
  amount TEXT NOT NULL,             -- 支付金额
  status TEXT NOT NULL,             -- "settled" / "failed"
  settlement_error TEXT NOT NULL DEFAULT '', -- 结算错误信息
  created_at INTEGER NOT NULL
);
```

---

### agent_cache — Agent 身份缓存

```sql
CREATE TABLE IF NOT EXISTS agent_cache (
  address TEXT PRIMARY KEY,         -- Agent 地址（小写）
  is_registered INTEGER NOT NULL,   -- 0 或 1
  reputation INTEGER NOT NULL,      -- 链上声誉值
  cached_at INTEGER NOT NULL        -- 缓存时间 (Unix ms)
);
```

**缓存策略**：5 分钟 TTL。过期后重新查询链上 ERC-8004。使用 `UPSERT`（`ON CONFLICT DO UPDATE`）。

---

### rpc_endpoints — RPC 端点

```sql
CREATE TABLE IF NOT EXISTS rpc_endpoints (
  id TEXT PRIMARY KEY,
  chain_slug TEXT NOT NULL,         -- 所属链
  url TEXT NOT NULL,                -- RPC URL
  label TEXT NOT NULL DEFAULT '',   -- 显示标签
  priority INTEGER NOT NULL DEFAULT 0,  -- 优先级（越小越高）
  is_active INTEGER NOT NULL DEFAULT 1,
  health_status TEXT NOT NULL DEFAULT 'unknown', -- healthy/degraded/down/unknown
  last_health_check INTEGER NOT NULL DEFAULT 0,
  last_latency INTEGER NOT NULL DEFAULT -1,  -- 最近延迟 (ms)
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
```

**唯一索引**：`(chain_slug, url COLLATE NOCASE)` — 同链同 URL 不可重复。

**自动种子**：从 chains 表的 `rpc_url` 自动创建对应端点。

---

### rpc_stats_history — RPC 统计快照

```sql
CREATE TABLE IF NOT EXISTS rpc_stats_history (
  id TEXT PRIMARY KEY,              -- "stat_{endpointId}_{timestamp}"
  endpoint_id TEXT NOT NULL,        -- 关联 RPC 端点
  chain_slug TEXT NOT NULL,
  timestamp INTEGER NOT NULL,       -- 快照时间 (Unix ms)
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

**清理策略**：`pruneRpcStatsHistory(retainMs)` 删除超过指定时长的旧记录。

---

### used_nonces — 防重放 Nonce

```sql
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,           -- nonce（小写 hex）
  network TEXT NOT NULL DEFAULT '', -- 所属网络
  agent_address TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
```

**用途**：EIP-3009 签名的 nonce 在使用后被记录，防止重放攻击。

**清理策略**：`pruneExpiredNonces(maxAgeMs)` 删除过期 nonce。

---

## 索引一览

| 索引名称 | 表 | 列 |
|----------|-----|-----|
| `idx_tokens_chain_contract` | tokens | (chain_slug, contract_address) UNIQUE |
| `idx_rpc_chain_url` | rpc_endpoints | (chain_slug, url) UNIQUE |
| `idx_rpc_stats_chain_time` | rpc_stats_history | (chain_slug, timestamp) |
| `idx_rpc_stats_endpoint_time` | rpc_stats_history | (endpoint_id, timestamp) |

---

## 自动迁移机制

`createDb()` 执行以下步骤：

1. **执行 DDL**：`CREATE TABLE IF NOT EXISTS` 创建所有表
2. **检测缺失列**：通过 `PRAGMA table_info()` 检查，自动 `ALTER TABLE ADD COLUMN`
3. **创建索引**：`CREATE UNIQUE INDEX IF NOT EXISTS`
4. **种子数据**：如果 chains/tokens 表为空，插入默认配置
5. **数据修复**：自动为空 `token_id` 的服务计算值

这意味着数据库模式可以安全地演进，无需手动执行迁移脚本。

---

## 数据库 API 方法

所有数据库方法通过 `getDb()` 单例获取。

### 链 (Chains)
- `insertChain(chain)` — 插入新链
- `getChain(id)` — 按 ID 获取
- `listChains()` — 列出所有链
- `updateChain(id, updates)` — 更新字段
- `deleteChain(id)` — 删除

### 代币 (Tokens)
- `insertToken(token)` — 插入新代币
- `getToken(id)` — 按 ID 获取
- `getTokenByChainAndAddress(chainSlug, address)` — 按链+合约查找
- `listTokens()` — 列出所有代币
- `updateToken(id, updates)` — 更新
- `deleteToken(id)` — 删除

### 服务提供商 (Providers)
- `insertProvider(p)` — 插入
- `getProvider(id)` — 按 ID 获取
- `getProviderByWallet(walletAddress)` — 按钱包地址查找
- `listProviders()` — 列出所有
- `listServicesByProvider(providerId)` — 列出该提供商的所有服务
- `updateProvider(id, updates)` — 更新
- `deleteProvider(id)` — 删除

### 服务 (Services)
- `insertService(svc)` — 插入
- `getServiceById(id)` — 按 ID 获取
- `listServices()` — 列出所有
- `updateService(id, updates)` — 更新
- `deleteService(id)` — 删除

### 请求 (Requests)
- `insertRequest(r)` — 插入新请求
- `updateRequest(id, updates)` — 更新请求（状态、时间戳等）
- `findPendingRequest(serviceId, agentAddress)` — 查找 5 分钟内的待支付请求
- `updateRequestPaymentId(requestId, paymentId)` — 关联支付
- `listRequests(serviceId?, status?)` — 筛选列表

### 支付 (Payments)
- `insertPayment(p)` — 插入
- `listPayments(serviceId?)` — 列出

### Agent 缓存 (Agent Cache)
- `upsertAgentCache(agent)` — 更新或插入缓存
- `getAgentCache(address)` — 获取缓存
- `listAgentCache()` — 列出所有
- `getAgentStats(address)` — 获取 Agent 统计数据

### RPC 端点
- `insertRpcEndpoint(ep)` — 插入
- `getRpcEndpoint(id)` — 获取
- `listRpcEndpoints(chainSlug?)` — 列出
- `getRpcEndpointByChainAndUrl(chainSlug, url)` — 查找
- `updateRpcEndpoint(id, updates)` — 更新
- `incrementRpcStats(id, isError)` — 增量更新统计
- `deleteRpcEndpoint(id)` — 删除

### RPC 统计历史
- `insertRpcStatsSnapshot(row)` — 插入快照
- `getRpcStatsHistory(chainSlug, sinceMs?)` — 获取历史
- `pruneRpcStatsHistory(retainMs)` — 清理旧数据
- `getRpcChainSummary()` — 获取链级别汇总

### Nonce 管理
- `isNonceUsed(nonce)` — 检查是否已使用
- `markNonceUsed(nonce, network?, agentAddress?)` — 标记为已使用
- `pruneExpiredNonces(maxAgeMs)` — 清理过期 nonce
