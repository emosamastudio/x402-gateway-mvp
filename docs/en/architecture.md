# Architecture

## Monorepo Structure

```
x402-gateway-mvp/
├── packages/
│   ├── shared/          # Shared types, Zod schemas, utility functions
│   ├── chain/           # Chain interaction: registry, RPC health checks, ERC-8004
│   ├── facilitator/     # Payment verification & on-chain settlement
│   ├── core/            # Gateway core: middleware, proxy, database
│   ├── admin-api/       # Management REST API
│   └── admin-ui/        # React management dashboard
├── scripts/             # Demo and test scripts
├── start.ts             # Unified entry point
├── turbo.json           # Turborepo build config
└── pnpm-workspace.yaml  # pnpm workspace
```

## Package Dependency Graph

```
                    ┌──────────┐
                    │  shared  │  ← base for all packages
                    └────┬─────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────────┐  │
         │ chain  │ │facilitator │  │
         └───┬────┘ └─────┬──────┘  │
             │            │         │
             └──────┬─────┘         │
                    ▼               │
              ┌──────────┐          │
              │   core   │ ◄───────┘
              └────┬─────┘
                   │
              ┌────▼─────┐     ┌──────────┐
              │admin-api  │     │ admin-ui │
              └──────────┘     └──────────┘
                   ▲                 │
                   └─── HTTP API ────┘
```

### Build Order

```
shared → chain → facilitator → core → admin-api
                                       admin-ui (independent, Vite dev server)
```

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        AI Agent / Client                         │
│  1. GET /echo/test (no payment header)                           │
│  2. Receives 402 + PaymentRequirement                            │
│  3. Constructs EIP-712 signature                                 │
│  4. GET /echo/test + PAYMENT-SIGNATURE header                    │
│  5. Receives 200 + PAYMENT-RESPONSE header (txHash)              │
└──────────────┬───────────────────────────────────────────────────┘
               │ HTTP
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Gateway Core (:8402)                           │
│                                                                  │
│  ┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│  │    Identity      │──▶│    x402      │──▶│     Proxy       │   │
│  │   Middleware     │   │  Middleware   │   │  (to backend)   │   │
│  │                  │   │              │   │                  │   │
│  │ • X-Agent-Addr  │   │ • 402 chall. │   │ • Strip prefix  │   │
│  │ • ERC-8004 check│   │ • Sig verify │   │ • Forward req   │   │
│  │ • Reputation    │   │ • Lifecycle   │   │ • 10s timeout   │   │
│  └─────────────────┘   └──────┬───────┘   └────────┬─────────┘   │
│                               │                     │             │
│                               ▼                     ▼             │
│                    ┌────────────────┐    ┌─────────────────┐      │
│                    │  Facilitator   │    │   Backend API   │      │
│                    │                │    │   (e.g. Echo)   │      │
│                    │ • verifyPayment│    └─────────────────┘      │
│                    │ • settlePayment│                             │
│                    │   (on-chain)   │                             │
│                    └────────┬───────┘                             │
│                             │                                    │
│  ┌──────────────────────────▼─────────────────────────────────┐  │
│  │                    SQLite Database                          │  │
│  │  requests · payments · services · providers · chains       │  │
│  │  tokens · agent_cache · rpc_endpoints · used_nonces        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
               │
               │ HTTP (Admin)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Admin API (:8403)                              │
│                                                                  │
│  /services · /providers · /chains · /tokens · /rpc-endpoints     │
│  /agents · /requests · /payments · /health                       │
│                                                                  │
│  Bearer Token Authentication (ADMIN_API_KEY)                     │
└──────────────────────────────────────────────────────────────────┘
               │
               │ Vite Proxy
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Admin UI (:5173)                               │
│                                                                  │
│  React 18 + Vite 5 · Dark Theme                                 │
│  Pages: Services, Providers, Chains, Tokens, Requests,           │
│         Payments, Agents, Stats, PaymentTest                     │
└──────────────────────────────────────────────────────────────────┘
```

## Request Processing Flow

### Unpaid Path (403/402)

```
Agent Request
    │
    ▼
Identity Middleware
    ├── No X-Agent-Address → 403 Unauthorized
    ├── ERC-8004 not registered → 403 Unauthorized
    ├── Insufficient reputation → 403 Unauthorized
    │
    ▼ (pass)
x402 Middleware
    ├── No PAYMENT-SIGNATURE header → create payment_required record → 402
    ├── Invalid base64/JSON → update to payment_rejected → 402
    ├── Verification failed → update to payment_rejected → 402
    │
    ▼ (verified → update to verifying)
Proxy Handler
    └── continue processing...
```

### Paid Path (Success/Failure)

```
Proxy Handler
    │
    ├── Backend unreachable → proxy_error (502/504)
    ├── Backend non-2xx → backend_error
    │
    ▼ (Backend 2xx)
    ├── No payment → success (200)
    │
    ▼ (With payment)
    Update to settling
    │
    ├── Settlement success → settled + create Payment record
    └── Settlement failure → settlement_failed + create Payment record (with error)
```

## Port Allocation

| Service | Default Port | Env Var | Description |
|---------|-------------|---------|-------------|
| Gateway Core | 8402 | `CORE_PORT` | Gateway proxy, handles Agent requests |
| Admin API | 8403 | `ADMIN_PORT` | Management REST API |
| Admin UI (dev) | 5173 | — | Vite dev server |
| Echo Server (test) | 9999 | — | Test echo backend |

## Data Flow

```
┌─────────┐    HTTP     ┌─────────┐    HTTP    ┌──────────┐
│  Agent  │ ──────────▶ │ Gateway │ ─────────▶ │ Backend  │
│         │ ◀────────── │  Core   │ ◀───────── │   API    │
└─────────┘  402/200    └────┬────┘            └──────────┘
                             │
                     ┌───────┼───────┐
                     ▼       ▼       ▼
               ┌─────────┐ ┌────┐ ┌──────────┐
               │  Chain   │ │ DB │ │Facilitator│
               │ (viem)   │ │    │ │(settle)   │
               └─────────┘ └────┘ └──────────┘
                  │                     │
                  ▼                     ▼
            ┌──────────┐        ┌──────────┐
            │ ERC-8004 │        │   ERC-20 │
            │ Identity │        │  Transfer│
            └──────────┘        └──────────┘
```
