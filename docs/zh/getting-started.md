# 快速入门 / Getting Started

## 前置条件 / Prerequisites

- **Node.js** >= 18
- **pnpm** >= 10 (`npm install -g pnpm`)
- **Git**

## 安装 / Installation

```bash
# 克隆仓库
git clone <repository-url> x402-gateway-mvp
cd x402-gateway-mvp

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

## 环境配置 / Environment Setup

复制示例环境文件并根据需要修改：

```bash
cp .env.example .env
# 或直接创建 .env
```

最小配置（开发环境）：

```dotenv
# Gateway ports
CORE_PORT=8402
ADMIN_PORT=8403

# Admin API key (留空则 dev 环境无需认证)
ADMIN_API_KEY=change-me-in-production

# Database
DB_PATH=./gateway.db

# Facilitator 私钥 (用于广播结算交易，测试网用)
FACILITATOR_PRIVATE_KEY=0x<your-private-key>

# Chain RPCs (仅首次建库时作为 seed 默认值，之后通过 Admin UI 管理)
# OPTIMISM_SEPOLIA_RPC=https://sepolia.optimism.io
# SEPOLIA_RPC=https://rpc.sepolia.org

# DMHKD 代币合约地址
OPTIMISM_SEPOLIA_DMHKD=0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6
SEPOLIA_DMHKD=0x1aA90392c804343C7854DD700f50a48961B71c53

# EIP-712 Domain
OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME=DMHKD
OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION=2

# 开发环境：跳过 ERC-8004 身份检查
ERC8004_MOCK=true
```

> 完整的环境变量说明见 [环境配置](configuration.md)。

## 启动服务 / Starting the Server

### 开发模式

```bash
# 启动所有服务 (Core + Admin API + Admin UI)
pnpm dev
```

这会并行启动：
- **Gateway Core** — `http://localhost:8402`
- **Admin API** — `http://localhost:8403`
- **Admin UI** — `http://localhost:5173`

### 生产模式

```bash
# 先构建
pnpm build

# 启动 (Core + Admin API)
pnpm start
# 或
set -a && source .env && set +a && npx tsx start.ts
```

## 创建第一个服务 / Create Your First Service

### 1. 启动测试后端

```bash
# 启动 echo 测试服务器 (端口 9999)
npx tsx scripts/echo-server.ts &
```

### 2. 通过 Admin UI 创建

1. 打开 `http://localhost:5173`
2. 先在 **服务提供商** 页面创建一个 Provider
3. 在 **服务管理** 页面点击 "新建服务"
4. 填写：
   - 名称：`Echo Service`
   - 网关路径：`/echo`
   - 后端 URL：`http://localhost:9999/echo`
   - 价格：`0.001`
   - 选择网络和代币

### 3. 或通过 API 创建

```bash
# 创建 Provider
curl -X POST http://localhost:8403/providers \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Provider",
    "walletAddress": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c"
  }'

# 创建 Service (使用返回的 Provider ID)
curl -X POST http://localhost:8403/services \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Echo Service",
    "providerId": "<provider-id>",
    "gatewayPath": "/echo",
    "backendUrl": "http://localhost:9999/echo",
    "priceAmount": "0.001",
    "network": "optimism-sepolia",
    "tokenId": "dmhkd-optimism-sepolia",
    "recipient": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c"
  }'
```

## 测试付费 API 调用 / Test a Paid API Call

### 使用 Admin UI 的 PaymentTest 页面

1. 打开 `http://localhost:5173/test`
2. 选择已创建的服务
3. 配置测试参数（Agent 私钥已预设为环境变量中的测试账户）
4. 点击 "发送请求" 执行完整的 402 → 签名 → 200 流程

### 使用 demo 脚本

```bash
set -a && source .env && set +a
npx tsx scripts/demo.ts
```

demo 脚本会自动：
1. 通过 Admin API 注册 echo 后端服务
2. 发送不带支付的请求（收到 402 + PaymentRequirement）
3. 构造 EIP-712 签名
4. 带支付头重新请求（收到 200 + 后端响应 + PAYMENT-RESPONSE 头里的 txHash）

### 使用 curl 手动测试

```bash
# Step 1: 发送请求，收到 402
curl -v http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646"

# 响应: 402 Payment Required
# Body: { "paymentRequirements": [{ ... }] }
```

## 查看请求记录 / View Request Logs

打开 Admin UI 的 **请求记录** 页面（`http://localhost:5173/requests`）可以查看：

- 所有请求的生命周期状态
- 成功率统计
- 按状态过滤（已完成 / 进行中 / 失败）
- 每个请求的生命周期时间轴（质询 → 验证 → 代理 → 结算）

## 下一步 / Next Steps

- [环境配置](configuration.md) — 了解所有配置选项
- [支付生命周期](payment-lifecycle.md) — 深入理解支付流程
- [Agent 集成指南](agent-integration.md) — 如何编程接入付费 API
- [管理 API 参考](api-reference.md) — 完整的 Admin API 文档
- [部署指南](deployment.md) — 生产环境部署建议
