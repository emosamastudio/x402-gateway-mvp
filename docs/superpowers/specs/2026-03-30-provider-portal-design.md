# Provider Portal 设计规范

**日期**: 2026-03-30
**状态**: 已批准，待实现

---

## 背景

x402 Gateway 目前有一个 Admin UI（`:5173`），供平台运维人员管理全局配置（链、Token、所有服务、所有请求记录）。
现在需要一个独立的 **Provider Portal**，供 API 服务提供商自助注册、管理自己的服务、并通过可视化 Dashboard 查看服务的使用和收款情况。

Provider 不是调用 API 的 Agent，而是把自己的后端 API 接入 x402 Gateway 并对外出售访问权的人。

---

## 技术选型

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 部署方式 | 独立包 `packages/provider-ui` | 与 admin-ui 权限完全隔离 |
| 鉴权方式 | 钱包签名 → JWT | 无密码，天然绑定链上身份 |
| 后端扩展 | 在现有 admin-api 中新增 `/provider/*` 路由 | 避免多进程共享 SQLite 的写竞态风险 |
| 注册流程 | 开放自助注册（连接钱包即可创建账号） | 无需 Admin 预先建账 |
| Provider 权限 | 只能管理自己的服务；Token/网络从 Admin 已配置列表中选择 | 最小权限原则 |

---

## 架构

```
packages/
├── admin-api/                     （已有）扩展新路由
│   └── src/
│       ├── app.ts                 挂载 /provider 路由组
│       ├── middleware/
│       │   └── provider-jwt.ts    JWT 验证中间件（新增）
│       └── routes/
│           ├── provider-auth.ts   签名换 JWT（新增）
│           ├── provider-me.ts     Provider 自身信息（新增）
│           ├── provider-services.ts  服务 CRUD（新增）
│           └── provider-stats.ts  数据查询（新增）
│
└── packages/provider-ui/          （新增）
    ├── package.json
    ├── vite.config.ts             port: 5174，/provider → :8403
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx                路由定义
        ├── api.ts                 HTTP 客户端，附 JWT
        ├── auth.ts                JWT 本地存储 + 过期检测
        └── pages/
            ├── Login.tsx
            ├── Register.tsx
            ├── Dashboard.tsx
            ├── Services.tsx
            ├── Requests.tsx
            ├── Payments.tsx
            └── Account.tsx
```

**数据流**:
```
provider-ui :5174
  └─ /provider/* ──proxy──▶ admin-api :8403
                                  │
                            verifyProviderJwt()     ← 所有路由
                                  │
                            ctx.providerId
                                  │
                 ┌────────────────┼────────────────┐
          listServices()   listRequests()   listPayments()
          WHERE provider_id = ?   WHERE service_id IN (provider's services)
```

---

## 鉴权流程

### 登录（已注册 Provider）

```
1. 前端: GET /provider/auth/nonce?address=0x...
         → { nonce: "Sign in to x402 Gateway\nNonce: abc123\nExpires: ..." }

2. 用户在 MetaMask 签名该消息

3. 前端: POST /provider/auth/verify
         Body: { walletAddress, signature }
         → { token: "<JWT>", provider: { id, name, ... } }

4. 前端将 JWT 存入 localStorage，后续请求加 Authorization: Bearer <JWT>
```

### 首次注册

```
1-3. 同登录流程，但 POST /provider/auth/verify 检测到 walletAddress 不在 DB
     → 自动创建最小 provider 记录（只有 walletAddress，name 为空）
     → 返回 JWT + { provider: { id, name: "", ... }, needsProfile: true }

4. 前端检测到 needsProfile=true，跳转 /register 填写 name（必填）、description、website

5. PUT /provider/me  Body: { name, description, website }
   → 更新 provider 记录，跳转 Dashboard
```

### JWT 规范

- 算法: HS256
- 密钥: 环境变量 `PROVIDER_JWT_SECRET`（未设置时 warn，用随机字符串兜底——每次重启失效）
- Payload: `{ sub: providerId, address: walletAddress, iat, exp }`
- 有效期: 24 小时
- 过期时前端自动跳回 Login 页

---

## 后端新增路由

所有路由挂载在 `/provider` 前缀。
`/provider/auth/*` 无需 JWT；其余全部经过 `verifyProviderJwt` 中间件。

### 鉴权路由

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| `GET` | `/provider/auth/nonce` | `?address=0x...` | `{ nonce: string }` |
| `POST` | `/provider/auth/verify` | `{ walletAddress, signature }` | `{ token, provider, needsProfile? }` |

### Provider 自身

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/provider/me` | 返回当前 provider 信息 |
| `PUT` | `/provider/me` | 更新 name / description / website |

### 服务管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/provider/services` | 列出自己的服务 |
| `POST` | `/provider/services` | 创建服务（providerId 强制为当前用户） |
| `PUT` | `/provider/services/:id` | 更新（校验 ownership，非本人 → 403） |
| `DELETE` | `/provider/services/:id` | 删除（校验 ownership） |

### 数据查询

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/provider/requests` | 自己服务的请求记录；`?serviceId=&status=` |
| `GET` | `/provider/payments` | 自己服务的收款记录；`?serviceId=` |
| `GET` | `/provider/stats/summary` | 汇总指标（见下） |
| `GET` | `/provider/stats/timeseries` | 按日时间序列（见下） |

### 平台只读配置

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/provider/tokens` | Admin 已配置且 isActive=true 的 token 列表 |
| `GET` | `/provider/chains` | Admin 已配置的链列表 |

#### `/provider/stats/summary` 响应结构
```json
{
  "totalRevenue": "12.34",
  "monthRevenue": "3.21",
  "totalRequests": 1024,
  "settledRequests": 980,
  "successRate": 0.957
}
```

#### `/provider/stats/timeseries` 响应结构
```json
{
  "days": [
    { "date": "2026-03-24", "requests": 120, "settled": 115, "revenue": "1.23" },
    ...
  ]
}
```
查询参数：`?days=7`（默认 7，最大 30）

---

## Provider UI 页面

### 设计原则
- 与 admin-ui 保持一致：全量 inline styles，深色主题（#0d1117 背景，#111827 卡片），Recharts 图表
- 不引入新的 CSS 框架或 UI 库

### Login 页（`/login`）
- 平台 logo + "Provider Portal" 标题
- "Connect Wallet" 按钮（调用 window.ethereum）
- 连接后显示地址，点 "Sign in" 发起签名
- 签名中若 wallet 已注册 → 直接进 Dashboard；未注册 → 跳 Register

### Register 页（`/register`，仅首次）
- 显示已连接的钱包地址（不可修改）
- 表单字段：name（必填）、description（选填）、website（选填）
- 提交后跳 Dashboard

### Dashboard 页（`/`）

**上方 KPI 卡片（横排 4 个）**：
1. 总收入（DMHKD）
2. 本月收入
3. 总请求数
4. 结算成功率（%）

**中部图表（并排 2 个）**：
- 折线图：近 7 天每日请求量（蓝线）+ 结算成功量（绿线）
- 柱状图：近 7 天每日收入（金额）

**下方服务概览表格**：
| 服务名 | 路径 | 网络 | 价格 | 请求数 | 收入 | 最后调用 |
|--------|------|------|------|--------|------|----------|

### Services 页（`/services`）
- 与 admin-ui Services 页布局相同
- 只显示当前 provider 的服务
- 创建/编辑表单差异：
  - network 和 tokenId 从 `/provider/chains` / `/provider/tokens` 下拉选择
  - recipient 默认填入 walletAddress，可手动覆盖
  - 无 providerId 字段

### Requests 页（`/requests`）
表格列：时间 / 服务名 / 路径 / Agent 地址 / 状态徽章 / HTTP 状态
筛选器：服务下拉 + 状态下拉

### Payments 页（`/payments`）
表格列：时间 / 服务名 / 金额 / 状态徽章 / txHash（链接到区块浏览器）/ Agent 地址
筛选器：服务下拉

### Account 页（`/account`）
- 显示钱包地址（只读）
- 编辑 name / description / website
- "Disconnect" 按钮（清除 JWT，跳 Login）

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PROVIDER_JWT_SECRET` | JWT 签名密钥（生产必填） | 随机生成（每次重启失效） |
| `VITE_PROVIDER_API_BASE` | provider-ui 的 API 前缀 | `/provider` |

provider-ui 的 `.env` 中无需 `VITE_ADMIN_API_KEY`，完全隔离。

---

## 错误处理

| 场景 | 行为 |
|------|------|
| JWT 过期 | 前端检测 401，清除 localStorage，跳 Login |
| 操作他人服务（403） | 显示"无权限"提示，不跳页 |
| 签名验证失败（401） | Login 页显示"签名无效，请重试" |
| wallet 未安装 | Login 页提示"请安装 MetaMask 或兼容钱包" |

---

## 验证方案

1. **单元测试**：provider-auth 路由签名验证逻辑（mock viem `verifyMessage`）
2. **集成测试**：完整登录流程（nonce → sign → JWT → /provider/me）
3. **手动 E2E**：
   - 启动 `pnpm start`（后端）+ `cd packages/provider-ui && pnpm dev`（前端）
   - 用 MetaMask 连接钱包，完成注册，创建服务
   - 用现有 `/test` 页面发起支付，验证 Dashboard 数据更新
