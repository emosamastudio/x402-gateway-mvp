# 管理界面指南 / Admin UI Guide

Admin UI 是基于 React 的网关管理仪表板，提供可视化的服务管理、请求监控和支付查询功能。

**默认地址**: `http://localhost:5173`（Vite 开发服务器）

---

## 技术架构

| 组件 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 |
| 样式 | 内联 CSS（暗色主题） |
| 路由 | React Router |
| 状态 | useState + useEffect（无外部状态库） |
| 数据获取 | fetch API → Admin API (:8403) |

### 环境变量

```env
VITE_API_BASE_URL=http://localhost:8403   # Admin API 地址
```

---

## 侧边栏导航

```
┌──────────────────┐
│  x402 Gateway MVP    │  ← Logo
├──────────────────┤
│  Services        │  ← 服务管理
│  Providers       │  ← 提供商管理
│  Chains          │  ← 链配置
│  Tokens          │  ← 代币配置
│  RPC Endpoints   │  ← RPC 管理
│  Agents          │  ← Agent 缓存
│  Requests        │  ← 请求记录
│  Payments        │  ← 支付记录
│  Payment Test    │  ← 支付测试
└──────────────────┘
```

---

## 页面详解

### Services（服务管理）

**路径**: `/`

功能：
- **列表视图**：显示所有注册的 API 服务
- **创建服务**：通过表单创建新服务
- **编辑服务**：修改服务配置
- **删除服务**：删除不需要的服务

表单字段：
| 字段 | 说明 | 示例 |
|------|------|------|
| Name | 服务名称 | "Echo API" |
| Gateway Path | 网关路径前缀 | "/echo" |
| Backend URL | 后端 API 地址 | "http://localhost:9999/echo" |
| Provider | 服务提供商（下拉选择） | "Acme Services" |
| Network | 支付链（下拉选择） | "optimism-sepolia" |
| Token | 支付代币（下拉选择） | "DMHKD" |
| Price | 单次调用价格 | "0.001" |
| Recipient | 收款地址 | "0x..." |
| API Key | 后端 API Key（可选） | |
| Min Reputation | 最低声誉要求 | 0 |

---

### Providers（提供商管理）

**路径**: `/providers`

管理服务提供商记录。每个提供商可拥有多个服务。

字段：
- Name — 提供商名称
- Wallet Address — 钱包地址（默认收款地址）
- Description — 描述
- Website — 网站

---

### Chains（链配置管理）

**路径**: `/chains`

管理支持的区块链网络。

字段：
- ID/Slug — 链标识（如 "optimism-sepolia"）
- Name — 显示名称
- Chain ID — EVM chain ID
- RPC URL — 默认 RPC 地址
- Explorer URL — 区块浏览器
- Is Testnet — 是否测试网
- Native Currency — 原生代币
- ERC-8004 Identity — ERC-8004 注册合约地址

---

### Tokens（代币配置管理）

**路径**: `/tokens`

管理支持的 ERC-20 代币。

字段：
- Symbol — 代币符号（如 "DMHKD"）
- Name — 全名
- Chain — 所属链（下拉选择）
- Contract Address — 合约地址
- Decimals — 精度
- Domain Name — EIP-712 域名称
- Domain Version — EIP-712 域版本
- Verify 按钮 — 从链上验证代币信息

---

### RPC Endpoints（RPC 管理）

**路径**: `/rpc`

管理 RPC 端点，查看健康状态和性能指标。

显示信息：
- 健康状态徽章（healthy/degraded/down/unknown）
- 延迟（ms）
- 请求总数 / 错误总数
- 错误率
- 优先级

操作：
- 添加 / 删除端点
- 触发手动健康检查
- 查看历史统计图表

---

### Agents（Agent 缓存）

**路径**: `/agents`

显示所有已缓存的 Agent 身份信息。

列表字段：
- Address — EVM 地址
- Is Registered — 是否已注册（ERC-8004）
- Reputation — 声誉值
- Cached At — 缓存时间

点击 Agent 可查看详细统计：
- 总请求数 / 成功 / 失败
- 总支付数 / 结算成功 / 失败
- 累计花费
- 最后活跃时间

---

### Requests（请求记录）

**路径**: `/requests`

查看网关处理的所有请求记录。

**统计面板**：
- 总请求数
- 成功/结算/失败/错误的数量

**过滤标签页**：
| 标签 | 包含的状态 |
|------|-----------|
| All | 所有状态 |
| Success | success, settled |
| Pending | payment_required, verifying, settling |
| Failed | payment_rejected, proxy_error, settlement_failed, unauthorized, backend_error |

**请求详情**：
- 方法 + 路径
- Agent 地址
- 网关状态（彩色徽章）
- HTTP 状态码
- 生命周期时间线（4 个时间戳）
- 关联的支付 ID

---

### Payments（支付记录）

**路径**: `/payments`

查看所有链上支付记录。

字段：
- Agent Address
- Service ID
- Amount
- Status（settled/failed）
- TX Hash（可点击跳转到区块浏览器）
- Network
- Settlement Error（如果失败）
- Created At

---

### Payment Test（支付测试工具）

**路径**: `/payment-test`

端到端支付流程测试工具，无需编写代码即可测试完整的支付流程。

步骤：
1. 选择一个注册的服务
2. 输入 Agent 私钥（或生成随机密钥）
3. 点击「Request」发起请求（预期收到 402）
4. 查看 PaymentRequirement
5. 点击「Sign & Pay」构造签名并重试
6. 查看结果（200 + 交易哈希或错误信息）

---

## API 通信层

所有页面通过 `src/api.ts` 与 Admin API 通信：

```typescript
// api.ts 封装了所有 fetch 调用
const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8403";

// 自动附加 Authorization 头
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer change-me-in-production`,
}
```

---

## 开发

```bash
# 启动开发服务器（热更新）
cd packages/admin-ui
pnpm dev

# 构建生产版本
pnpm build
# 输出到 dist/ 目录
```

### 组件结构

```
src/
  App.tsx           — 路由定义
  main.tsx          — React 根挂载
  api.ts            — API 通信层
  components/
    Layout.tsx      — 侧边栏 + 主内容布局
    ServiceForm.tsx — 服务创建/编辑表单
  pages/
    Services.tsx    — 服务管理页面
    Agents.tsx      — Agent 缓存页面
    Payments.tsx    — 支付记录页面
    PaymentTest.tsx — 支付测试页面
    Requests.tsx    — 请求记录页面
```
