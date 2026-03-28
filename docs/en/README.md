# x402 Payment Gateway — Documentation

> An HTTP 402-based pay-per-request API gateway using ERC-20 tokens (EIP-3009 `transferWithAuthorization`) for on-chain settlement.

## 📖 Documentation Index

### Getting Started

| Document | Description |
|----------|-------------|
| [Project Overview](overview.md) | x402 protocol introduction, core concepts, use cases |
| [Architecture](architecture.md) | Monorepo structure, module relationships, request flow |
| [Getting Started](getting-started.md) | Installation, configuration, launching, first service |
| [Configuration](configuration.md) | Complete environment variable reference |

### Core Concepts

| Document | Description |
|----------|-------------|
| [Payment Lifecycle](payment-lifecycle.md) | 10 statuses, full state machine, lifecycle timestamps |
| [Type Reference](types.md) | All TypeScript interfaces, types, and Zod validation rules |
| [Database Schema](database.md) | 10 tables with full column details, indexes, seed data |

### API Reference

| Document | Description |
|----------|-------------|
| [Gateway Core API](gateway-api.md) | Proxy routing, 402 challenge, payment header format |
| [Admin API Reference](api-reference.md) | Services, Providers, Chains, Tokens, and all management endpoints |

### Integration & Usage

| Document | Description |
|----------|-------------|
| [Agent Integration Guide](agent-integration.md) | How to integrate with x402 paid APIs, EIP-712 signing, code examples |
| [Admin UI Guide](admin-ui.md) | Management dashboard page-by-page guide |

### Operations & Development

| Document | Description |
|----------|-------------|
| [Deployment Guide](deployment.md) | Production deployment, security, reverse proxy, monitoring |
| [Development Guide](development.md) | Project structure, build, code conventions, adding features |
| [Testing](testing.md) | Test framework, coverage, running tests |
| [Package Details](packages.md) | Exports, responsibilities, and implementation details per package |

---

📌 中文版文档：[中文文档](../zh/README.md)
