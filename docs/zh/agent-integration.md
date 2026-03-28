# AI Agent 集成指南

本指南帮助 AI Agent 开发者通过 x402 协议与网关交互，完成身份注册与支付授权。

---

## 集成概述

```
AI Agent                           x402 Gateway MVP                    区块链
  │                                    │                            │
  │ 1. GET /service (+ X-Agent-Address)│                            │
  │───────────────────────────────────>│                            │
  │                                    │── 验证 ERC-8004 身份 ────>│
  │                                    │<─── isRegistered + 声誉 ──│
  │ 2. 402 + PaymentRequirement        │                            │
  │<───────────────────────────────────│                            │
  │                                    │                            │
  │ 3. 签名 EIP-3009 授权              │                            │
  │                                    │                            │
  │ 4. 重试 + PAYMENT-SIGNATURE        │                            │
  │───────────────────────────────────>│                            │
  │                                    │── verify + settle ───────>│
  │ 5. 200 + PAYMENT-RESPONSE          │                            │
  │<───────────────────────────────────│                            │
```

---

## 前置要求

1. **EVM 钱包**：Agent 需要一个 EVM 私钥（用于签名 EIP-712 TypedData）
2. **链上注册**：Agent 地址需要在 ERC-8004 注册合约中注册
3. **代币余额**：Agent 地址需持有服务要求的 ERC-20 代币（如 DMHKD）
4. **无需代币授权**：EIP-3009 使用链下签名授权，不需要调用 `approve()`

### 依赖库（TypeScript/JavaScript）

```bash
npm install viem
# 或
pnpm add viem
```

---

## 步骤一：发起请求

对网关的注册服务路径发起请求，必须携带 `X-Agent-Address` 头：

```typescript
const GATEWAY_URL = "http://localhost:8402";
const agentAddress = "0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646";

const response = await fetch(`${GATEWAY_URL}/echo/test`, {
  headers: {
    "X-Agent-Address": agentAddress,
  },
});
```

**可能的结果：**

| 状态码 | 含义 | 下一步 |
|--------|------|--------|
| `402` | 需要支付 | 解析响应，构造签名 |
| `403` | 身份验证失败 | 检查 ERC-8004 注册状态或声誉 |
| `200` | 成功（免费服务） | 使用响应数据 |

---

## 步骤二：解析 402 响应

```typescript
if (response.status === 402) {
  const body = await response.json();
  const requirement = body.paymentRequirements[0];

  console.log(`Network:  ${requirement.network}`);
  console.log(`Amount:   ${requirement.maxAmountRequired} (最小单位)`);
  console.log(`Recipient: ${requirement.payTo}`);
  console.log(`Token:    ${requirement.assetSymbol} @ ${requirement.asset}`);
  console.log(`Domain:   ${requirement.domainName} v${requirement.domainVersion}`);
}
```

### PaymentRequirement 关键字段一览

| 字段 | 用途 |
|------|------|
| `maxAmountRequired` | 需支付金额（代币最小单位） |
| `payTo` | 收款地址 |
| `asset` | 代币合约地址（用于 EIP-712 domain） |
| `domainName` | EIP-712 域名称 |
| `domainVersion` | EIP-712 域版本 |
| `chainId` | 链 ID |
| `maxTimeoutSeconds` | 授权最大有效期 |

---

## 步骤三：构造 EIP-3009 签名

使用 `viem` 的 `signTypedData` 构造 `TransferWithAuthorization` 签名：

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

// 从 402 响应中获取的参数
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

### 重要注意事项

- **nonce 必须唯一**：每次签名使用新的随机 32 字节 nonce，网关会检查 nonce 是否已用过
- **validBefore**：设置为当前时间 + `maxTimeoutSeconds`（通常 300 秒）
- **value**：使用 `maxAmountRequired` 中的值（已经是最小单位）
- **domain**：必须与 402 返回的 `domainName`、`domainVersion` 完全一致

---

## 步骤四：构造 PaymentPayload

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

// Base64 编码
const paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
```

---

## 步骤五：携带签名重试

```typescript
const paidResponse = await fetch(`${GATEWAY_URL}/echo/test`, {
  headers: {
    "X-Agent-Address": agentAccount.address,
    "PAYMENT-SIGNATURE": paymentHeader,
  },
});

if (paidResponse.ok) {
  // 获取结算信息
  const paymentResponseHeader = paidResponse.headers.get("PAYMENT-RESPONSE");
  if (paymentResponseHeader) {
    const settlement = JSON.parse(
      Buffer.from(paymentResponseHeader, "base64").toString()
    );
    console.log(`Settlement TX: ${settlement.txHash}`);
    console.log(`Network: ${settlement.network}`);
  }

  // 获取 API 响应
  const data = await paidResponse.json();
  console.log("API Response:", data);
}
```

---

## 完整示例

完整的端到端示例可参考项目中的 `scripts/demo.ts`：

```bash
cd scripts
pnpm demo
```

该脚本自动执行以下步骤：
1. 生成随机 Agent 私钥
2. 通过 Admin API 注册 Demo 服务
3. 无支付访问（收到 402）
4. 构造 EIP-3009 签名
5. 携带签名重试（收到 200 + 链上结算信息）

---

## ERC-8004 身份注册

Agent 必须在 ERC-8004 Identity Registry 合约上注册才能通过网关身份验证。

### 注册合约信息

| 网络 | 合约地址 |
|------|----------|
| Optimism Sepolia | `ERC8004_REGISTRY_ADDRESS`（见 .env） |
| Ethereum Sepolia | `SEPOLIA_ERC8004_REGISTRY_ADDRESS`（见 .env） |

### 身份验证流程

```
Agent 请求 → 网关检查 X-Agent-Address → 查询缓存
    ├─ 缓存命中且未过期（5分钟）→ 使用缓存数据
    ├─ 缓存未命中 → 查询链上 ERC-8004
    │   ├─ isRegistered = true → 检查声誉
    │   │   ├─ reputation >= minReputation → 通过 ✓
    │   │   └─ reputation < minReputation → 403 拒绝 ✗
    │   └─ isRegistered = false → 403 拒绝 ✗
    └─ 链上查询失败 → 使用过期缓存（若有）或 503
```

### 声誉要求

每个服务可配置 `minReputation`（默认 0）。Agent 的链上声誉值必须 >= 此阈值。

---

## 错误处理指南

| HTTP Status | 错误类型 | 建议处理方式 |
|-------------|----------|-------------|
| `402` | 需要支付 | 解析 `paymentRequirements`，构造签名重试 |
| `402` (带 error) | 支付被拒 | 检查签名参数、nonce 是否重复、余额是否充足 |
| `403` | 未注册 | 在 ERC-8004 合约上注册 Agent |
| `403` | 声誉不足 | 提升链上声誉值 |
| `502` | 后端不可达 | 稍后重试 |
| `503` | 链不可用 | 链 RPC 故障，稍后重试 |

---

## Python Agent 示例

```python
import requests
import json
import base64
from eth_account import Account
from eth_account.messages import encode_typed_data

GATEWAY_URL = "http://localhost:8402"
AGENT_KEY = "0x..."  # Agent 私钥
agent = Account.from_key(AGENT_KEY)

# 1. 首次请求
resp = requests.get(
    f"{GATEWAY_URL}/echo/test",
    headers={"X-Agent-Address": agent.address}
)

if resp.status_code == 402:
    req = resp.json()["paymentRequirements"][0]

    # 2. 构造 EIP-712 签名（需使用 eth-account 的 signTypedData）
    # ... 构造 domain, types, message ...

    # 3. 编码为 base64
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

    # 4. 重试
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

## 常见问题 (FAQ)

### Q: Agent 私钥需要保存吗？
是的。Agent 私钥用于签名 EIP-712 TypedData，必须安全存储。建议使用环境变量或密钥管理服务。

### Q: 每次请求都需要签名吗？
是的。每次支付请求需要新的签名（新的 nonce）。网关会检查 nonce 防止重放。

### Q: 可以一次签名多次使用吗？
不可以。每个签名的 nonce 是唯一的，使用后会被标记为已用。

### Q: 支持哪些链？
目前支持：
- Optimism Sepolia（chainId: 11155420）
- Ethereum Sepolia（chainId: 11155111）

### Q: 如何测试但不花真钱？
使用测试网代币（如 DMHKD on Optimism Sepolia）。可通过项目自带的 PaymentTest 页面测试。
