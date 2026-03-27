# x402 Payment Gateway

一个基于 HTTP 402 协议的按需付费 API 网关，使用 DMHKD 代币（ERC-20 / EIP-3009）在 Optimism Sepolia 或 Ethereum Sepolia 测试网上完成链上结算。

---

## 架构概览

```
Agent (调用方)
    │
    ▼
Gateway Core :8402          ← 统一入口，路由所有 API 请求
    ├── 身份验证 (ERC-8004)
    ├── 收款验证 (EIP-712 签名)
    └── 代理转发 → Backend API
          ↓ 成功后
    Facilitator             ← 广播 transferWithAuthorization 上链
          ↓
    DMHKD 合约 (链上结算)

Admin API  :8403            ← 注册/管理 API 服务
Admin UI   :5173            ← 可视化管理界面
```

---

## 快速开始

### 1. 环境配置

```bash
cp .env.example .env
```

编辑 `.env`，至少填写：

```env
FACILITATOR_PRIVATE_KEY=0x你的私钥    # 负责广播结算交易的钱包
```

其余默认值已填好（RPC 端点、合约地址、Domain 参数）。

### 2. 安装依赖 & 构建

```bash
pnpm install
pnpm build
```

### 3. 启动服务

```bash
# 终端 1：启动 Gateway Core + Admin API
pnpm dev

# 终端 2：启动 Admin UI（可选）
cd packages/admin-ui && pnpm dev
```

服务启动后：
- Gateway：`http://localhost:8402`
- Admin API：`http://localhost:8403`
- Admin UI：`http://localhost:5173`

---

## 注册一个 API 服务

通过 Admin API 将后端服务接入网关：

```bash
curl -X POST http://localhost:8403/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weather API",
    "backendUrl": "https://your-backend.com/api",
    "priceAmount": "0.001",
    "network": "optimism-sepolia",
    "recipient": "0x你的收款钱包地址",
    "minReputation": 0
  }'
```

| 字段 | 说明 |
|------|------|
| `backendUrl` | 实际后端地址，网关收到请求后代理转发到此处 |
| `priceAmount` | 每次请求收费金额（DMHKD，如 `"0.001"` = 1000 最小单位） |
| `network` | `"optimism-sepolia"` 或 `"sepolia"` |
| `recipient` | 收款方钱包地址（每次结算后 DMHKD 转入此地址） |
| `minReputation` | 最低信誉分要求，0 = 不限制 |

---

## 用户访问流程

### 整体步骤

```
1. 无头发起请求 → 收到 402 + 支付要求
2. 构造 EIP-712 签名
3. 携带签名重发请求 → 收到 200 + 响应内容
```

---

### 第一步：发起请求，获取支付要求

```bash
curl http://localhost:8402/api/weather
```

响应 **402 Payment Required**：

```json
{
  "error": "Payment Required",
  "requirement": {
    "network": "optimism-sepolia",
    "maxAmountRequired": "1000",
    "payTo": "0x收款方地址",
    "asset": "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
    "maxTimeoutSeconds": 300,
    "resource": "http://localhost:8402/api/weather",
    "description": "Access to Weather API"
  }
}
```

关键字段：
- `payTo`：转账收款地址
- `asset`：DMHKD 合约地址
- `maxAmountRequired`：需支付的最小金额（最小单位，6位小数）
- `maxTimeoutSeconds`：签名有效窗口（300秒）

---

### 第二步：构造 EIP-712 签名

用你的以太坊钱包对 `TransferWithAuthorization` 结构签名：

```typescript
import { createWalletClient, http, parseUnits } from "viem";
import { optimismSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0x你的私钥");
const client = createWalletClient({
  account,
  chain: optimismSepolia,
  transport: http("https://opt-sepolia.g.alchemy.com/v2/..."),
});

const now = Math.floor(Date.now() / 1000);
const nonce = `0x${crypto.getRandomValues(new Uint8Array(32)).reduce(
  (hex, b) => hex + b.toString(16).padStart(2, "0"), ""
)}`;

const signature = await client.signTypedData({
  domain: {
    name: "DMHKD",               // DMHKD 合约的 EIP-712 domain name
    version: "2",
    chainId: 11155420,           // Optimism Sepolia
    verifyingContract: "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
  },
  types: {
    TransferWithAuthorization: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: account.address,
    to: "0x收款方地址",          // requirement.payTo
    value: parseUnits("0.001", 6), // = 1000n（最小单位）
    validAfter: 0n,
    validBefore: BigInt(now + 300),
    nonce: nonce as `0x${string}`,
  },
});
```

**网络参数速查：**

| 字段 | Optimism Sepolia | Ethereum Sepolia |
|------|---------|-----------|-------------|
| Optimism Sepolia | 11155420 | `0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6` | `"DMHKD"` | `"2"` |
| Ethereum Sepolia | 11155111 | `0x1aA90392c804343C7854DD700f50a48961B71c53` | `"DMHKD coin"` | `"2"` |

---

### 第三步：构造支付 Header 并重发请求

将签名和授权信息打包成 JSON，base64 编码后放入 `PAYMENT-SIGNATURE` 请求头：

```typescript
const payload = {
  x402Version: 1,
  scheme: "exact",
  network: "optimism-sepolia",
  payload: {
    signature,
    authorization: {
      from: account.address,
      to: "0x收款方地址",
      value: "1000",          // 字符串形式的最小单位金额
      validAfter: "0",
      validBefore: String(now + 300),
      nonce,
    },
  },
};

const paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");

const response = await fetch("http://localhost:8402/api/weather", {
  headers: {
    "PAYMENT-SIGNATURE": paymentHeader,
  },
});
```

---

### 第四步：收到响应 & 确认结算

成功时响应状态 **200**，并附带结算凭证：

```typescript
const settlementHeader = response.headers.get("PAYMENT-RESPONSE");
if (settlementHeader) {
  const { txHash } = JSON.parse(
    Buffer.from(settlementHeader, "base64").toString()
  );
  console.log("链上结算 TxHash:", txHash);
}

const data = await response.json();
// data 即为原始后端 API 的响应内容
```

---

## 错误处理

| 状态码 | 原因 | 处理方式 |
|--------|------|----------|
| `402` + `"Payment Required"` | 未携带签名 | 按流程构造签名重发 |
| `402` + `"Payment expired"` | 签名超时（>300秒） | 重新签名 |
| `402` + `"Payment amount too low"` | 金额不足 | 提高 `value` |
| `402` + `"Invalid payment signature"` | 签名错误 | 检查 domain 参数和私钥 |
| `402` + `"Payment recipient mismatch"` | `to` 地址不对 | 使用 `requirement.payTo` |
| `402` + `"Payment nonce already used"` | nonce 重放 | 生成新 nonce |
| `404` | 路径未注册 | 确认服务已注册 |

---

## Admin API 接口

Base URL: `http://localhost:8403`

### 服务管理

```
POST   /services          注册新服务
GET    /services          列出所有服务
GET    /services/:id      查询单个服务
```

### 支付记录

```
GET    /payments          列出所有支付记录
```

### Agent 查询

```
GET    /agents?address=0x...&network=optimism-sepolia   查询 Agent 信誉
```

### 健康检查

```
GET    /health            (Admin API)
GET    http://localhost:8402/health    (Gateway Core)
```

---

## 运行测试

```bash
pnpm test        # 运行所有单元测试（25个）
pnpm demo        # 运行端到端演示（需要配置私钥和 DMHKD 余额）
```

---

## 目录结构

```
packages/
├── shared/       类型定义、Schema、工具函数
├── chain/        链配置、合约地址、viem 客户端
├── facilitator/  支付验证 & 链上结算
├── core/         Gateway 主服务（:8402）
├── admin-api/    管理 API（:8403）
└── admin-ui/     React 管理界面（:5173）
scripts/
└── demo.ts       端到端演示脚本
```
