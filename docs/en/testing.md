# Testing Guide

x402-gateway-mvp uses [Vitest](https://vitest.dev/) as its test framework, currently with 7 test files and 25 test cases.

---

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
cd packages/core && pnpm test
cd packages/facilitator && pnpm test
cd packages/chain && pnpm test
cd packages/admin-api && pnpm test

# Watch mode
cd packages/core && npx vitest --watch
```

---

## Test Configuration

Each package configures Vitest via `package.json` scripts:

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

No separate `vitest.config.ts` needed. Vitest auto-discovers `.test.ts` files in `__tests__/` directories.

---

## Test Coverage Overview

### @x402-gateway-mvp/admin-api (3 tests)

**File**: `packages/admin-api/src/__tests__/services.test.ts`

| Suite | Test Case |
|-------|-----------|
| POST /services | Creates a service with valid input |
| POST /services | Rejects invalid input |
| GET /services | Returns empty array when no services |

**Coverage**: Service CRUD API input validation and basic functionality.

---

### @x402-gateway-mvp/facilitator (10 tests)

**File 1**: `packages/facilitator/src/__tests__/verify.test.ts`

| Suite | Test Case |
|-------|-----------|
| verifyPayment | Returns valid=true when signature and amounts are correct |
| verifyPayment | Returns valid=false when signature is invalid |
| verifyPayment | Returns valid=false when payment amount is too low |
| verifyPayment | Returns valid=false when payment has expired |
| verifyPayment | Returns valid=false when payment is not yet valid |
| verifyPayment | Returns valid=false when payment network does not match |

**File 2**: `packages/facilitator/src/__tests__/nonce.test.ts`

| Suite | Test Case |
|-------|-----------|
| NonceStore | Marks a new nonce as unused |
| NonceStore | Marks a nonce as used after registration |
| NonceStore | Different nonces are independent |
| NonceStore | Treats mixed-case nonces as the same |

**Coverage**: Core payment verification logic (signature, amount, timing, network, nonce) + nonce replay protection store.

---

### @x402-gateway-mvp/chain (3 tests)

**File**: `packages/chain/src/__tests__/erc8004.test.ts`

| Suite | Test Case |
|-------|-----------|
| checkAgentIdentity | Returns registered=true and reputation when agent is registered |
| checkAgentIdentity | Returns registered=true when ERC8004_MOCK=true |
| checkAgentIdentity | Returns registered=false when no contract address configured |

**Coverage**: ERC-8004 identity query in three scenarios.

---

### @x402-gateway-mvp/core (9 tests)

**File 1**: `packages/core/src/__tests__/db.test.ts`

| Suite | Test Case |
|-------|-----------|
| Database | Inserts and retrieves a service |
| Database | Lists all services |
| Database | Inserts and queries payments |
| Database | Upserts and retrieves agent cache |

**File 2**: `packages/core/src/__tests__/identity.test.ts`

| Suite | Test Case |
|-------|-----------|
| identityMiddleware | Returns 403 when agent is not registered |
| identityMiddleware | Returns 403 when agent reputation is below threshold |
| identityMiddleware | Passes through when agent is registered with sufficient reputation |

**File 3**: `packages/core/src/__tests__/x402.test.ts`

| Suite | Test Case |
|-------|-----------|
| x402Middleware | Returns 402 when no PAYMENT-SIGNATURE header |
| x402Middleware | Calls next when valid PAYMENT-SIGNATURE header is present |

**Coverage**: Database CRUD, identity middleware, payment middleware.

---

## Test Structure

Each package's tests are located in `src/__tests__/`:

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

## Writing Tests

### Basic Pattern

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("functionName", () => {
  beforeEach(() => {
    // Setup test environment
  });

  it("should do something when condition", () => {
    const result = functionName(input);
    expect(result).toBe(expected);
  });
});
```

### Mocking External Dependencies

```typescript
import { vi } from "vitest";

// Mock module
vi.mock("@x402-gateway-mvp/chain", () => ({
  checkAgentIdentity: vi.fn().mockResolvedValue({
    isRegistered: true,
    reputation: 100,
  }),
}));
```

### Database Tests

Use in-memory SQLite (pass `:memory:` path):

```typescript
import { createDb } from "../db.js";

const db = createDb(":memory:");
// Database auto-creates all tables + seed data
```

---

## Test Statistics

| Package | Test Files | Tests | Coverage Area |
|---------|-----------|-------|--------------|
| admin-api | 1 | 3 | Service CRUD |
| facilitator | 2 | 10 | Verify + Nonce |
| chain | 1 | 3 | ERC-8004 Identity |
| core | 3 | 9 | DB + Identity + x402 |
| **Total** | **7** | **25** | |

---

## Uncovered Areas

The following modules currently lack automated tests and are recommended for future coverage:

- **settle.ts** — On-chain settlement (requires mocking viem writeContract)
- **proxy.ts** — HTTP proxy forwarding
- **rpc-health.ts** — RPC health checking
- **admin-ui** — Frontend components (can use React Testing Library)
- **Integration tests** — End-to-end payment flow (can use scripts/demo.ts as base)
