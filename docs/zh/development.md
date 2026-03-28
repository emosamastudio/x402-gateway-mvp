# 开发指南

本文档面向参与 x402-gateway-mvp 开发的工程师，涵盖项目结构、开发流程、代码规范等内容。

---

## 开发环境要求

| 工具 | 最低版本 | 安装方式 |
|------|---------|---------|
| Node.js | 20+ | [nvm](https://github.com/nvm-sh/nvm) 推荐 |
| pnpm | 9+ | `npm install -g pnpm` |
| Git | 2.30+ | 系统自带或 brew install git |
| TypeScript | 5.x | 项目包含（无需全局安装） |

---

## 项目初始化

```bash
git clone <repo-url> x402-gateway-mvp
cd x402-gateway-mvp
pnpm install
cp .env.example .env
# 编辑 .env 填入必要的环境变量
```

---

## 开发命令

```bash
# 启动所有服务（开发模式）
pnpm dev
# 等效于同时启动：
#   - core (:8402)
#   - admin-api (:8403)
#   - admin-ui (:5173, Vite HMR)

# 构建所有包
pnpm build

# 运行测试
pnpm test

# 仅构建特定包
cd packages/shared && pnpm build

# 运行 demo 脚本
cd scripts && pnpm demo
```

---

## 项目结构

```
x402-gateway-mvp/
├── .env                   ← 环境变量（git-ignored）
├── .env.example           ← 环境变量模板
├── package.json           ← 根 pnpm workspace
├── pnpm-workspace.yaml    ← 工作区定义
├── turbo.json             ← Turborepo 构建管道
├── tsconfig.base.json     ← 共享 TypeScript 配置
├── start.ts               ← 统一启动入口
├── packages/
│   ├── shared/            ← 共享类型 + 工具
│   ├── chain/             ← 区块链交互层
│   ├── facilitator/       ← 支付验证 + 结算
│   ├── core/              ← 网关核心（HTTP 代理）
│   ├── admin-api/         ← 管理 REST API
│   └── admin-ui/          ← React 管理界面
├── scripts/
│   └── demo.ts            ← 端到端演示脚本
└── docs/                  ← 文档目录
    ├── zh/                ← 中文文档
    └── en/                ← English docs
```

---

## Turborepo 构建管道

`turbo.json` 定义了包间依赖关系，确保正确的构建顺序：

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

构建顺序：`shared` → `chain` → `facilitator` → `core` → `admin-api`

---

## TypeScript 配置

所有包共享 `tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Node16",
    "strict": true,
    "outDir": "dist",
    "declaration": true
  }
}
```

每个包有自己的 `tsconfig.json` 继承基础配置并添加 `references`。

---

## 代码规范

### 命名规范

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `rpc-health.ts` |
| 接口/类型 | PascalCase | `GatewayRequest`, `ChainConfig` |
| 函数 | camelCase | `verifyPayment()`, `getDb()` |
| 常量 | SCREAMING_SNAKE_CASE | `CACHE_TTL_MS` |
| 环境变量 | SCREAMING_SNAKE_CASE | `FACILITATOR_PRIVATE_KEY` |
| 数据库列 | snake_case | `gateway_status`, `created_at` |
| 前端组件 | PascalCase | `ServiceForm.tsx` |

### 模块导出

- 每个包通过 `src/index.ts` 统一导出
- 使用 ESM（`.js` 扩展名在 import 中）
- 类型使用 `export type` 导出

### 错误处理

- 中间件：返回 HTTP 错误响应（JSON `{ error: "..." }`）
- 链交互：try/catch 包裹，失败时使用缓存或返回安全默认值
- 数据库：直接抛出异常
- 结算：捕获 viem 错误，提取 shortMessage

### 数据库字段映射

TypeScript 使用 camelCase，SQLite 使用 snake_case，通过 `rowTo*()` 函数转换：

```typescript
function rowToService(row: any): Service {
  return {
    id: row.id,
    providerId: row.provider_id,
    gatewayPath: row.gateway_path,
    // ...
  };
}
```

---

## 添加新功能的工作流

### 1. 添加新的数据库表

1. 在 `packages/core/src/db.ts` 的 `SCHEMA` 中添加 `CREATE TABLE`
2. 添加自动迁移逻辑（`PRAGMA table_info` + `ALTER TABLE`）
3. 添加 `rowTo*()` 转换函数
4. 在 `createDb()` 返回对象中添加 CRUD 方法
5. 在 `packages/shared/src/types.ts` 中添加类型

### 2. 添加新的 API 端点

1. 在 `packages/shared/src/schemas.ts` 中添加 Zod schema（输入校验）
2. 在 `packages/admin-api/src/routes/` 中添加路由处理
3. 在 `packages/admin-ui/src/api.ts` 中添加 API 调用方法
4. 在 Admin UI 中添加页面或组件
5. 编写测试

### 3. 添加新的区块链网络

1. 通过 Admin UI 或 API 添加链配置（POST /chains）
2. 添加对应的代币配置（POST /tokens）
3. 添加 RPC 端点（POST /rpc）
4. 配置 ERC-8004 身份合约地址

### 4. 添加新的中间件

1. 在 `packages/core/src/middleware/` 目录创建新文件
2. 导出中间件工厂函数（接受配置参数，返回 Hono 中间件）
3. 在 `packages/core/src/app.ts` 中注册到管道

---

## 调试技巧

### 查看数据库内容

```bash
sqlite3 gateway.db
.tables                                           # 列出所有表
.schema services                                   # 查看表结构
SELECT * FROM services;                            # 查看所有服务
SELECT gateway_status, COUNT(*) FROM requests GROUP BY gateway_status;
```

### 测试支付流程

1. 启动服务：`pnpm dev`
2. 打开 Admin UI：`http://localhost:5173`
3. 创建服务
4. 使用 Payment Test 页面测试

### 模拟 Agent 请求

```bash
# 触发 402
curl -v http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646"

# 查看服务列表
curl http://localhost:8403/services \
  -H "Authorization: Bearer change-me-in-production"
```

### 重置数据库

```bash
# 删除数据库文件（重启后自动重建）
rm gateway.db
```

---

## 包间依赖关系

```
shared ← chain ← facilitator ← core ← admin-api
                                  ↑
                              admin-ui (HTTP)
```

修改 `shared` 后需要重新构建所有依赖包。Turborepo 会自动处理。
