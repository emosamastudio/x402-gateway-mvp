import type { Network } from "@x402-gateway-mvp/shared";

export type JobStatus = "open" | "funded" | "submitted" | "completed";

export interface Job {
  id: string;
  client: string;
  provider: string;
  evaluator: string;
  amount: string;
  network: Network;
  status: JobStatus;
  deliverableHash?: string;
  createdAt: number;
}

// ──────────────────────────────────────────────────────────────────
// ERC-8183 Job Management — Stub / TODO
// ──────────────────────────────────────────────────────────────────
// These functions are placeholders for the v2 on-chain job system.
// They will be backed by DB persistence + smart contract calls.
// Currently NOT wired to any route or middleware.
// ──────────────────────────────────────────────────────────────────

export function createJob(_params: Omit<Job, "id" | "status" | "createdAt">): Job {
  throw new Error("ERC-8183 job system not yet implemented. See erc8183.ts");
}

export function getJob(_id: string): Job | undefined {
  throw new Error("ERC-8183 job system not yet implemented. See erc8183.ts");
}

export function updateJobStatus(_id: string, _status: JobStatus, _deliverableHash?: string): Job {
  throw new Error("ERC-8183 job system not yet implemented. See erc8183.ts");
}
