# Project Overview

## What is x402 Payment Gateway?

x402 Payment Gateway is a pay-per-request API gateway based on the **HTTP 402 status code**. It acts as an intermediary between API service providers and AI Agents (callers), providing:

- **Per-call billing**: Each API call is settled on-chain via ERC-20 tokens
- **No registration required**: Agents access services via ERC-8004 on-chain identity
- **Instant settlement**: Uses EIP-3009 `transferWithAuthorization` for single-call on-chain payment
- **Transparent pricing**: 402 challenge responses include full pricing and payment information

---

## Core Protocols & Standards

### HTTP 402 Payment Required

HTTP 402 is a reserved HTTP status code originally designed for "payment required" scenarios. The x402 gateway leverages this status code:

1. On first request, the gateway returns `402` with a `PaymentRequirement` JSON (price, token, recipient, etc.)
2. The client constructs an EIP-712 signed `TransferWithAuthorization` and retries with a `PAYMENT-SIGNATURE` header
3. The gateway verifies the signature, proxies the request to the backend, then broadcasts the on-chain settlement

### EIP-3009: transferWithAuthorization

EIP-3009 allows token holders to sign an off-chain authorization for a third party (Facilitator) to execute the on-chain transfer. Key features:

- **Off-chain signing**: Agent only signs; no ETH needed for gas
- **Nonce replay protection**: Each authorization includes a unique nonce
- **Time constraints**: `validAfter` / `validBefore` control the authorization validity window

### ERC-8004: On-Chain Identity

ERC-8004 provides on-chain identity verification:

- `isRegistered(address)` — checks if an address is registered
- `getReputationScore(address)` — gets on-chain reputation score
- Gateway performs admission control based on registration status and minimum reputation

### EIP-712: Typed Structured Data

EIP-712 is the standard for signing typed structured data. The gateway uses it to construct `TransferWithAuthorization` signatures:

- Domain Separator is read from the token contract on-chain (`DOMAIN_SEPARATOR()`)
- The struct includes `from`, `to`, `value`, `validAfter`, `validBefore`, `nonce`

---

## Use Cases

### AI Agent Paid API Calls

```
AI Agent ──→ x402 Gateway MVP ──→ Weather API / LLM API / Data API
                  │
                  └──→ On-chain settlement (DMHKD token)
```

AI Agents can autonomously discover, call, and pay for API services without prior registration or credit relationships.

### Multi-Service Pricing

The gateway supports registering multiple backend services, each independently configured:
- Price (e.g., 0.001 DMHKD per call)
- Recipient address
- Network (chain)
- Minimum reputation for access

### Service Provider Management

Service Providers can manage multiple API services with a unified wallet address as the default payment recipient.

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Web Framework | Hono |
| Database | SQLite (better-sqlite3) |
| Chain Interaction | viem |
| Frontend | React 18 + Vite 5 |
| Charts | Recharts |
| Build System | pnpm workspaces + Turborepo |
| Testing | Vitest |
| Token | DMHKD (ERC-20 / EIP-3009) |
| Testnets | Optimism Sepolia, Ethereum Sepolia |

---

## System Roles

| Role | Description |
|------|-------------|
| **Agent** | AI agent with on-chain identity (ERC-8004), accesses paid APIs and signs payment authorizations |
| **Service Provider** | Registers and manages backend API services |
| **Facilitator** | Built-in gateway role, verifies signatures and broadcasts on-chain settlement transactions (holds ETH for gas) |
| **Admin** | Administrator, manages gateway configuration via Admin UI/API |
