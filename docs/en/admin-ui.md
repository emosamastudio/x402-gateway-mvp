# Admin UI Guide

The Admin UI is a React-based gateway management dashboard providing visual service management, request monitoring, and payment querying.

**Default URL**: `http://localhost:5173` (Vite dev server)

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Inline CSS (dark theme) |
| Routing | React Router |
| State | useState + useEffect (no external state library) |
| Data fetching | fetch API → Admin API (:8403) |

### Environment Variables

```env
VITE_API_BASE_URL=http://localhost:8403   # Admin API URL
```

---

## Sidebar Navigation

```
┌──────────────────┐
│  x402 Gateway MVP    │  ← Logo
├──────────────────┤
│  Services        │  ← Service management
│  Providers       │  ← Provider management
│  Chains          │  ← Chain config
│  Tokens          │  ← Token config
│  RPC Endpoints   │  ← RPC management
│  Agents          │  ← Agent cache
│  Requests        │  ← Request records
│  Payments        │  ← Payment records
│  Payment Test    │  ← Payment testing
└──────────────────┘
```

---

## Page Details

### Services

**Path**: `/`

Features:
- **List view**: Shows all registered API services
- **Create service**: Create new service via form
- **Edit service**: Modify service configuration
- **Delete service**: Remove unwanted services

Form fields:
| Field | Description | Example |
|-------|-------------|---------|
| Name | Service name | "Echo API" |
| Gateway Path | Gateway path prefix | "/echo" |
| Backend URL | Backend API URL | "http://localhost:9999/echo" |
| Provider | Service provider (dropdown) | "Acme Services" |
| Network | Payment chain (dropdown) | "optimism-sepolia" |
| Token | Payment token (dropdown) | "DMHKD" |
| Price | Price per call | "0.001" |
| Recipient | Payment recipient address | "0x..." |
| API Key | Backend API key (optional) | |
| Min Reputation | Minimum reputation requirement | 0 |

---

### Providers

**Path**: `/providers`

Manage service provider records. Each provider can own multiple services.

Fields:
- Name — Provider name
- Wallet Address — Wallet address (default payment recipient)
- Description — Description
- Website — Website URL

---

### Chains

**Path**: `/chains`

Manage supported blockchain networks.

Fields:
- ID/Slug — Chain identifier (e.g., "optimism-sepolia")
- Name — Display name
- Chain ID — EVM chain ID
- RPC URL — Default RPC URL
- Explorer URL — Block explorer
- Is Testnet — Whether it's a testnet
- Native Currency — Native token symbol
- ERC-8004 Identity — ERC-8004 registry contract address

---

### Tokens

**Path**: `/tokens`

Manage supported ERC-20 tokens.

Fields:
- Symbol — Token symbol (e.g., "DMHKD")
- Name — Full name
- Chain — Parent chain (dropdown)
- Contract Address — Contract address
- Decimals — Decimal places
- Domain Name — EIP-712 domain name
- Domain Version — EIP-712 domain version
- Verify button — Verify token info from chain

---

### RPC Endpoints

**Path**: `/rpc`

Manage RPC endpoints with health status and performance metrics.

Displayed info:
- Health status badge (healthy/degraded/down/unknown)
- Latency (ms)
- Total requests / Total errors
- Error rate
- Priority

Actions:
- Add / Delete endpoints
- Trigger manual health check
- View historical stats charts

---

### Agents

**Path**: `/agents`

View all cached Agent identity information.

List fields:
- Address — EVM address
- Is Registered — Whether registered (ERC-8004)
- Reputation — Reputation score
- Cached At — Cache timestamp

Click an Agent for detailed stats:
- Total requests / Success / Failed
- Total payments / Settled / Failed
- Total spent
- Last seen

---

### Requests

**Path**: `/requests`

View all gateway request records.

**Stats panel**:
- Total requests
- Success / Settled / Failed / Error counts

**Filter tabs**:
| Tab | Included Statuses |
|-----|------------------|
| All | All statuses |
| Success | success, settled |
| Pending | payment_required, verifying, settling |
| Failed | payment_rejected, proxy_error, settlement_failed, unauthorized, backend_error |

**Request details**:
- Method + Path
- Agent address
- Gateway status (colored badge)
- HTTP status code
- Lifecycle timeline (4 timestamps)
- Associated payment ID

---

### Payments

**Path**: `/payments`

View all on-chain payment records.

Fields:
- Agent Address
- Service ID
- Amount
- Status (settled/failed)
- TX Hash (clickable link to block explorer)
- Network
- Settlement Error (if failed)
- Created At

---

### Payment Test

**Path**: `/payment-test`

End-to-end payment flow testing tool — test the complete payment flow without writing code.

Steps:
1. Select a registered service
2. Enter Agent private key (or generate random key)
3. Click "Request" to make initial request (expect 402)
4. View PaymentRequirement
5. Click "Sign & Pay" to construct signature and retry
6. View result (200 + tx hash or error message)

---

## API Communication Layer

All pages communicate with Admin API via `src/api.ts`:

```typescript
// api.ts wraps all fetch calls
const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8403";

// Automatically attaches Authorization header
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer change-me-in-production`,
}
```

---

## Development

```bash
# Start dev server (hot reload)
cd packages/admin-ui
pnpm dev

# Production build
pnpm build
# Output to dist/ directory
```

### Component Structure

```
src/
  App.tsx           — Route definitions
  main.tsx          — React root mount
  api.ts            — API communication layer
  components/
    Layout.tsx      — Sidebar + main content layout
    ServiceForm.tsx — Service create/edit form
  pages/
    Services.tsx    — Service management page
    Agents.tsx      — Agent cache page
    Payments.tsx    — Payment records page
    PaymentTest.tsx — Payment test page
    Requests.tsx    — Request records page
```
