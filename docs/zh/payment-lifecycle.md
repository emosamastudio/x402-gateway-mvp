# 支付生命周期 / Payment Lifecycle

## 概述 / Overview

x402 网关使用**单记录生命周期模型**：每次 API 调用产生一条请求记录，随着处理阶段的推进不断更新。每条记录有 4 个生命周期时间戳，记录各阶段的完成时间。

The x402 gateway uses a **single-record lifecycle model**: each API call produces one request record that is updated as processing phases progress. Each record has 4 lifecycle timestamps recording when each phase completed.

---

## GatewayStatus 状态定义 / Status Definitions

共 10 种状态，分为三大类：

### 终止状态（请求已完成）/ Terminal States

| 状态 Status | HTTP Code | 说明 Description |
|-------------|-----------|-------------------|
| `success` | 200 | 请求成功，无需支付（免费路由/无支付头通过） |
| `settled` | 200 | 请求成功，链上结算已确认 |
| `settlement_failed` | 200 | 请求成功但结算交易失败（Agent 已收到响应） |

### 错误状态 / Error States

| 状态 Status | HTTP Code | 说明 Description |
|-------------|-----------|-------------------|
| `unauthorized` | 403 | 身份验证失败（缺少地址头/未注册/信誉不足） |
| `payment_rejected` | 402 | 支付无效（签名无效/金额不足/已过期/重放攻击） |
| `proxy_error` | 502/504 | 后端不可达或超时 |
| `backend_error` | varies | 后端返回非 2xx 状态码 |

### 中间状态（处理中）/ Intermediate States

| 状态 Status | 说明 Description |
|-------------|-------------------|
| `payment_required` | 402 质询已发送，等待 Agent 携带支付重试 |
| `verifying` | 支付签名已验证通过，正在代理到后端 |
| `settling` | 后端已返回 2xx，正在广播链上结算交易 |

---

## 完整状态机 / Complete State Machine

```
                        ┌──────────────┐
                        │   Request    │
                        │   Arrives    │
                        └──────┬───────┘
                               │
                    ┌──────────▼──────────┐
                    │  Identity Middleware │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                 失败 Fail             通过 Pass
                    │                     │
                    ▼                     ▼
            ┌──────────────┐    ┌─────────────────┐
            │ unauthorized │    │  x402 Middleware │
            │    (403)     │    └────────┬────────┘
            └──────────────┘             │
                              ┌──────────┴──────────┐
                              │                     │
                         无支付头               有支付头
                         No payment            Has payment
                              │                     │
                              ▼                     ▼
                    ┌──────────────────┐  ┌─────────────────┐
                    │ payment_required │  │  验证支付签名    │
                    │     (402)        │  │  Verify payment  │
                    └──────────────────┘  └────────┬────────┘
                              ▲                    │
                              │         ┌──────────┴──────────┐
                              │         │                     │
                              │      验证失败              验证成功
                              │      Failed                Passed
                              │         │                     │
                              │         ▼                     ▼
                              │  ┌────────────────┐  ┌──────────────┐
                              │  │payment_rejected│  │  verifying   │
                              │  │    (402)       │  └──────┬───────┘
                              │  └────────────────┘         │
                              │                    ┌────────▼────────┐
                              │                    │  Proxy to       │
                              │                    │  Backend        │
                              │                    └────────┬────────┘
                              │                             │
                              │              ┌──────────────┼──────────────┐
                              │              │              │              │
                              │           不可达          非 2xx          2xx
                              │          Unreachable     Non-2xx       Success
                              │              │              │              │
                              │              ▼              ▼              │
                              │      ┌─────────────┐ ┌──────────────┐     │
                              │      │ proxy_error │ │backend_error │     │
                              │      │  (502/504)  │ │   (varies)   │     │
                              │      └─────────────┘ └──────────────┘     │
                              │                                           │
                              │                                ┌──────────┴──────────┐
                              │                                │                     │
                              │                            无支付                有支付
                              │                            No payment           Has payment
                              │                                │                     │
                              │                                ▼                     ▼
                              │                        ┌──────────────┐     ┌──────────────┐
                              │                        │   success    │     │   settling   │
                              │                        │    (200)     │     └──────┬───────┘
                              │                        └──────────────┘            │
                              │                                         ┌──────────┴──────────┐
                              │                                         │                     │
                              │                                      成功 OK              失败 Fail
                              │                                         │                     │
                              │                                         ▼                     ▼
                              │                                 ┌──────────────┐  ┌────────────────────┐
                              │                                 │   settled    │  │ settlement_failed  │
                              │                                 │    (200)     │  │       (200)        │
                              │                                 └──────────────┘  └────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Agent 携带支付重试  │
                    │  Agent retries     │
                    │  with payment      │
                    └────────────────────┘
```

---

## 生命周期时间戳 / Lifecycle Timestamps

每条 `GatewayRequest` 记录包含 4 个时间戳字段（Unix 毫秒），值为 0 表示该阶段未到达：

| 字段 Field | 说明 Description | 设置时机 When Set |
|-----------|-------------------|-------------------|
| `challengeAt` | 402 质询发出时间 | x402 中间件返回 402 时 |
| `verifiedAt` | 支付签名验证通过时间 | x402 中间件验证通过时 |
| `proxyAt` | 后端响应（或代理错误）时间 | 收到后端响应 / 代理失败时 |
| `settledAt` | 链上结算完成（或失败）时间 | `settlePayment` 返回后 |

### 各状态的时间戳覆盖 / Timestamp Coverage by Status

| 状态 Status | challengeAt | verifiedAt | proxyAt | settledAt |
|-------------|:-----------:|:----------:|:-------:|:---------:|
| `unauthorized` | 0 | 0 | 0 | 0 |
| `payment_required` | ✓ | 0 | 0 | 0 |
| `payment_rejected` | ✓ | 0 | 0 | 0 |
| `verifying` | ✓ | ✓ | 0 | 0 |
| `proxy_error` | ✓ | ✓ | ✓ | 0 |
| `backend_error` | ✓ | ✓ | ✓ | 0 |
| `settling` | ✓ | ✓ | ✓ | 0 |
| `settled` | ✓ | ✓ | ✓ | ✓ |
| `settlement_failed` | ✓ | ✓ | ✓ | ✓ |
| `success` | 0 | 0 | ✓ | 0 |

> `success` 状态是无需支付的路径，只有 `proxyAt`。

---

## 请求记录关联 / Request Record Correlation

当 Agent 第一次请求时（无支付头），网关创建一条 `payment_required` 记录。Agent 携带支付头重试时，网关通过以下条件查找并关联到同一条记录：

When the Agent first requests (no payment header), the gateway creates a `payment_required` record. When the Agent retries with a payment header, the gateway correlates to the same record using:

1. **相同 `serviceId`** — 同一个服务
2. **相同 `agentAddress`** — 同一个 Agent
3. **状态为 `payment_required`** — 还在等待支付
4. **创建时间在 5 分钟内** — 防止关联到过期的旧记录

SQL 查询（`findPendingRequest`）：
```sql
SELECT * FROM requests
WHERE service_id = ? AND agent_address = ?
  AND gateway_status = 'payment_required'
  AND created_at > (now - 300000)
ORDER BY created_at DESC
LIMIT 1
```

如果找不到匹配的记录（如超过 5 分钟窗口），则创建一条新记录。

---

## 前端生命周期展示 / Frontend Lifecycle Display

Admin UI 的请求记录页面展示：

### 统计面板 / Stats Panel
- **完成率**：`(settled + success) / total × 100%`
- **进行中**：`payment_required + verifying + settling` 状态的记录数
- **失败**：`unauthorized + payment_rejected + proxy_error + backend_error + settlement_failed` 的记录数

### 过滤标签 / Filter Tabs
- **全部** — 所有记录
- **已完成** — `settled` + `success`
- **进行中** — `payment_required` + `verifying` + `settling`
- **失败** — `unauthorized` + `payment_rejected` + `proxy_error` + `backend_error` + `settlement_failed`

### 生命周期时间轴 / Lifecycle Timeline
每条记录展开后显示 4 阶段可视化时间轴：

```
  📋 质询    →    🔍 验证    →    🔀 代理    →    💰 结算
  14:23:01       14:23:04       14:23:05       14:23:08
                   3s              1s              3s
```

- 到达的阶段显示时间戳和图标
- 阶段之间显示耗时
- 未到达的阶段显示为灰色占位

---

## Payment 记录 / Payment Record

结算完成后（无论成功或失败），网关还会创建一条 `Payment` 记录：

| 字段 Field | 说明 Description |
|-----------|-------------------|
| `id` | `pay_<uuid>` |
| `requestId` | 关联的请求记录 ID |
| `serviceId` | 服务 ID |
| `agentAddress` | Agent 地址 |
| `txHash` | 链上交易哈希（失败时可能为空） |
| `network` | 链标识 |
| `amount` | 支付金额（人类可读格式，如 "0.001"） |
| `status` | `"settled"` 或 `"failed"` |
| `settlementError` | 失败时的错误信息 |
| `createdAt` | 创建时间 |
