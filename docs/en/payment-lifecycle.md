# Payment Lifecycle

## Overview

The x402 gateway uses a **single-record lifecycle model**: each API call produces one request record that is updated as processing phases progress. Each record has 4 lifecycle timestamps recording when each phase completed.

---

## GatewayStatus Definitions

There are 10 statuses in three categories:

### Terminal States (Request Complete)

| Status | HTTP Code | Description |
|--------|-----------|-------------|
| `success` | 200 | Request succeeded, no payment required (free route) |
| `settled` | 200 | Request succeeded, on-chain settlement confirmed |
| `settlement_failed` | 200 | Request succeeded but settlement transaction failed (Agent already received response) |

### Error States

| Status | HTTP Code | Description |
|--------|-----------|-------------|
| `unauthorized` | 403 | Identity check failed (missing address header / not registered / insufficient reputation) |
| `payment_rejected` | 402 | Payment invalid (bad signature / insufficient amount / expired / replay) |
| `proxy_error` | 502/504 | Backend unreachable or timeout |
| `backend_error` | varies | Backend returned non-2xx status |

### Intermediate States (In Progress)

| Status | Description |
|--------|-------------|
| `payment_required` | 402 challenge sent, waiting for Agent to retry with payment |
| `verifying` | Payment signature verified, proxying to backend |
| `settling` | Backend returned 2xx, broadcasting on-chain settlement transaction |

---

## Complete State Machine

```
                        ┌──────────────┐
                        │   Request    │
                        │   Arrives    │
                        └──────┬───────┘
                               │
                    ┌──────────▼──────────┐
                    │  Identity Middleware │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
                  Fail                   Pass
                    │                     │
                    ▼                     ▼
            ┌──────────────┐    ┌─────────────────┐
            │ unauthorized │    │  x402 Middleware │
            │    (403)     │    └────────┬────────┘
            └──────────────┘             │
                              ┌──────────┴──────────┐
                              │                     │
                         No payment            Has payment
                         header                header
                              │                     │
                              ▼                     ▼
                    ┌──────────────────┐  ┌─────────────────┐
                    │ payment_required │  │ Verify payment  │
                    │     (402)        │  │ signature       │
                    └──────────────────┘  └────────┬────────┘
                              ▲                    │
                              │         ┌──────────┴──────────┐
                              │         │                     │
                              │       Failed                Passed
                              │         │                     │
                              │         ▼                     ▼
                              │  ┌────────────────┐  ┌──────────────┐
                              │  │payment_rejected│  │  verifying   │
                              │  │    (402)       │  └──────┬───────┘
                              │  └────────────────┘         │
                              │                    ┌────────▼────────┐
                              │                    │  Proxy to       │
                              │                    │  Backend        │
                              │                    └────────┬────────┘
                              │                             │
                              │              ┌──────────────┼──────────────┐
                              │              │              │              │
                              │          Unreachable     Non-2xx        2xx
                              │              │              │              │
                              │              ▼              ▼              │
                              │      ┌─────────────┐ ┌──────────────┐     │
                              │      │ proxy_error │ │backend_error │     │
                              │      │  (502/504)  │ │   (varies)   │     │
                              │      └─────────────┘ └──────────────┘     │
                              │                                           │
                              │                                ┌──────────┴──────────┐
                              │                                │                     │
                              │                           No payment           Has payment
                              │                                │                     │
                              │                                ▼                     ▼
                              │                        ┌──────────────┐     ┌──────────────┐
                              │                        │   success    │     │   settling   │
                              │                        │    (200)     │     └──────┬───────┘
                              │                        └──────────────┘            │
                              │                                         ┌──────────┴──────────┐
                              │                                         │                     │
                              │                                       OK                    Fail
                              │                                         │                     │
                              │                                         ▼                     ▼
                              │                                 ┌──────────────┐  ┌────────────────────┐
                              │                                 │   settled    │  │ settlement_failed  │
                              │                                 │    (200)     │  │       (200)        │
                              │                                 └──────────────┘  └────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │  Agent retries     │
                    │  with payment      │
                    └────────────────────┘
```

---

## Lifecycle Timestamps

Each `GatewayRequest` record contains 4 timestamp fields (Unix milliseconds). A value of 0 means the phase was not reached:

| Field | Description | When Set |
|-------|-------------|----------|
| `challengeAt` | When 402 challenge was issued | x402 middleware returns 402 |
| `verifiedAt` | When payment signature was verified | x402 middleware verification passes |
| `proxyAt` | When backend response (or proxy error) occurred | Backend responds / proxy fails |
| `settledAt` | When on-chain settlement completed (or failed) | After `settlePayment` returns |

### Timestamp Coverage by Status

| Status | challengeAt | verifiedAt | proxyAt | settledAt |
|--------|:-----------:|:----------:|:-------:|:---------:|
| `unauthorized` | 0 | 0 | 0 | 0 |
| `payment_required` | ✓ | 0 | 0 | 0 |
| `payment_rejected` | ✓ | 0 | 0 | 0 |
| `verifying` | ✓ | ✓ | 0 | 0 |
| `proxy_error` | ✓ | ✓ | ✓ | 0 |
| `backend_error` | ✓ | ✓ | ✓ | 0 |
| `settling` | ✓ | ✓ | ✓ | 0 |
| `settled` | ✓ | ✓ | ✓ | ✓ |
| `settlement_failed` | ✓ | ✓ | ✓ | ✓ |
| `success` | 0 | 0 | ✓ | 0 |

> `success` is the no-payment path, only `proxyAt` is set.

---

## Request Record Correlation

When the Agent first requests (no payment header), the gateway creates a `payment_required` record. When the Agent retries with a payment header, the gateway correlates to the same record using:

1. **Same `serviceId`** — same service
2. **Same `agentAddress`** — same Agent
3. **Status is `payment_required`** — still waiting for payment
4. **Created within 5 minutes** — prevents correlating to stale old records

SQL query (`findPendingRequest`):
```sql
SELECT * FROM requests
WHERE service_id = ? AND agent_address = ?
  AND gateway_status = 'payment_required'
  AND created_at > (now - 300000)
ORDER BY created_at DESC
LIMIT 1
```

If no matching record is found (e.g., beyond the 5-minute window), a new record is created.

---

## Frontend Lifecycle Display

The Admin UI Requests page shows:

### Stats Panel
- **Completion rate**: `(settled + success) / total × 100%`
- **In progress**: count of `payment_required + verifying + settling` records
- **Failed**: count of `unauthorized + payment_rejected + proxy_error + backend_error + settlement_failed` records

### Filter Tabs
- **All** — all records
- **Completed** — `settled` + `success`
- **In Progress** — `payment_required` + `verifying` + `settling`
- **Failed** — `unauthorized` + `payment_rejected` + `proxy_error` + `backend_error` + `settlement_failed`

### Lifecycle Timeline
Each expanded record shows a 4-phase visual timeline:

```
  📋 Challenge  →  🔍 Verify   →  🔀 Proxy    →  💰 Settle
  14:23:01        14:23:04       14:23:05       14:23:08
                    3s              1s              3s
```

- Reached phases show timestamps and icons
- Duration between phases is displayed
- Unreached phases appear as grey placeholders

---

## Payment Record

After settlement completes (success or failure), the gateway also creates a `Payment` record:

| Field | Description |
|-------|-------------|
| `id` | `pay_<uuid>` |
| `requestId` | Associated request record ID |
| `serviceId` | Service ID |
| `agentAddress` | Agent address |
| `txHash` | On-chain transaction hash (may be empty on failure) |
| `network` | Chain identifier |
| `amount` | Payment amount (human-readable, e.g., "0.001") |
| `status` | `"settled"` or `"failed"` |
| `settlementError` | Error message on failure |
| `createdAt` | Creation timestamp |
