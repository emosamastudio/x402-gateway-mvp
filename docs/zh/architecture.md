# 架构设计 / Architecture

## Monorepo 结构 / Monorepo Structure

```
x402-gateway-mvp/
├── packages/
│   ├── shared/          # 共享类型、Zod Schema、工具函数
│   ├── chain/           # 链交互：注册表、RPC 健康检查、ERC-8004
│   ├── facilitator/     # 支付验证 & 链上结算
│   ├── core/            # 网关核心：中间件、代理、数据库
│   ├── admin-api/       # 管理 REST API
│   └── admin-ui/        # React 管理界面
├── scripts/             # 演示与测试脚本
├── start.ts             # 统一启动入口
├── turbo.json           # Turborepo 构建配置
└── pnpm-workspace.yaml  # pnpm 工作区
```

## 包依赖关系 / Package Dependency Graph

```
                    ┌──────────┐
                    │  shared  │  ← 所有包的基础 / base for all
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────────┐  │
         │ chain  │ │facilitator │  │
         └───┬────┘ └─────┬──────┘  │
             │            │         │
             └──────┬─────┘         │
                    ▼               │
              ┌──────────┐          │
              │   core   │ ◄───────┘
              └────┬─────┘
                   │
              ┌────▼─────┐     ┌──────────┐
              │admin-api  │     │ admin-ui │
              └──────────┘     └──────────┘
                   ▲                 │
                   └─── HTTP API ────┘
```

### 构建顺序 / Build Order

```
shared → chain → facilitator → core → admin-api
                                       admin-ui (independent, Vite dev server)
```

## 系统架构图 / System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        AI Agent / Client                         │
│  1. GET /echo/test (无支付头)                                      │
│  2. 收到 402 + PaymentRequirement                                  │
│  3. 构造 EIP-712 签名                                              │
│  4. GET /echo/test + PAYMENT-SIGNATURE 头                          │
│  5. 收到 200 + PAYMENT-RESPONSE 头 (txHash)                        │
└──────────────┬───────────────────────────────────────────────────┘
               │ HTTP
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Gateway Core (:8402)                           │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│  │    Identity      │──▶│    x402      │──▶│     Proxy       │   │
│  │   Middleware     │   │  Middleware   │   │  (to backend)   │   │
│  │                  │   │              │   │                  │   │
│  │ • X-Agent-Addr  │   │ • 402 质询    │   │ • Strip prefix  │   │
│  │ • ERC-8004 验证  │   │ • 签名验证    │   │ • Forward req   │   │
│  │ • 信誉检查       │   │ • 生命周期管理 │   │ • 10s timeout   │   │
│  └─────────────────┘   └──────┬───────┘   └────────┬─────────┘   │
│                               │                     │             │
│                               ▼                     ▼             │
│                    ┌────────────────┐    ┌─────────────────┐      │
│                    │  Facilitator   │    │   Backend API   │      │
│                    │                │    │   (e.g. Echo)   │      │
│                    │ • verifyPayment│    └─────────────────┘      │
│                    │ • settlePayment│                             │
│                    │   (on-chain)   │                             │
│                    └────────┬───────┘                             │
│                             │                                    │
│  ┌──────────────────────────▼─────────────────────────────────┐  │
│  │                    SQLite Database                          │  │
│  │  requests · payments · services · providers · chains       │  │
│  │  tokens · agent_cache · rpc_endpoints · used_nonces        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
               │
               │ HTTP (Admin)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Admin API (:8403)                              │
│                                                                  │
│  /services · /providers · /chains · /tokens · /rpc-endpoints     │
│  /agents · /requests · /payments · /health                       │
│                                                                  │
│  Bearer Token Authentication (ADMIN_API_KEY)                     │
└──────────────────────────────────────────────────────────────────┘
               │
               │ Vite Proxy
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Admin UI (:5173)                               │
│                                                                  │
│  React 18 + Vite 5 · Dark Theme                                 │
│  Pages: Services, Providers, Chains, Tokens, Requests,           │
│         Payments, Agents, Stats, PaymentTest                     │
└──────────────────────────────────────────────────────────────────┘
```

## 请求处理流程 / Request Processing Flow

### 无支付路径 (403/402)

```
Agent Request
    │
    ▼
Identity Middleware
    ├── 无 X-Agent-Address → 403 Unauthorized
    ├── ERC-8004 未注册 → 403 Unauthorized
    ├── 信誉不足 → 403 Unauthorized
    │
    ▼ (通过)
x402 Middleware
    ├── 无 PAYMENT-SIGNATURE 头 → 创建 payment_required 记录 → 402 (返回 PaymentRequirement)
    ├── 无效 base64/JSON → 更新为 payment_rejected → 402
    ├── 验证失败 → 更新为 payment_rejected → 402
    │
    ▼ (验证通过 → 更新为 verifying)
Proxy Handler
    └── 继续处理...
```

### 有支付路径 (成功/失败)

```
Proxy Handler
    │
    ├── 后端不可达 → proxy_error (502/504)
    ├── 后端返回非 2xx → backend_error
    │
    ▼ (后端 2xx)
    ├── 无支付 → success (200)
    │
    ▼ (有支付)
    更新为 settling
    │
    ├── 结算成功 → settled + 创建 Payment 记录
    └── 结算失败 → settlement_failed + 创建 Payment 记录 (含错误)
```

## 端口分配 / Port Allocation

| 服务 Service | 默认端口 Default Port | 环境变量 Env Var | 说明 Description |
|------|------|------|------|
| Gateway Core | 8402 | `CORE_PORT` | 网关代理，处理 Agent 请求 |
| Admin API | 8403 | `ADMIN_PORT` | 管理 REST API |
| Admin UI (dev) | 5173 | — | Vite 开发服务器 |
| Echo Server (test) | 9999 | — | 测试用 echo 后端 |

## 数据流 / Data Flow

```
┌─────────┐    HTTP     ┌─────────┐    HTTP    ┌──────────┐
│  Agent  │ ──────────▶ │ Gateway │ ─────────▶ │ Backend  │
│         │ ◀────────── │  Core   │ ◀───────── │   API    │
└─────────┘  402/200    └────┬────┘            └──────────┘
                             │
                     ┌───────┼───────┐
                     ▼       ▼       ▼
               ┌─────────┐ ┌────┐ ┌──────────┐
               │  Chain   │ │ DB │ │Facilitator│
               │ (viem)   │ │    │ │(settle)   │
               └─────────┘ └────┘ └──────────┘
                  │                     │
                  ▼                     ▼
            ┌──────────┐        ┌──────────┐
            │ ERC-8004 │        │   ERC-20 │
            │ Identity │        │  Transfer│
            └──────────┘        └──────────┘
```
