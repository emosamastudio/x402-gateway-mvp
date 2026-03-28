# Configuration

## Complete Environment Variable Reference

All configuration is set via `.env` file or system environment variables.

### Gateway Base

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORE_PORT` | Gateway Core service port | `8402` | No |
| `ADMIN_PORT` | Admin API service port | `8403` | No |
| `ADMIN_API_KEY` | Admin API Bearer Token. Leave empty to skip auth in dev | — | Production: Yes |
| `DB_PATH` | SQLite database file path | `./gateway.db` | No |

### Facilitator Wallet

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FACILITATOR_PRIVATE_KEY` | Facilitator EVM private key for broadcasting `transferWithAuthorization` settlement transactions. This wallet must hold ETH to pay gas fees | — | **Yes** |

> ⚠️ **Security**: The Facilitator private key must be kept strictly confidential. In production, use KMS or Vault for management.

### Chain RPC

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPTIMISM_SEPOLIA_RPC` | Optimism Sepolia JSON-RPC URL | `https://sepolia.optimism.io` | No |
| `SEPOLIA_RPC` | Ethereum Sepolia JSON-RPC URL | `https://rpc.sepolia.org` | No |

> ⚠️ **Important**: These env vars are **only used once** — as seed defaults when the database is first created. They populate the `chains` table, which is then auto-synced to `rpc_endpoints`. Once the database exists, these variables are completely ignored.
>
> **Recommended approach**: Do not set RPC in `.env`. Instead, manage RPC endpoints via:
> - **Admin UI** → RPC Endpoints page: visually add, remove, and prioritize RPC nodes
> - **Admin API** → `POST /rpc-endpoints`: dynamically add via API
>
> The system supports multiple RPC endpoints per chain with health checking, latency monitoring, priority ordering, and automatic failover.

### Token Contracts

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPTIMISM_SEPOLIA_DMHKD` | DMHKD token contract on Optimism Sepolia | `0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6` | No |
| `SEPOLIA_DMHKD` | DMHKD token contract on Ethereum Sepolia | `0x1aA90392c804343C7854DD700f50a48961B71c53` | No |

### EIP-712 Domain Parameters

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPTIMISM_SEPOLIA_TOKEN_DOMAIN_NAME` | EIP-712 domain name (currently unused — DS read from chain) | `DMHKD` | No |
| `OPTIMISM_SEPOLIA_TOKEN_DOMAIN_VERSION` | EIP-712 domain version | `2` | No |
| `SEPOLIA_TOKEN_DOMAIN_NAME` | EIP-712 domain name | `DMHKD` | No |
| `SEPOLIA_TOKEN_DOMAIN_VERSION` | EIP-712 domain version | `2` | No |

> 📌 **Note**: `DOMAIN_SEPARATOR` is actually read directly from the token contract's `DOMAIN_SEPARATOR()` method on-chain. These env vars currently serve only as configuration archives.

### ERC-8004 Identity Contracts

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `OPTIMISM_SEPOLIA_ERC8004_IDENTITY` | ERC-8004 identity contract on Optimism Sepolia | — | No |
| `SEPOLIA_ERC8004_IDENTITY` | ERC-8004 identity contract on Ethereum Sepolia | — | No |
| `ERC8004_MOCK` | Set to `"true"` to bypass ERC-8004 identity checks (dev only) | — | No |

> For development, set `ERC8004_MOCK=true` so all Agents automatically pass identity and reputation checks.

### Test Accounts

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TEST_AGENT_PRIVATE_KEY` | Test Agent private key (testnet only) | — | No |
| `TEST_AGENT_ADDRESS` | Test Agent address | — | No |
| `RECIPIENT_PRIVATE_KEY` | Recipient private key | — | No |
| `RECIPIENT_ADDRESS` | Recipient address | — | No |

> ⚠️ These test accounts are for testnet only — never use on mainnet!

### Frontend Environment

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `VITE_ADMIN_API_KEY` | API Key for Admin UI (must match `ADMIN_API_KEY`) | — | No |

---

## Complete .env Example

```dotenv
# ─── Gateway ───────────────────────────────
CORE_PORT=8402
ADMIN_PORT=8403
ADMIN_API_KEY=change-me-in-production
DB_PATH=./gateway.db

# ─── Facilitator ───────────────────────────
FACILITATOR_PRIVATE_KEY=0x<your-64-hex-chars>

# ─── Chain RPCs (seed only; manage via Admin UI) ──
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

## Security Recommendations

### Production Environment

1. **`ADMIN_API_KEY`** — Use a strong random string (at least 32 characters)
2. **`FACILITATOR_PRIVATE_KEY`** — Use a dedicated wallet, minimize ETH balance, consider KMS
3. **`ERC8004_MOCK`** — Must be removed or set to `false` in production
4. **`DB_PATH`** — Use an absolute path, ensure correct directory permissions
5. Remove all `TEST_*` and `RECIPIENT_*` variables
6. Use authenticated RPC URLs (e.g., Alchemy, Infura)

