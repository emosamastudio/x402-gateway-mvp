import type { Network } from "@x402-gateway/shared";

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

// In-memory mock store — replace with real contract calls in v2
const jobs = new Map<string, Job>();

export function createJob(params: Omit<Job, "id" | "status" | "createdAt">): Job {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const job: Job = { ...params, id, status: "open", createdAt: Date.now() };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJobStatus(id: string, status: JobStatus, deliverableHash?: string): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job ${id} not found`);
  const updated = { ...job, status, ...(deliverableHash ? { deliverableHash } : {}) };
  jobs.set(id, updated);
  return updated;
}
