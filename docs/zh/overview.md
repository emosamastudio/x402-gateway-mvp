# 项目概述 / Project Overview

## x402 Payment Gateway 是什么？

x402 Payment Gateway 是一个基于 **HTTP 402 状态码**的按次付费 API 网关。它充当 API 服务提供者和 AI Agent（调用方）之间的中间层，实现：

- **按次计费**：每次 API 调用通过 ERC-20 代币进行链上结算
- **无需注册**：Agent 通过 ERC-8004 链上身份即可接入
- **即时结算**：使用 EIP-3009 `transferWithAuthorization` 实现单笔即时链上支付
- **透明定价**：402 质询响应中包含完整的价格和支付信息

## What is x402 Payment Gateway?

x402 Payment Gateway is a pay-per-request API gateway based on the **HTTP 402 status code**. It acts as an intermediary between API service providers and AI Agents (callers), providing:

- **Per-call billing**: Each API call is settled on-chain via ERC-20 tokens
- **No registration required**: Agents access services via ERC-8004 on-chain identity
- **Instant settlement**: Uses EIP-3009 `transferWithAuthorization` for single-call on-chain payment
- **Transparent pricing**: 402 challenge responses include full pricing and payment information

---

## 核心协议与标准 / Core Protocols & Standards

### HTTP 402 Payment Required

HTTP 402 是一个保留的 HTTP 状态码，最初设计用于"需要付款"的场景。x402 网关利用这一语义：

- 客户端首次请求时，网关返回 `402` 响应，包含 `PaymentRequirement` JSON（价格、代币、收款地址等）
- 客户端构造 EIP-712 签名的 `TransferWithAuthorization` 并在重试请求的 `PAYMENT-SIGNATURE` 头中携带
- 网关验证签名、代理请求到后端、然后广播链上结算交易

HTTP 402 is a reserved HTTP status code originally designed for "payment required" scenarios. The x402 gateway leverages this status code:

- On first request, the gateway returns `402` with a `PaymentRequirement` JSON (price, token, recipient, etc.)
- The client constructs an EIP-712 signed `TransferWithAuthorization` and retries with a `PAYMENT-SIGNATURE` header
- The gateway verifies the signature, proxies the request to the backend, then broadcasts the on-chain settlement

### EIP-3009: transferWithAuthorization

EIP-3009 允许代币持有者签署一个链下授权，由第三方（Facilitator）代为执行链上转账。关键特性：

- **链下签名**：Agent 只需签名，无需持有 ETH 来支付 gas
- **Nonce 防重放**：每个授权包含唯一 nonce，防止重复使用
- **时间约束**：`validAfter` / `validBefore` 控制授权的有效时间窗口

EIP-3009 allows token holders to sign an off-chain authorization for a third party (Facilitator) to execute the on-chain transfer. Key features:

- **Off-chain signing**: Agent only signs; no ETH needed for gas
- **Nonce replay protection**: Each authorization includes a unique nonce
- **Time constraints**: `validAfter` / `validBefore` control the authorization validity window

### ERC-8004: On-Chain Identity

ERC-8004 提供链上身份验证：

- `isRegistered(address)` — 检查地址是否已注册
- `getReputationScore(address)` — 获取链上信誉评分
- 网关根据注册状态和最低信誉分进行准入控制

ERC-8004 provides on-chain identity verification:

- `isRegistered(address)` — checks if address is registered
- `getReputationScore(address)` — gets on-chain reputation score
- Gateway performs admission control based on registration status and minimum reputation

### EIP-712: Typed Structured Data

EIP-712 是签名结构化数据的标准。网关使用它来构造 `TransferWithAuthorization` 的签名：

- Domain Separator 从代币合约链上读取（`DOMAIN_SEPARATOR()`）
- 结构体包含 `from`、`to`、`value`、`validAfter`、`validBefore`、`nonce`

EIP-712 is the standard for signing typed structured data. The gateway uses it to construct `TransferWithAuthorization` signatures:

- Domain Separator is read from the token contract on-chain (`DOMAIN_SEPARATOR()`)
- The struct includes `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`

---

## 适用场景 / Use Cases

### AI Agent 付费 API 调用 / AI Agent Paid API Calls

```
AI Agent ──→ x402 Gateway MVP ──→ Weather API / LLM API / Data API
                  │
                  └──→ On-chain settlement (DMHKD token)
```

AI Agent 可以自主发现、调用和支付 API 服务，无需预先注册或建立信用关系。

AI Agents can autonomously discover, call, and pay for API services without prior registration or credit relationships.

### 多服务定价 / Multi-Service Pricing

网关支持注册多个后端服务，每个服务独立配置：
- 价格（如 0.001 DMHKD / 次）
- 接收地址
- 网络（链）
- 准入最低信誉分

The gateway supports registering multiple backend services, each independently configured:
- Price (e.g., 0.001 DMHKD per call)
- Recipient address
- Network (chain)
- Minimum reputation for access

### 服务提供商管理 / Service Provider Management

服务提供商（Provider）可以管理多个 API 服务，统一配置钱包地址作为默认收款方。

Service Providers can manage multiple API services with a unified wallet address as the default payment recipient.

---

## 技术栈 / Technology Stack

| 组件 Component | 技术 Technology |
|----------------|-----------------|
| 运行时 Runtime | Node.js + TypeScript |
| Web 框架 Framework | Hono |
| 数据库 Database | SQLite (better-sqlite3) |
| 链交互 Chain | viem |
| 前端 Frontend | React 18 + Vite 5 |
| 图表 Charts | Recharts |
| 构建 Build | pnpm workspaces + Turborepo |
| 测试 Testing | Vitest |
| 代币 Token | DMHKD (ERC-20 / EIP-3009) |
| 测试网 Testnet | Optimism Sepolia, Ethereum Sepolia |

---

## 系统角色 / System Roles

| 角色 Role | 说明 Description |
|-----------|-------------------|
| **Agent** | AI 代理，拥有链上身份（ERC-8004），访问付费 API 并签署支付授权 |
| **Service Provider** | 服务提供商，注册和管理后端 API 服务 |
| **Facilitator** | 网关内置角色，验证签名并广播链上结算交易（持有 ETH 支付 gas） |
| **Admin** | 管理员，通过 Admin UI/API 管理网关配置 |

| Role | Description |
|------|-------------|
| **Agent** | AI agent with on-chain identity (ERC-8004), accesses paid APIs and signs payment authorizations |
| **Service Provider** | Registers and manages backend API services |
| **Facilitator** | Built-in gateway role, verifies signatures and broadcasts on-chain settlement transactions (holds ETH for gas) |
| **Admin** | Administrator, manages gateway configuration via Admin UI/API |
