# 网关 Core API / Gateway Core API

**Base URL**: `http://localhost:8402`

网关 Core 是面向 AI Agent 的统一入口。所有注册的服务通过 `gatewayPath` 路由到对应的后端。

---

## 健康检查 / Health Check

### `GET /health`

无需任何认证。

```json
{ "status": "ok" }
```

---

## 动态路由代理 / Dynamic Route Proxy

### `[ANY METHOD] /{gatewayPath}/**`

所有匹配已注册服务的 `gatewayPath` 前缀的请求都会被拦截处理。

**必要请求头 / Required Headers:**

| Header | 说明 | 必填 |
|--------|------|------|
| `X-Agent-Address` | Agent 的 EVM 地址 | **是** |
| `PAYMENT-SIGNATURE` | Base64 编码的 PaymentPayload | 仅支付请求 |

**示例 — 首次请求（触发 402）：**

```bash
curl -v http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646"
```

---

## 402 质询响应 / 402 Challenge Response

当 Agent 请求需要支付的服务但未携带 `PAYMENT-SIGNATURE` 头时：

**Status:** `402 Payment Required`

**Response Body:**

```json
{
  "paymentRequirements": [
    {
      "network": "optimism-sepolia",
      "chainId": 11155420,
      "maxAmountRequired": "1000",
      "payTo": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c",
      "asset": "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
      "assetSymbol": "DMHKD",
      "assetDecimals": 6,
      "domainSeparator": "0x...",
      "domainName": "DMHKD",
      "domainVersion": "2",
      "maxTimeoutSeconds": 300
    }
  ],
  "error": "Payment required"
}
```

### PaymentRequirement 字段说明

| 字段 Field | 类型 Type | 说明 Description |
|-----------|-----------|-------------------|
| `network` | string | 链标识（如 "optimism-sepolia"） |
| `chainId` | number | EVM chain ID |
| `maxAmountRequired` | string | 最小支付金额（最小单位，如 6 位小数的 "1000" = 0.001 代币） |
| `payTo` | string | 收款地址 |
| `asset` | string | 代币合约地址 |
| `assetSymbol` | string | 代币符号 |
| `assetDecimals` | number | 代币精度 |
| `domainSeparator` | string | EIP-712 Domain Separator（从链上读取） |
| `domainName` | string | EIP-712 域名称 |
| `domainVersion` | string | EIP-712 域版本 |
| `maxTimeoutSeconds` | number | 授权最大有效期（秒） |

---

## PAYMENT-SIGNATURE 请求头格式 / Payment Signature Header Format

Agent 根据 402 返回的信息构造支付签名后，将其作为 `PAYMENT-SIGNATURE` 头携带重试请求。

头的值是 Base64 编码的 JSON `PaymentPayload`：

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "optimism-sepolia",
  "payload": {
    "signature": "0x<65-byte-hex-signature>",
    "authorization": {
      "from": "0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646",
      "to": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c",
      "value": "1000",
      "validAfter": "0",
      "validBefore": "1711613100",
      "nonce": "0x<random-32-bytes>"
    }
  }
}
```

### PaymentPayload 字段说明

| 字段 Field | 类型 Type | 说明 Description |
|-----------|-----------|-------------------|
| `x402Version` | number | 协议版本（固定为 1） |
| `scheme` | string | 支付方案（固定为 "exact"） |
| `network` | string | 链标识（必须与服务配置一致） |
| `payload.signature` | string | EIP-712 签名（65 字节 hex） |
| `payload.authorization.from` | string | 付款方地址（Agent 地址） |
| `payload.authorization.to` | string | 收款方地址 |
| `payload.authorization.value` | string | 支付金额（最小单位） |
| `payload.authorization.validAfter` | string | 有效起始时间（Unix 秒，"0" = 立即生效） |
| `payload.authorization.validBefore` | string | 有效截止时间（Unix 秒） |
| `payload.authorization.nonce` | string | 唯一随机数（bytes32 hex，防重放） |

**请求示例 / Example Request:**

```bash
PAYMENT=$(echo -n '{"x402Version":1,"scheme":"exact","network":"optimism-sepolia","payload":{"signature":"0x...","authorization":{"from":"0x...","to":"0x...","value":"1000","validAfter":"0","validBefore":"1711613100","nonce":"0x..."}}}' | base64)

curl http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646" \
  -H "PAYMENT-SIGNATURE: $PAYMENT"
```

---

## 成功响应 / Success Response

**Status:** 200（或后端返回的其他 2xx 状态码）

**Response Body:** 后端 API 的原始响应

**附加响应头 / Additional Response Headers:**

### `PAYMENT-RESPONSE`

Base64 编码的 JSON，包含结算信息：

**结算成功：**
```json
{
  "txHash": "0x<transaction-hash>",
  "network": "optimism-sepolia"
}
```

**结算失败：**
```json
{
  "txHash": null,
  "network": "optimism-sepolia",
  "settlementError": "insufficient funds for gas"
}
```

---

## 错误响应 / Error Responses

| HTTP Code | gatewayStatus | 说明 |
|-----------|---------------|------|
| `402` | `payment_required` | 需要支付（附带 PaymentRequirement） |
| `402` | `payment_rejected` | 支付验证失败 |
| `403` | `unauthorized` | 身份验证失败 |
| `404` | — | 未找到匹配的服务 |
| `502` | `proxy_error` | 后端不可达 |
| `504` | `proxy_error` | 后端超时（10 秒） |

### 402 支付被拒时的响应

```json
{
  "error": "Payment verification failed",
  "details": "Signature recovery failed: invalid signature"
}
```

### 403 未授权的响应

```json
{
  "error": "Agent not registered on optimism-sepolia"
}
```

---

## 代理转发规则 / Proxy Forwarding Rules

1. **路径剥离**：去除 `gatewayPath` 前缀后追加到 `backendUrl`
   - 服务：`gatewayPath=/echo`, `backendUrl=http://localhost:9999/echo`
   - 请求：`GET /echo/test` → 后端：`GET http://localhost:9999/echo/test`

2. **头过滤**：只转发安全头（`accept`, `content-type`, `user-agent` 等），剥离 `x402-*` 和跳跃式头

3. **API Key 注入**：如果服务配置了 `apiKey`，自动注入 `Authorization: Bearer {apiKey}`

4. **超时**：10 秒（`AbortSignal.timeout(10_000)`）
