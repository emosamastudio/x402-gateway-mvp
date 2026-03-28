# Getting Started

## Prerequisites

- **Node.js** >= 18
- **pnpm** >= 10 (`npm install -g pnpm`)
- **Git**

## Installation

```bash
# Clone the repository
git clone <repository-url> x402-gateway-mvp
cd x402-gateway-mvp

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

## Environment Setup

Copy the example environment file and modify as needed:

```bash
cp .env.example .env
# or create .env directly
```

Minimum configuration (development):

```dotenv
# Gateway ports
CORE_PORT=8402
ADMIN_PORT=8403

# Admin API key (leave empty to skip auth in dev)
ADMIN_API_KEY=change-me-in-production

# Database
DB_PATH=./gateway.db

# Facilitator private key (for broadcasting settlement transactions, testnet)
FACILITATOR_PRIVATE_KEY=0x<your-private-key>

# Chain RPCs (only used as seed defaults on first DB creation; manage via Admin UI afterwards)
# OPTIMISM_SEPOLIA_RPC=https://sepolia.optimism.io
# SEPOLIA_RPC=https://rpc.sepolia.org

# DMHKD token contract addresses
OPTIMISM_SEPOLIA_DMHKD=0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6
SEPOLIA_DMHKD=0x1aA90392c804343C7854DD700f50a48961B71c53

# EIP-712 Domain
OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME=DMHKD
OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION=2

# Development: bypass ERC-8004 identity check
ERC8004_MOCK=true
```

> See [Configuration](configuration.md) for the full environment variable reference.

## Starting the Server

### Development Mode

```bash
# Start all services (Core + Admin API + Admin UI)
pnpm dev
```

This starts in parallel:
- **Gateway Core** — `http://localhost:8402`
- **Admin API** — `http://localhost:8403`
- **Admin UI** — `http://localhost:5173`

### Production Mode

```bash
# Build first
pnpm build

# Start (Core + Admin API)
pnpm start
# or
set -a && source .env && set +a && npx tsx start.ts
```

## Create Your First Service

### 1. Start a Test Backend

```bash
# Start the echo test server (port 9999)
npx tsx scripts/echo-server.ts &
```

### 2. Via Admin UI

1. Open `http://localhost:5173`
2. Create a Provider in the **Service Providers** page
3. Click "New Service" in the **Services** page
4. Fill in:
   - Name: `Echo Service`
   - Gateway Path: `/echo`
   - Backend URL: `http://localhost:9999/echo`
   - Price: `0.001`
   - Select network and token

### 3. Or via API

```bash
# Create Provider
curl -X POST http://localhost:8403/providers \
  -H "Authorization: Bearer change-me-in-production" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Provider",
    "walletAddress": "0xaE574A6a165Efa27a40bE52AB36c2d935560810c"
  }'

# Create Service (use the returned Provider ID)
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

## Test a Paid API Call

### Using Admin UI PaymentTest Page

1. Open `http://localhost:5173/test`
2. Select the created service
3. Configure test parameters (Agent private key is pre-set from the env test account)
4. Click "Send Request" to execute the full 402 → sign → 200 flow

### Using the Demo Script

```bash
set -a && source .env && set +a
npx tsx scripts/demo.ts
```

The demo script automatically:
1. Registers an echo backend service via Admin API
2. Sends a request without payment (receives 402 + PaymentRequirement)
3. Constructs an EIP-712 signature
4. Retries with the payment header (receives 200 + backend response + txHash in PAYMENT-RESPONSE header)

### Manual Testing with curl

```bash
# Step 1: Send request, receive 402
curl -v http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646"

# Response: 402 Payment Required
# Body: { "paymentRequirements": [{ ... }] }
```

## View Request Logs

Open the Admin UI **Requests** page (`http://localhost:5173/requests`) to view:

- Lifecycle status of all requests
- Success rate statistics
- Filter by status (Completed / In Progress / Failed)
- Lifecycle timeline per request (Challenge → Verify → Proxy → Settle)

## Next Steps

- [Configuration](configuration.md) — Learn about all configuration options
- [Payment Lifecycle](payment-lifecycle.md) — Deep dive into the payment flow
- [Agent Integration Guide](agent-integration.md) — How to programmatically access paid APIs
- [Admin API Reference](api-reference.md) — Complete Admin API documentation
- [Deployment Guide](deployment.md) — Production deployment recommendations
