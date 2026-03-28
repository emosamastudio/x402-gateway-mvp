/** Chain slug — dynamically configured via admin UI (e.g. "optimism-sepolia", "base-mainnet") */
export type Network = string;

/* ────────────────── Chain & Token configuration ────────────────── */

export interface ChainConfig {
  id: string;              // slug: "optimism-sepolia"
  name: string;            // "Optimism Sepolia"
  chainId: number;         // EVM chain ID (11155420)
  rpcUrl: string;          // JSON-RPC endpoint
  explorerUrl: string;     // Block explorer base URL (empty = none)
  isTestnet: boolean;
  nativeCurrency: string;  // symbol: "ETH"
  erc8004Identity: string; // ERC-8004 contract address (empty = none)
  createdAt: number;
}

export interface TokenConfig {
  id: string;              // "dmhkd-optimism-sepolia"
  symbol: string;          // "DMHKD"
  name: string;            // "DMHKD Stablecoin"
  chainSlug: string;       // FK → ChainConfig.id
  contractAddress: string; // token contract on that chain
  decimals: number;        // typically 6
  domainName: string;      // EIP-712 domain name (from token's name())
  domainVersion: string;   // EIP-712 domain version ("1" or "2")
  isActive: boolean;       // available for payments?
  createdAt: number;
}

export type RpcHealthStatus = "healthy" | "degraded" | "down" | "unknown";

export interface RpcEndpoint {
  id: string;              // UUID
  chainSlug: string;       // FK → ChainConfig.id
  url: string;             // RPC endpoint URL
  label: string;           // e.g. "Alchemy Primary", "Infura Backup"
  priority: number;        // lower = preferred (0 = highest priority)
  isActive: boolean;
  healthStatus: RpcHealthStatus;
  lastHealthCheck: number; // Unix ms (0 = never)
  lastLatency: number;     // ms (-1 = unknown)
  totalRequests: number;
  totalErrors: number;
  createdAt: number;
}

export type GatewayStatus =
  | "unauthorized"       // 403 — identity check failed
  | "payment_required"   // 402 — awaiting payment (challenge issued)
  | "payment_rejected"   // 402 — payment invalid (bad sig / expired / etc.)
  | "verifying"          // Payment verified, proxying to backend
  | "proxy_error"        // 502/504 — backend unreachable/timeout
  | "backend_error"      // Backend returned non-2xx
  | "settling"           // Backend 2xx, settlement in progress
  | "settled"            // Settlement tx confirmed
  | "settlement_failed"  // Settlement tx failed
  | "success";           // Complete (no payment required path)

export interface GatewayRequest {
  id: string;
  serviceId: string;
  agentAddress: string;        // "" if not provided (missing header)
  method: string;              // GET, POST, etc.
  path: string;                // Gateway path, e.g. "/echo/test"
  network: Network;
  gatewayStatus: GatewayStatus;
  httpStatus: number;          // Final HTTP status returned to the client
  responseStatus: number;      // Backend HTTP status (0 if never reached backend)
  responseBody: string;        // Backend response (truncated to 4KB; empty if never reached)
  errorReason: string;         // Human-readable reason for failure ("" if success)
  paymentId: string;           // Associated payment ID ("" if no payment)
  // Lifecycle timestamps (0 = phase not reached)
  challengeAt: number;         // When 402 challenge was issued
  verifiedAt: number;          // When payment was verified
  proxyAt: number;             // When backend response was received
  settledAt: number;           // When settlement completed (or failed)
  createdAt: number;
}

export interface ServiceProvider {
  id: string;            // "prov_<uuid>"
  name: string;          // e.g. "Acme AI Services"
  walletAddress: string; // EVM address — default payment recipient
  description: string;   // Short description (empty = none)
  website: string;       // URL (empty = none)
  createdAt: number;     // Unix timestamp
}

export interface Service {
  id: string;
  providerId: string;    // FK → ServiceProvider.id (empty = legacy/unassigned)
  name: string;
  gatewayPath: string;   // Custom gateway route, e.g. "/echo" or "/api/weather"
  backendUrl: string;
  priceAmount: string;   // e.g. "0.001" (human-readable token amount)
  priceCurrency: string; // token symbol — e.g. "DMHKD", "USDC"
  network: Network;      // chain slug — e.g. "optimism-sepolia"
  tokenId: string;       // FK → TokenConfig.id, e.g. "dmhkd-optimism-sepolia"
  recipient: string;     // Payment recipient (overrides Provider wallet if set)
  apiKey: string;        // Optional API key forwarded to backend (empty = none)
  minReputation: number; // 0 = no restriction
  createdAt: number;     // Unix timestamp
}

export interface Payment {
  id: string;
  requestId: string;           // Associated request ID
  serviceId: string;
  agentAddress: string;
  txHash: string;
  network: Network;
  amount: string;
  status: "settled" | "failed";
  settlementError: string;     // Empty if settled OK, error message if failed
  createdAt: number;
}

export interface AgentInfo {
  address: string;
  isRegistered: boolean;
  reputation: number;
  cachedAt: number;
}

export interface PaymentRequirement {
  network: Network;          // chain slug
  chainId: number;           // EVM chain ID (for wallet network switching)
  maxAmountRequired: string; // token in smallest unit (e.g. 6 decimals: "1000" = 0.001)
  resource: string;
  description: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;             // token contract address
  assetSymbol: string;       // token symbol for display (e.g. "DMHKD")
  assetDecimals: number;     // token decimals (e.g. 6)
  domainSeparator: string;   // EIP-712 domain separator (bytes32 hex), read from contract DOMAIN_SEPARATOR()
  domainName: string;        // EIP-712 domain name (e.g. "DMHKD")
  domainVersion: string;     // EIP-712 domain version (e.g. "2")
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
