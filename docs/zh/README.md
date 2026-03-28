# x402 Payment Gateway — 文档中心

> 基于 HTTP 402 协议的按次付费 API 网关，使用 ERC-20 代币（EIP-3009 `transferWithAuthorization`）进行链上结算。

## 📖 文档索引

### 入门

| 文档 | 说明 |
|------|------|
| [项目概述](overview.md) | x402 协议介绍、核心概念、适用场景 |
| [架构设计](architecture.md) | Monorepo 结构、模块关系、请求流转图 |
| [快速入门](getting-started.md) | 安装、配置、启动、创建第一个服务 |
| [环境配置](configuration.md) | 所有环境变量的完整参考 |

### 核心概念

| 文档 | 说明 |
|------|------|
| [支付生命周期](payment-lifecycle.md) | 10 种状态、完整状态机、生命周期时间戳 |
| [类型参考](types.md) | 所有 TypeScript 接口、类型和 Zod 验证规则 |
| [数据库 Schema](database.md) | 10 张表的完整字段说明、索引、种子数据 |

### API 参考

| 文档 | 说明 |
|------|------|
| [网关 Core API](gateway-api.md) | 代理路由、402 质询、支付头格式 |
| [管理 Admin API](api-reference.md) | Services、Providers、Chains、Tokens 等所有管理接口 |

### 集成与使用

| 文档 | 说明 |
|------|------|
| [Agent 集成指南](agent-integration.md) | 如何接入 x402 付费 API、EIP-712 签名、代码示例 |
| [Admin UI 说明](admin-ui.md) | 管理界面各页面功能说明 |

### 运维与开发

| 文档 | 说明 |
|------|------|
| [部署指南](deployment.md) | 生产环境部署、安全配置、反向代理、监控 |
| [开发贡献指南](development.md) | 项目结构、构建、代码约定、添加新功能 |
| [测试文档](testing.md) | 测试框架、覆盖范围、运行方法 |
| [Package 详解](packages.md) | 各 package 的导出、职责和实现细节 |

---

📌 英文版文档：[English Documentation](../en/README.md)
