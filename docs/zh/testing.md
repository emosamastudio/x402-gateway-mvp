# 测试指南

x402-gateway-mvp 使用 [Vitest](https://vitest.dev/) 作为测试框架，目前包含 7 个测试文件、25 个测试用例。

---

## 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
cd packages/core && pnpm test
cd packages/facilitator && pnpm test
cd packages/chain && pnpm test
cd packages/admin-api && pnpm test

# 监视模式
cd packages/core && npx vitest --watch
```

---

## 测试配置

各包通过 `package.json` 的 `scripts.test` 字段配置 Vitest：

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

无需独立的 `vitest.config.ts` 文件。Vitest 自动发现 `__tests__/` 目录下的 `.test.ts` 文件。

---

## 测试覆盖一览

### @x402-gateway-mvp/admin-api（3 个测试）

**文件**: `packages/admin-api/src/__tests__/services.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| POST /services | 有效输入创建服务成功 |
| POST /services | 无效输入被拒绝 |
| GET /services | 无服务时返回空数组 |

**测试范围**: 服务 CRUD API 的输入验证和基本功能。

---

### @x402-gateway-mvp/facilitator（10 个测试）

**文件 1**: `packages/facilitator/src/__tests__/verify.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| verifyPayment | 签名和金额正确时返回 valid=true |
| verifyPayment | 签名无效时返回 valid=false |
| verifyPayment | 支付金额不足时返回 valid=false |
| verifyPayment | 支付已过期时返回 valid=false |
| verifyPayment | 支付未到生效时间时返回 valid=false |
| verifyPayment | 网络不匹配时返回 valid=false |

**文件 2**: `packages/facilitator/src/__tests__/nonce.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| NonceStore | 新 nonce 标记为未使用 |
| NonceStore | 注册后标记为已使用 |
| NonceStore | 不同 nonce 互不影响 |
| NonceStore | 大小写混合的 nonce 视为相同 |

**测试范围**: 支付验证的核心逻辑（签名、金额、时间、网络、nonce）+ nonce 防重放存储。

---

### @x402-gateway-mvp/chain（3 个测试）

**文件**: `packages/chain/src/__tests__/erc8004.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| checkAgentIdentity | Agent 已注册时返回 registered=true + 声誉值 |
| checkAgentIdentity | ERC8004_MOCK=true 时返回 registered=true |
| checkAgentIdentity | 无合约地址时返回 registered=false |

**测试范围**: ERC-8004 身份查询的三种场景。

---

### @x402-gateway-mvp/core（9 个测试）

**文件 1**: `packages/core/src/__tests__/db.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| Database | 插入并检索服务 |
| Database | 列出所有服务 |
| Database | 插入并查询支付记录 |
| Database | 更新或插入 Agent 缓存 |

**文件 2**: `packages/core/src/__tests__/identity.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| identityMiddleware | Agent 未注册时返回 403 |
| identityMiddleware | Agent 声誉不足时返回 403 |
| identityMiddleware | Agent 已注册且声誉足够时通过 |

**文件 3**: `packages/core/src/__tests__/x402.test.ts`

| 测试套件 | 测试用例 |
|---------|---------|
| x402Middleware | 无 PAYMENT-SIGNATURE 头时返回 402 |
| x402Middleware | 有效 PAYMENT-SIGNATURE 头时调用 next |

**测试范围**: 数据库 CRUD、身份中间件、支付中间件。

---

## 测试结构

每个包的测试位于 `src/__tests__/` 目录：

```
packages/
  admin-api/src/__tests__/services.test.ts
  chain/src/__tests__/erc8004.test.ts
  core/src/__tests__/
    db.test.ts
    identity.test.ts
    x402.test.ts
  facilitator/src/__tests__/
    nonce.test.ts
    verify.test.ts
```

---

## 编写测试

### 基本模式

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("functionName", () => {
  beforeEach(() => {
    // 设置测试环境
  });

  it("should do something when condition", () => {
    const result = functionName(input);
    expect(result).toBe(expected);
  });
});
```

### Mock 外部依赖

```typescript
import { vi } from "vitest";

// Mock 模块
vi.mock("@x402-gateway-mvp/chain", () => ({
  checkAgentIdentity: vi.fn().mockResolvedValue({
    isRegistered: true,
    reputation: 100,
  }),
}));
```

### 数据库测试

使用内存 SQLite（传入 `:memory:` 路径）：

```typescript
import { createDb } from "../db.js";

const db = createDb(":memory:");
// 数据库已自动创建所有表 + 种子数据
```

---

## 测试覆盖统计

| 包 | 测试文件 | 测试数 | 覆盖范围 |
|-----|---------|--------|---------|
| admin-api | 1 | 3 | 服务 CRUD |
| facilitator | 2 | 10 | 验证 + nonce |
| chain | 1 | 3 | ERC-8004 身份 |
| core | 3 | 9 | DB + 身份 + x402 |
| **总计** | **7** | **25** | |

---

## 未覆盖的区域

以下模块目前没有自动测试，建议后续补充：

- **settle.ts** — 链上结算（需要 mock viem writeContract）
- **proxy.ts** — HTTP 代理转发
- **rpc-health.ts** — RPC 健康检查
- **admin-ui** — 前端组件（可使用 React Testing Library）
- **集成测试** — 端到端支付流程（可使用 scripts/demo.ts 作为基础）
