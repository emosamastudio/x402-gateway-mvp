export type Network = "base-sepolia" | "polygon-amoy";

export interface Service {
  id: string;
  name: string;
  backendUrl: string;
  priceAmount: string;   // e.g. "0.001" (human-readable USDC)
  priceCurrency: "USDC";
  network: Network;
  recipient: string;     // Provider wallet address (checksummed)
  minReputation: number; // 0 = no restriction
  createdAt: number;     // Unix timestamp
}

export interface Payment {
  id: string;
  serviceId: string;
  agentAddress: string;
  txHash: string;
  network: Network;
  amount: string;
  status: "settled" | "failed";
  createdAt: number;
}

export interface AgentInfo {
  address: string;
  isRegistered: boolean;
  reputation: number;
  cachedAt: number;
}

export interface PaymentRequirement {
  network: Network;
  maxAmountRequired: string; // USDC in smallest unit (6 decimals), e.g. "1000" = $0.001
  resource: string;
  description: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;             // USDC contract address
}

export interface TransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;             // bytes32 hex
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: Network;
  payload: {
    signature: string;
    authorization: TransferAuthorization;
  };
}

export interface VerifyResult {
  isValid: boolean;
  error?: string;
}

export interface SettleResult {
  txHash: string;
  network: Network;
}
