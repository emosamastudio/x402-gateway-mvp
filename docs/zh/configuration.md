# 环境配置 / Configuration

## 环境变量完整参考 / Complete Environment Variable Reference

所有配置通过 `.env` 文件或系统环境变量设置。

### 网关基础配置 / Gateway Base

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `CORE_PORT` | 网关 Core 服务端口 | `8402` | 否 |
| `ADMIN_PORT` | Admin API 服务端口 | `8403` | 否 |
| `ADMIN_API_KEY` | Admin API 认证 Bearer Token。留空则开发环境不需要认证 | — | 生产必填 |
| `DB_PATH` | SQLite 数据库文件路径 | `./gateway.db` | 否 |

### Facilitator 钱包 / Facilitator Wallet

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `FACILITATOR_PRIVATE_KEY` | Facilitator 的 EVM 私钥，用于广播 `transferWithAuthorization` 链上结算交易。此钱包需持有 ETH 以支付 gas 费用 | — | **是** |

> ⚠️ **安全提示**：Facilitator 私钥应严格保密。生产环境建议使用 KMS 或 Vault 管理。

### 链 RPC 配置 / Chain RPC

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `OPTIMISM_SEPOLIA_RPC` | Optimism Sepolia JSON-RPC URL | `https://sepolia.optimism.io` | 否 |
| `SEPOLIA_RPC` | Ethereum Sepolia JSON-RPC URL | `https://rpc.sepolia.org` | 否 |

> ⚠️ **重要**：这些环境变量**仅在首次创建数据库时**作为 seed 默认值写入 `chains` 表，随后自动同步到 `rpc_endpoints` 表。一旦数据库已存在，这些变量将被完全忽略。
>
> **推荐做法**：不在 `.env` 中配置 RPC，而是通过以下方式管理：
> - **Admin UI** → RPC Endpoints 页面：可视化添加、删除、排序 RPC 节点
> - **Admin API** → `POST /rpc-endpoints`：通过 API 动态添加
>
> 系统支持多 RPC 端点，具备健康检查、延迟监控、优先级排序和自动故障切换功能。

### 代币合约配置 / Token Contracts

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `OPTIMISM_SEPOLIA_DMHKD` | Optimism Sepolia 上的 DMHKD 代币合约地址 | `0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6` | 否 |
| `SEPOLIA_DMHKD` | Ethereum Sepolia 上的 DMHKD 代币合约地址 | `0x1aA90392c804343C7854DD700f50a48961B71c53` | 否 |

### EIP-712 域参数 / EIP-712 Domain Parameters

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME` | EIP-712 域名称（目前未使用，DS 直接从链上读取） | `DMHKD` | 否 |
| `OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION` | EIP-712 域版本 | `2` | 否 |
| `SEPOLIA_TOKEN_DOMAIN_NAME` | EIP-712 域名称 | `DMHKD` | 否 |
| `SEPOLIA_TOKEN_DOMAIN_VERSION` | EIP-712 域版本 | `2` | 否 |

> 📌 **注意**：`DOMAIN_SEPARATOR` 实际上直接从代币合约的 `DOMAIN_SEPARATOR()` 方法链上读取，这些环境变量目前仅作为配置存档。

### ERC-8004 身份合约 / ERC-8004 Identity Contracts

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `OPTIMISM_SEPOLIA_ERC8004_IDENTITY` | Optimism Sepolia 上的 ERC-8004 身份合约地址 | — | 否 |
| `SEPOLIA_ERC8004_IDENTITY` | Ethereum Sepolia 上的 ERC-8004 身份合约地址 | — | 否 |
| `ERC8004_MOCK` | 设为 `"true"` 跳过 ERC-8004 身份检查（仅开发环境） | — | 否 |

> 开发环境建议设置 `ERC8004_MOCK=true`，所有 Agent 将自动通过身份和信誉检查。

### 测试账户 / Test Accounts

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `TEST_AGENT_PRIVATE_KEY` | 测试 Agent 私钥（仅测试网使用） | — | 否 |
| `TEST_AGENT_ADDRESS` | 测试 Agent 地址 | — | 否 |
| `RECIPIENT_PRIVATE_KEY` | 收款方私钥 | — | 否 |
| `RECIPIENT_ADDRESS` | 收款方地址 | — | 否 |

> ⚠️ 这些测试账户仅用于测试网，切勿在主网使用！

### 前端环境变量 / Frontend Environment

| 变量 | 说明 | 默认值 | 必填 |
|------|------|--------|------|
| `VITE_ADMIN_API_KEY` | Admin UI 使用的 API Key（需与 `ADMIN_API_KEY` 一致） | — | 否 |

---

## .env 完整示例 / Complete .env Example

```dotenv
# ─── Gateway ───────────────────────────────
CORE_PORT=8402
ADMIN_PORT=8403
ADMIN_API_KEY=change-me-in-production
DB_PATH=./gateway.db

# ─── Facilitator ───────────────────────────
FACILITATOR_PRIVATE_KEY=0x<your-64-hex-chars>

# ─── Chain RPCs（仅首次建库 seed，推荐通过 Admin UI 管理）──
# OPTIMISM_SEPOLIA_RPC=https://opt-sepolia.g.alchemy.com/v2/<key>
# SEPOLIA_RPC=https://eth-sepolia.nodereal.io/v1/<key>

# ─── Token Contracts ──────────────────────
OPTIMISM_SEPOLIA_DMHKD=0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6
SEPOLIA_DMHKD=0x1aA90392c804343C7854DD700f50a48961B71c53

# ─── EIP-712 Domain ──────────────────────
OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME=DMHKD
OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION=2
SEPOLIA_TOKEN_DOMAIN_NAME=DMHKD
SEPOLIA_TOKEN_DOMAIN_VERSION=2

# ─── ERC-8004 Identity ───────────────────
OPTIMISM_SEPOLIA_ERC8004_IDENTITY=
SEPOLIA_ERC8004_IDENTITY=
ERC8004_MOCK=true

# ─── Test Accounts (testnet only!) ───────
TEST_AGENT_PRIVATE_KEY=0x<test-agent-key>
TEST_AGENT_ADDRESS=0x<test-agent-address>
RECIPIENT_PRIVATE_KEY=0x<recipient-key>
RECIPIENT_ADDRESS=0x<recipient-address>
```

## 安全建议 / Security Recommendations

### 生产环境 / Production

1. **`ADMIN_API_KEY`** — 使用强随机字符串（至少 32 字符）
2. **`FACILITATOR_PRIVATE_KEY`** — 使用专用钱包，最小化 ETH 余额，考虑使用 KMS
3. **`ERC8004_MOCK`** — 生产环境必须移除或设为 `false`
4. **`DB_PATH`** — 使用绝对路径，确保目录有正确权限
5. 移除所有 `TEST_*` 和 `RECIPIENT_*` 变量
6. RPC URL 使用带认证的服务（如 Alchemy、Infura）
