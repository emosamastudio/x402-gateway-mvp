# Gateway Core API

**Base URL**: `http://localhost:8402`

The Gateway Core is the unified entry point for AI Agents. All registered services are routed to their backends via `gatewayPath` prefix matching.

---

## Health Check

### `GET /health`

No authentication required.

```json
{ "status": "ok" }
```

---

## Dynamic Route Proxy

### `[ANY METHOD] /{gatewayPath}/**`

All requests matching a registered service's `gatewayPath` prefix are intercepted and processed.

**Required Headers:**

| Header | Description | Required |
|--------|-------------|----------|
| `X-Agent-Address` | Agent's EVM address | **Yes** |
| `PAYMENT-SIGNATURE` | Base64-encoded PaymentPayload | Only for paid requests |

**Example — First Request (triggers 402):**

```bash
curl -v http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646"
```

---

## 402 Challenge Response

When an Agent requests a paid service without a `PAYMENT-SIGNATURE` header:

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

### PaymentRequirement Fields

| Field | Type | Description |
|-------|------|-------------|
| `network` | string | Chain slug (e.g., "optimism-sepolia") |
| `chainId` | number | EVM chain ID |
| `maxAmountRequired` | string | Minimum payment amount (smallest unit; "1000" with 6 decimals = 0.001 tokens) |
| `payTo` | string | Recipient address |
| `asset` | string | Token contract address |
| `assetSymbol` | string | Token symbol |
| `assetDecimals` | number | Token decimals |
| `domainSeparator` | string | EIP-712 Domain Separator (read from chain) |
| `domainName` | string | EIP-712 domain name |
| `domainVersion` | string | EIP-712 domain version |
| `maxTimeoutSeconds` | number | Maximum authorization validity (seconds) |

---

## PAYMENT-SIGNATURE Header Format

After constructing a payment signature based on the 402 response, the Agent includes it as the `PAYMENT-SIGNATURE` header on retry.

The header value is a Base64-encoded JSON `PaymentPayload`:

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

### PaymentPayload Fields

| Field | Type | Description |
|-------|------|-------------|
| `x402Version` | number | Protocol version (always 1) |
| `scheme` | string | Payment scheme (always "exact") |
| `network` | string | Chain slug (must match service config) |
| `payload.signature` | string | EIP-712 signature (65-byte hex) |
| `payload.authorization.from` | string | Payer address (Agent address) |
| `payload.authorization.to` | string | Recipient address |
| `payload.authorization.value` | string | Payment amount (smallest unit) |
| `payload.authorization.validAfter` | string | Valid from (Unix seconds, "0" = immediately) |
| `payload.authorization.validBefore` | string | Valid until (Unix seconds) |
| `payload.authorization.nonce` | string | Unique random nonce (bytes32 hex, replay protection) |

**Example Request:**

```bash
PAYMENT=$(echo -n '{"x402Version":1,"scheme":"exact","network":"optimism-sepolia","payload":{"signature":"0x...","authorization":{"from":"0x...","to":"0x...","value":"1000","validAfter":"0","validBefore":"1711613100","nonce":"0x..."}}}' | base64)

curl http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646" \
  -H "PAYMENT-SIGNATURE: $PAYMENT"
```

---

## Success Response

**Status:** 200 (or whatever 2xx the backend returns)

**Response Body:** Original backend API response

**Additional Response Headers:**

### `PAYMENT-RESPONSE`

Base64-encoded JSON with settlement information:

**Settlement succeeded:**
```json
{
  "txHash": "0x<transaction-hash>",
  "network": "optimism-sepolia"
}
```

**Settlement failed:**
```json
{
  "txHash": null,
  "network": "optimism-sepolia",
  "settlementError": "insufficient funds for gas"
}
```

---

## Error Responses

| HTTP Code | gatewayStatus | Description |
|-----------|---------------|-------------|
| `402` | `payment_required` | Payment needed (PaymentRequirement attached) |
| `402` | `payment_rejected` | Payment verification failed |
| `403` | `unauthorized` | Identity check failed |
| `404` | — | No matching service found |
| `502` | `proxy_error` | Backend unreachable |
| `504` | `proxy_error` | Backend timeout (10s) |

### 402 Payment Rejected Response

```json
{
  "error": "Payment verification failed",
  "details": "Signature recovery failed: invalid signature"
}
```

### 403 Unauthorized Response

```json
{
  "error": "Agent not registered on optimism-sepolia"
}
```

---

## Proxy Forwarding Rules

1. **Path stripping**: Removes `gatewayPath` prefix, appends remainder to `backendUrl`
   - Service: `gatewayPath=/echo`, `backendUrl=http://localhost:9999/echo`
   - Request: `GET /echo/test` → Backend: `GET http://localhost:9999/echo/test`

2. **Header filtering**: Only safe headers forwarded (`accept`, `content-type`, `user-agent`, etc.); x402-specific and hop-by-hop headers stripped

3. **API Key injection**: If service has `apiKey` configured, injects `Authorization: Bearer {apiKey}`

4. **Timeout**: 10 seconds (`AbortSignal.timeout(10_000)`)
