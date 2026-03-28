# AI Agent Integration Guide

This guide helps AI Agent developers interact with the gateway via the x402 protocol, including identity registration and payment authorization.

---

## Integration Overview

```
AI Agent                           x402 Gateway MVP                    Blockchain
  │                                    │                            │
  │ 1. GET /service (+ X-Agent-Address)│                            │
  │───────────────────────────────────>│                            │
  │                                    │── Verify ERC-8004 ───────>│
  │                                    │<─── isRegistered + rep ───│
  │ 2. 402 + PaymentRequirement        │                            │
  │<───────────────────────────────────│                            │
  │                                    │                            │
  │ 3. Sign EIP-3009 authorization     │                            │
  │                                    │                            │
  │ 4. Retry + PAYMENT-SIGNATURE       │                            │
  │───────────────────────────────────>│                            │
  │                                    │── verify + settle ───────>│
  │ 5. 200 + PAYMENT-RESPONSE          │                            │
  │<───────────────────────────────────│                            │
```

---

## Prerequisites

1. **EVM Wallet**: The Agent needs an EVM private key for signing EIP-712 TypedData
2. **On-chain Registration**: The Agent address must be registered in the ERC-8004 registry contract
3. **Token Balance**: The Agent address must hold the required ERC-20 tokens (e.g., DMHKD)
4. **Token Approval**: EIP-3009 does not require a separate `approve()` call

### Dependencies (TypeScript/JavaScript)

```bash
npm install viem
# or
pnpm add viem
```

---

## Step 1: Make a Request

Send a request to a registered service path on the gateway. The `X-Agent-Address` header is required:

```typescript
const GATEWAY_URL = "http://localhost:8402";
const agentAddress = "0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646";

const response = await fetch(`${GATEWAY_URL}/echo/test`, {
  headers: {
    "X-Agent-Address": agentAddress,
  },
});
```

**Possible Outcomes:**

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `402` | Payment required | Parse response, construct signature |
| `403` | Identity check failed | Check ERC-8004 registration or reputation |
| `200` | Success (free service) | Use response data |

---

## Step 2: Parse the 402 Response

```typescript
if (response.status === 402) {
  const body = await response.json();
  const requirement = body.paymentRequirements[0];

  console.log(`Network:   ${requirement.network}`);
  console.log(`Amount:    ${requirement.maxAmountRequired} (smallest unit)`);
  console.log(`Recipient: ${requirement.payTo}`);
  console.log(`Token:     ${requirement.assetSymbol} @ ${requirement.asset}`);
  console.log(`Domain:    ${requirement.domainName} v${requirement.domainVersion}`);
}
```

### Key PaymentRequirement Fields

| Field | Purpose |
|-------|---------|
| `maxAmountRequired` | Amount to pay (token's smallest unit) |
| `payTo` | Recipient address |
| `asset` | Token contract address (used for EIP-712 domain) |
| `domainName` | EIP-712 domain name |
| `domainVersion` | EIP-712 domain version |
| `chainId` | Chain ID |
| `maxTimeoutSeconds` | Max authorization validity |

---

## Step 3: Construct EIP-3009 Signature

Use viem's `signTypedData` to create a `TransferWithAuthorization` signature:

```typescript
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, parseUnits } from "viem";
import { optimismSepolia } from "viem/chains";

const AGENT_PRIVATE_KEY = "0x...your_private_key...";
const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY);

const walletClient = createWalletClient({
  account: agentAccount,
  chain: optimismSepolia,
  transport: http("https://sepolia.optimism.io"),
});

// Parameters from the 402 response
const requirement = body.paymentRequirements[0];
const now = Math.floor(Date.now() / 1000);
const nonce = `0x${Buffer.from(
  crypto.getRandomValues(new Uint8Array(32))
).toString("hex")}`;

const signature = await walletClient.signTypedData({
  domain: {
    name: requirement.domainName,        // "DMHKD"
    version: requirement.domainVersion,  // "2"
    chainId: requirement.chainId,        // 11155420
    verifyingContract: requirement.asset as `0x${string}`,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: agentAccount.address,
    to: requirement.payTo as `0x${string}`,
    value: BigInt(requirement.maxAmountRequired),
    validAfter: BigInt(0),
    validBefore: BigInt(now + requirement.maxTimeoutSeconds),
    nonce: nonce as `0x${string}`,
  },
});
```

### Important Notes

- **Nonce must be unique**: Use a fresh random 32-byte nonce for each signature. The gateway checks for nonce reuse.
- **validBefore**: Set to current time + `maxTimeoutSeconds` (typically 300 seconds)
- **value**: Use the value from `maxAmountRequired` (already in smallest unit)
- **domain**: Must exactly match the `domainName` and `domainVersion` from the 402 response

---

## Step 4: Construct PaymentPayload

```typescript
import type { PaymentPayload } from "@x402-gateway-mvp/shared";

const payload: PaymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: requirement.network,  // "optimism-sepolia"
  payload: {
    signature,
    authorization: {
      from: agentAccount.address,
      to: requirement.payTo,
      value: requirement.maxAmountRequired,
      validAfter: "0",
      validBefore: String(now + requirement.maxTimeoutSeconds),
      nonce,
    },
  },
};

// Base64 encode
const paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
```

---

## Step 5: Retry with Signature

```typescript
const paidResponse = await fetch(`${GATEWAY_URL}/echo/test`, {
  headers: {
    "X-Agent-Address": agentAccount.address,
    "PAYMENT-SIGNATURE": paymentHeader,
  },
});

if (paidResponse.ok) {
  // Get settlement info
  const paymentResponseHeader = paidResponse.headers.get("PAYMENT-RESPONSE");
  if (paymentResponseHeader) {
    const settlement = JSON.parse(
      Buffer.from(paymentResponseHeader, "base64").toString()
    );
    console.log(`Settlement TX: ${settlement.txHash}`);
    console.log(`Network: ${settlement.network}`);
  }

  // Get API response
  const data = await paidResponse.json();
  console.log("API Response:", data);
}
```

---

## Complete Example

A full end-to-end example is available in the project's `scripts/demo.ts`:

```bash
cd scripts
pnpm demo
```

The script automatically:
1. Generates a random Agent private key
2. Registers a demo service via Admin API
3. Makes an unpaid request (receives 402)
4. Constructs an EIP-3009 signature
5. Retries with signature (receives 200 + on-chain settlement)

---

## ERC-8004 Identity Registration

Agents must be registered on an ERC-8004 Identity Registry contract to pass gateway identity checks.

### Registry Contract Info

| Network | Contract Address |
|---------|-----------------|
| Optimism Sepolia | `ERC8004_REGISTRY_ADDRESS` (see .env) |
| Ethereum Sepolia | `SEPOLIA_ERC8004_REGISTRY_ADDRESS` (see .env) |

### Identity Verification Flow

```
Agent request → Gateway checks X-Agent-Address → Query cache
    ├─ Cache hit & fresh (5 min TTL) → Use cached data
    ├─ Cache miss → Query on-chain ERC-8004
    │   ├─ isRegistered = true → Check reputation
    │   │   ├─ reputation >= minReputation → Pass ✓
    │   │   └─ reputation < minReputation → 403 Reject ✗
    │   └─ isRegistered = false → 403 Reject ✗
    └─ Chain query failed → Use stale cache (if available) or 503
```

### Reputation Requirement

Each service can configure `minReputation` (default 0). The Agent's on-chain reputation must be >= this threshold.

---

## Error Handling Guide

| HTTP Status | Error Type | Recommended Action |
|-------------|------------|-------------------|
| `402` | Payment required | Parse `paymentRequirements`, sign and retry |
| `402` (with error) | Payment rejected | Check signature params, nonce reuse, token balance |
| `403` | Not registered | Register Agent on ERC-8004 contract |
| `403` | Insufficient reputation | Increase on-chain reputation |
| `502` | Backend unreachable | Retry later |
| `503` | Chain unavailable | Chain RPC failure, retry later |

---

## Python Agent Example

```python
import requests
import json
import base64
from eth_account import Account
from eth_account.messages import encode_typed_data

GATEWAY_URL = "http://localhost:8402"
AGENT_KEY = "0x..."  # Agent private key
agent = Account.from_key(AGENT_KEY)

# 1. Initial request
resp = requests.get(
    f"{GATEWAY_URL}/echo/test",
    headers={"X-Agent-Address": agent.address}
)

if resp.status_code == 402:
    req = resp.json()["paymentRequirements"][0]

    # 2. Construct EIP-712 signature (using eth-account signTypedData)
    # ... build domain, types, message ...

    # 3. Encode to base64
    payload = {
        "x402Version": 1,
        "scheme": "exact",
        "network": req["network"],
        "payload": {
            "signature": "0x...",
            "authorization": { ... }
        }
    }
    header = base64.b64encode(json.dumps(payload).encode()).decode()

    # 4. Retry
    resp2 = requests.get(
        f"{GATEWAY_URL}/echo/test",
        headers={
            "X-Agent-Address": agent.address,
            "PAYMENT-SIGNATURE": header
        }
    )
    print(resp2.json())
```

---

## FAQ

### Q: Do I need to persist the Agent private key?
Yes. The Agent private key is used to sign EIP-712 TypedData and must be stored securely. Use environment variables or a key management service.

### Q: Does every request need a new signature?
Yes. Each paid request requires a new signature with a unique nonce. The gateway checks nonces to prevent replay attacks.

### Q: Can I reuse a signature?
No. Each signature's nonce is unique and marked as used after processing.

### Q: What chains are supported?
Currently supported:
- Optimism Sepolia (chainId: 11155420)
- Ethereum Sepolia (chainId: 11155111)

### Q: How can I test without spending real money?
Use testnet tokens (e.g., DMHKD on Optimism Sepolia). You can also use the project's built-in PaymentTest page for testing.
