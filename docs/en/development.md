# Development Guide

This guide is for engineers contributing to x402-gateway-mvp, covering project structure, development workflow, and code conventions.

---

## Development Environment

| Tool | Minimum Version | Installation |
|------|----------------|-------------|
| Node.js | 20+ | [nvm](https://github.com/nvm-sh/nvm) recommended |
| pnpm | 9+ | `npm install -g pnpm` |
| Git | 2.30+ | System default or `brew install git` |
| TypeScript | 5.x | Included in project (no global install needed) |

---

## Project Setup

```bash
git clone <repo-url> x402-gateway-mvp
cd x402-gateway-mvp
pnpm install
cp .env.example .env
# Edit .env with required environment variables
```

---

## Development Commands

```bash
# Start all services (development mode)
pnpm dev
# Equivalent to starting simultaneously:
#   - core (:8402)
#   - admin-api (:8403)
#   - admin-ui (:5173, Vite HMR)

# Build all packages
pnpm build

# Run tests
pnpm test

# Build specific package
cd packages/shared && pnpm build

# Run demo script
cd scripts && pnpm demo
```

---

## Project Structure

```
x402-gateway-mvp/
├── .env                   ← Environment variables (git-ignored)
├── .env.example           ← Environment variable template
├── package.json           ← Root pnpm workspace
├── pnpm-workspace.yaml    ← Workspace definition
├── turbo.json             ← Turborepo build pipeline
├── tsconfig.base.json     ← Shared TypeScript config
├── start.ts               ← Unified startup entry
├── packages/
│   ├── shared/            ← Shared types + utilities
│   ├── chain/             ← Blockchain interaction layer
│   ├── facilitator/       ← Payment verification + settlement
│   ├── core/              ← Gateway core (HTTP proxy)
│   ├── admin-api/         ← Management REST API
│   └── admin-ui/          ← React admin dashboard
├── scripts/
│   └── demo.ts            ← End-to-end demo script
└── docs/                  ← Documentation
    ├── zh/                ← Chinese docs
    └── en/                ← English docs
```

---

## Turborepo Build Pipeline

`turbo.json` defines inter-package dependencies, ensuring correct build order:

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

Build order: `shared` → `chain` → `facilitator` → `core` → `admin-api`

---

## TypeScript Configuration

All packages share `tsconfig.base.json`:

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

Each package has its own `tsconfig.json` extending the base with `references`.

---

## Code Conventions

### Naming

| Type | Style | Example |
|------|-------|---------|
| File names | kebab-case | `rpc-health.ts` |
| Interfaces/Types | PascalCase | `GatewayRequest`, `ChainConfig` |
| Functions | camelCase | `verifyPayment()`, `getDb()` |
| Constants | SCREAMING_SNAKE_CASE | `CACHE_TTL_MS` |
| Env variables | SCREAMING_SNAKE_CASE | `FACILITATOR_PRIVATE_KEY` |
| DB columns | snake_case | `gateway_status`, `created_at` |
| React components | PascalCase | `ServiceForm.tsx` |

### Module Exports

- Each package exports through `src/index.ts`
- Uses ESM (`.js` extension in imports)
- Types exported using `export type`

### Error Handling

- Middleware: Return HTTP error responses (JSON `{ error: "..." }`)
- Chain interactions: Wrapped in try/catch, use cache or safe defaults on failure
- Database: Throw exceptions directly
- Settlement: Catch viem errors, extract shortMessage

### Database Field Mapping

TypeScript uses camelCase, SQLite uses snake_case, converted via `rowTo*()` functions:

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

## Adding New Features

### 1. Add a New Database Table

1. Add `CREATE TABLE` to `SCHEMA` in `packages/core/src/db.ts`
2. Add auto-migration logic (`PRAGMA table_info` + `ALTER TABLE`)
3. Add `rowTo*()` conversion function
4. Add CRUD methods to `createDb()` return object
5. Add types in `packages/shared/src/types.ts`

### 2. Add a New API Endpoint

1. Add Zod schema in `packages/shared/src/schemas.ts` (input validation)
2. Add route handler in `packages/admin-api/src/routes/`
3. Add API call method in `packages/admin-ui/src/api.ts`
4. Add page or component in Admin UI
5. Write tests

### 3. Add a New Blockchain Network

1. Add chain config via Admin UI or API (POST /chains)
2. Add corresponding token config (POST /tokens)
3. Add RPC endpoints (POST /rpc)
4. Configure ERC-8004 identity contract address

### 4. Add New Middleware

1. Create new file in `packages/core/src/middleware/`
2. Export middleware factory function (accepts config, returns Hono middleware)
3. Register in pipeline in `packages/core/src/app.ts`

---

## Debugging Tips

### Inspect Database

```bash
sqlite3 gateway.db
.tables                                           # List all tables
.schema services                                   # View table schema
SELECT * FROM services;                            # View all services
SELECT gateway_status, COUNT(*) FROM requests GROUP BY gateway_status;
```

### Test Payment Flow

1. Start services: `pnpm dev`
2. Open Admin UI: `http://localhost:5173`
3. Create a service
4. Use Payment Test page to test

### Simulate Agent Requests

```bash
# Trigger 402
curl -v http://localhost:8402/echo/test \
  -H "X-Agent-Address: 0x4BC5eAfA7fD9A6e6F60A8bE11102589E4Fd15646"

# View service list
curl http://localhost:8403/services \
  -H "Authorization: Bearer change-me-in-production"
```

### Reset Database

```bash
# Delete database file (auto-rebuilt on restart)
rm gateway.db
```

---

## Package Dependencies

```
shared ← chain ← facilitator ← core ← admin-api
                                  ↑
                              admin-ui (HTTP)
```

Changes to `shared` require rebuilding all dependent packages. Turborepo handles this automatically.
