import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import type { Service, Payment, AgentInfo, GatewayRequest, ChainConfig, TokenConfig, RpcEndpoint, ServiceProvider, ServicePaymentScheme, Network } from "@x402-gateway-mvp/shared";
import { slugify } from "@x402-gateway-mvp/shared";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  rpc_url TEXT NOT NULL,
  explorer_url TEXT NOT NULL DEFAULT '',
  is_testnet INTEGER NOT NULL DEFAULT 0,
  native_currency TEXT NOT NULL DEFAULT 'ETH',
  erc8004_identity TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  chain_slug TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 6,
  domain_name TEXT NOT NULL DEFAULT '',
  domain_version TEXT NOT NULL DEFAULT '1',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  gateway_path TEXT NOT NULL DEFAULT '/',
  backend_url TEXT NOT NULL,
  price_amount TEXT NOT NULL DEFAULT '',
  price_currency TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT '',
  token_id TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  min_reputation INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  agent_address TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT '',
  gateway_status TEXT NOT NULL DEFAULT '',
  http_status INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER NOT NULL DEFAULT 0,
  response_body TEXT NOT NULL DEFAULT '',
  error_reason TEXT NOT NULL DEFAULT '',
  payment_id TEXT NOT NULL DEFAULT '',
  challenge_at INTEGER NOT NULL DEFAULT 0,
  verified_at INTEGER NOT NULL DEFAULT 0,
  proxy_at INTEGER NOT NULL DEFAULT 0,
  settled_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL DEFAULT '',
  service_id TEXT NOT NULL,
  agent_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  network TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT NOT NULL,
  settlement_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_cache (
  address TEXT PRIMARY KEY,
  is_registered INTEGER NOT NULL,
  reputation INTEGER NOT NULL,
  cached_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rpc_endpoints (
  id TEXT PRIMARY KEY,
  chain_slug TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_health_check INTEGER NOT NULL DEFAULT 0,
  last_latency INTEGER NOT NULL DEFAULT -1,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rpc_stats_history (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  chain_slug TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  latency INTEGER NOT NULL DEFAULT -1,
  health_status TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_rpc_stats_chain_time ON rpc_stats_history (chain_slug, timestamp);
CREATE INDEX IF NOT EXISTS idx_rpc_stats_endpoint_time ON rpc_stats_history (endpoint_id, timestamp);

CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  network TEXT NOT NULL DEFAULT '',
  agent_address TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS service_payment_schemes (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  network TEXT NOT NULL,
  token_id TEXT NOT NULL,
  price_amount TEXT NOT NULL,
  price_currency TEXT NOT NULL,
  recipient TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schemes_service_id
  ON service_payment_schemes (service_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schemes_service_network_token
  ON service_payment_schemes (service_id, network, token_id);
`;

export function createDb(path: string) {
  const db = new Database(path);
  db.exec(SCHEMA);

  // ── Auto-migrate: services table ───────────────────────────────────
  const cols = db.prepare("PRAGMA table_info(services)").all() as any[];
  if (!cols.some((c: any) => c.name === "gateway_path")) {
    db.exec("ALTER TABLE services ADD COLUMN gateway_path TEXT NOT NULL DEFAULT '/'");
  }
  if (!cols.some((c: any) => c.name === "api_key")) {
    db.exec("ALTER TABLE services ADD COLUMN api_key TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c: any) => c.name === "token_id")) {
    db.exec("ALTER TABLE services ADD COLUMN token_id TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.some((c: any) => c.name === "provider_id")) {
    db.exec("ALTER TABLE services ADD COLUMN provider_id TEXT NOT NULL DEFAULT ''");
  }

  // ── Auto-migrate: payments table ───────────────────────────────────
  const payCols = db.prepare("PRAGMA table_info(payments)").all() as any[];
  if (!payCols.some((c: any) => c.name === "request_id")) {
    db.exec("ALTER TABLE payments ADD COLUMN request_id TEXT NOT NULL DEFAULT ''");
  }
  if (!payCols.some((c: any) => c.name === "settlement_error")) {
    db.exec("ALTER TABLE payments ADD COLUMN settlement_error TEXT NOT NULL DEFAULT ''");
  }

  // ── Unique index on tokens (chain_slug, contract_address) ──────────
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_chain_contract ON tokens (chain_slug, contract_address COLLATE NOCASE)");

  // ── Unique index on rpc_endpoints (chain_slug, url) ────────────────
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_rpc_chain_url ON rpc_endpoints (chain_slug, url COLLATE NOCASE)");

  // ── Seed default chains if table is empty ──────────────────────────
  const chainCount = (db.prepare("SELECT COUNT(*) as cnt FROM chains").get() as any).cnt;
  if (chainCount === 0) {
    const now = Date.now();
    db.prepare(`INSERT INTO chains (id, name, chain_id, rpc_url, explorer_url, is_testnet, native_currency, erc8004_identity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "optimism-sepolia", "Optimism Sepolia", 11155420,
      process.env.OPTIMISM_SEPOLIA_RPC ?? "https://sepolia.optimism.io",
      "https://sepolia-optimism.etherscan.io", 1, "ETH",
      process.env.OPTIMISM_SEPOLIA_ERC8004_IDENTITY ?? "", now,
    );
    db.prepare(`INSERT INTO chains (id, name, chain_id, rpc_url, explorer_url, is_testnet, native_currency, erc8004_identity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "sepolia", "Ethereum Sepolia", 11155111,
      process.env.SEPOLIA_RPC ?? "https://rpc.sepolia.org",
      "https://sepolia.etherscan.io", 1, "ETH",
      process.env.SEPOLIA_ERC8004_IDENTITY ?? "", now,
    );
  }

  // ── Seed default tokens if table is empty ──────────────────────────
  const tokenCount = (db.prepare("SELECT COUNT(*) as cnt FROM tokens").get() as any).cnt;
  if (tokenCount === 0) {
    const now = Date.now();
    db.prepare(`INSERT INTO tokens (id, symbol, name, chain_slug, contract_address, decimals, domain_name, domain_version, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "dmhkd-optimism-sepolia", "DMHKD", "DMHKD Stablecoin", "optimism-sepolia",
      process.env.OPTIMISM_SEPOLIA_DMHKD ?? "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6",
      6, "DMHKD", "2", 1, now,
    );
    db.prepare(`INSERT INTO tokens (id, symbol, name, chain_slug, contract_address, decimals, domain_name, domain_version, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "dmhkd-sepolia", "DMHKD", "DMHKD Stablecoin", "sepolia",
      process.env.SEPOLIA_DMHKD ?? "0x1aA90392c804343C7854DD700f50a48961B71c53",
      6, "DMHKD", "2", 1, now,
    );
  }

  // ── Auto-populate token_id for existing services ───────────────────
  db.prepare(`
    UPDATE services SET token_id = LOWER(price_currency) || '-' || network
    WHERE token_id = '' AND price_currency != '' AND network != ''
  `).run();

  // ── Auto-seed RPC endpoints from chains' rpcUrl ────────────────────
  // For each chain that has a rpcUrl but no rpc_endpoints rows, create one
  const chainsWithoutEndpoints = db.prepare(`
    SELECT c.id, c.rpc_url FROM chains c
    WHERE c.rpc_url != '' AND NOT EXISTS (SELECT 1 FROM rpc_endpoints r WHERE r.chain_slug = c.id)
  `).all() as any[];
  for (const c of chainsWithoutEndpoints) {
    const id = `rpc_${c.id}_${Date.now()}`;
    db.prepare(`INSERT INTO rpc_endpoints (id, chain_slug, url, label, priority, is_active, health_status, last_health_check, last_latency, total_requests, total_errors, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, c.id, c.rpc_url, "Primary", 0, 1, "unknown", 0, -1, 0, 0, Date.now()
    );
  }

  // ── Backfill: migrate existing service payment fields to schemes table ─────
  db.prepare(`
    INSERT OR IGNORE INTO service_payment_schemes
      (id, service_id, network, token_id, price_amount, price_currency, recipient, created_at)
    SELECT
      'scheme_migrated_' || id,
      id,
      network,
      token_id,
      price_amount,
      price_currency,
      recipient,
      created_at
    FROM services
    WHERE network != ''
      AND price_amount != ''
      AND token_id != ''
      AND NOT EXISTS (
        SELECT 1 FROM service_payment_schemes WHERE service_id = services.id
      )
  `).run();

  return {
    // ── Chains ─────────────────────────────────────────────────────
    insertChain(chain: ChainConfig) {
      db.prepare(`
        INSERT INTO chains (id, name, chain_id, rpc_url, explorer_url, is_testnet, native_currency, erc8004_identity, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(chain.id, chain.name, chain.chainId, chain.rpcUrl, chain.explorerUrl,
             chain.isTestnet ? 1 : 0, chain.nativeCurrency, chain.erc8004Identity, chain.createdAt);
    },

    getChain(id: string): ChainConfig | undefined {
      const row = db.prepare("SELECT * FROM chains WHERE id = ?").get(id) as any;
      return row ? rowToChain(row) : undefined;
    },

    listChains(): ChainConfig[] {
      return (db.prepare("SELECT * FROM chains ORDER BY created_at ASC").all() as any[]).map(rowToChain);
    },

    updateChain(id: string, updates: Partial<Omit<ChainConfig, "id" | "createdAt">>): boolean {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
      if (updates.chainId !== undefined) { fields.push("chain_id = ?"); values.push(updates.chainId); }
      if (updates.rpcUrl !== undefined) { fields.push("rpc_url = ?"); values.push(updates.rpcUrl); }
      if (updates.explorerUrl !== undefined) { fields.push("explorer_url = ?"); values.push(updates.explorerUrl); }
      if (updates.isTestnet !== undefined) { fields.push("is_testnet = ?"); values.push(updates.isTestnet ? 1 : 0); }
      if (updates.nativeCurrency !== undefined) { fields.push("native_currency = ?"); values.push(updates.nativeCurrency); }
      if (updates.erc8004Identity !== undefined) { fields.push("erc8004_identity = ?"); values.push(updates.erc8004Identity); }
      if (fields.length === 0) return false;
      values.push(id);
      return db.prepare(`UPDATE chains SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
    },

    deleteChain(id: string): boolean {
      return db.prepare("DELETE FROM chains WHERE id = ?").run(id).changes > 0;
    },

    // ── Service Providers ─────────────────────────────────────────
    insertProvider(p: ServiceProvider): void {
      db.prepare(`
        INSERT INTO service_providers (id, name, wallet_address, description, website, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(p.id, p.name, p.walletAddress, p.description, p.website, p.createdAt);
    },

    getProvider(id: string): ServiceProvider | undefined {
      const row = db.prepare("SELECT * FROM service_providers WHERE id = ?").get(id) as any;
      return row ? rowToProvider(row) : undefined;
    },

    getProviderByWallet(walletAddress: string): ServiceProvider | undefined {
      const row = db.prepare(
        "SELECT * FROM service_providers WHERE LOWER(wallet_address) = LOWER(?)"
      ).get(walletAddress) as any;
      return row ? rowToProvider(row) : undefined;
    },

    listProviders(): ServiceProvider[] {
      return (db.prepare("SELECT * FROM service_providers ORDER BY created_at ASC").all() as any[]).map(rowToProvider);
    },

    listServicesByProvider(providerId: string): Service[] {
      return (db.prepare("SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC").all(providerId) as any[]).map(rowToService);
    },

    updateProvider(id: string, updates: Partial<Pick<ServiceProvider, "name" | "walletAddress" | "description" | "website">>): boolean {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
      if (updates.walletAddress !== undefined) { fields.push("wallet_address = ?"); values.push(updates.walletAddress); }
      if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
      if (updates.website !== undefined) { fields.push("website = ?"); values.push(updates.website); }
      if (fields.length === 0) return false;
      values.push(id);
      return db.prepare(`UPDATE service_providers SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
    },

    deleteProvider(id: string): boolean {
      return db.prepare("DELETE FROM service_providers WHERE id = ?").run(id).changes > 0;
    },

    // ── Tokens ─────────────────────────────────────────────────────
    insertToken(token: TokenConfig) {
      db.prepare(`
        INSERT INTO tokens (id, symbol, name, chain_slug, contract_address, decimals, domain_name, domain_version, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(token.id, token.symbol, token.name, token.chainSlug, token.contractAddress,
             token.decimals, token.domainName, token.domainVersion, token.isActive ? 1 : 0, token.createdAt);
    },

    getToken(id: string): TokenConfig | undefined {
      const row = db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as any;
      return row ? rowToToken(row) : undefined;
    },

    getTokenByChainAndAddress(chainSlug: string, contractAddress: string): TokenConfig | undefined {
      const row = db.prepare(
        "SELECT * FROM tokens WHERE chain_slug = ? AND LOWER(contract_address) = LOWER(?)"
      ).get(chainSlug, contractAddress) as any;
      return row ? rowToToken(row) : undefined;
    },

    listTokens(): TokenConfig[] {
      return (db.prepare("SELECT * FROM tokens ORDER BY created_at ASC").all() as any[]).map(rowToToken);
    },

    updateToken(id: string, updates: Partial<Omit<TokenConfig, "id" | "createdAt">>): boolean {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.symbol !== undefined) { fields.push("symbol = ?"); values.push(updates.symbol); }
      if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
      if (updates.chainSlug !== undefined) { fields.push("chain_slug = ?"); values.push(updates.chainSlug); }
      if (updates.contractAddress !== undefined) { fields.push("contract_address = ?"); values.push(updates.contractAddress); }
      if (updates.decimals !== undefined) { fields.push("decimals = ?"); values.push(updates.decimals); }
      if (updates.domainName !== undefined) { fields.push("domain_name = ?"); values.push(updates.domainName); }
      if (updates.domainVersion !== undefined) { fields.push("domain_version = ?"); values.push(updates.domainVersion); }
      if (updates.isActive !== undefined) { fields.push("is_active = ?"); values.push(updates.isActive ? 1 : 0); }
      if (fields.length === 0) return false;
      values.push(id);
      return db.prepare(`UPDATE tokens SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
    },

    deleteToken(id: string): boolean {
      return db.prepare("DELETE FROM tokens WHERE id = ?").run(id).changes > 0;
    },

    // ── RPC Endpoints ────────────────────────────────────────────────
    insertRpcEndpoint(ep: RpcEndpoint) {
      db.prepare(`
        INSERT INTO rpc_endpoints (id, chain_slug, url, label, priority, is_active, health_status, last_health_check, last_latency, total_requests, total_errors, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ep.id, ep.chainSlug, ep.url, ep.label, ep.priority, ep.isActive ? 1 : 0,
             ep.healthStatus, ep.lastHealthCheck, ep.lastLatency, ep.totalRequests, ep.totalErrors, ep.createdAt);
    },

    getRpcEndpoint(id: string): RpcEndpoint | undefined {
      const row = db.prepare("SELECT * FROM rpc_endpoints WHERE id = ?").get(id) as any;
      return row ? rowToRpcEndpoint(row) : undefined;
    },

    listRpcEndpoints(chainSlug?: string): RpcEndpoint[] {
      if (chainSlug) {
        return (db.prepare("SELECT * FROM rpc_endpoints WHERE chain_slug = ? ORDER BY priority ASC, created_at ASC").all(chainSlug) as any[]).map(rowToRpcEndpoint);
      }
      return (db.prepare("SELECT * FROM rpc_endpoints ORDER BY chain_slug, priority ASC, created_at ASC").all() as any[]).map(rowToRpcEndpoint);
    },

    getRpcEndpointByChainAndUrl(chainSlug: string, url: string): RpcEndpoint | undefined {
      const row = db.prepare(
        "SELECT * FROM rpc_endpoints WHERE chain_slug = ? AND LOWER(url) = LOWER(?)"
      ).get(chainSlug, url) as any;
      return row ? rowToRpcEndpoint(row) : undefined;
    },

    updateRpcEndpoint(id: string, updates: Partial<Omit<RpcEndpoint, "id" | "createdAt">>): boolean {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.url !== undefined) { fields.push("url = ?"); values.push(updates.url); }
      if (updates.label !== undefined) { fields.push("label = ?"); values.push(updates.label); }
      if (updates.priority !== undefined) { fields.push("priority = ?"); values.push(updates.priority); }
      if (updates.isActive !== undefined) { fields.push("is_active = ?"); values.push(updates.isActive ? 1 : 0); }
      if (updates.healthStatus !== undefined) { fields.push("health_status = ?"); values.push(updates.healthStatus); }
      if (updates.lastHealthCheck !== undefined) { fields.push("last_health_check = ?"); values.push(updates.lastHealthCheck); }
      if (updates.lastLatency !== undefined) { fields.push("last_latency = ?"); values.push(updates.lastLatency); }
      if (updates.totalRequests !== undefined) { fields.push("total_requests = ?"); values.push(updates.totalRequests); }
      if (updates.totalErrors !== undefined) { fields.push("total_errors = ?"); values.push(updates.totalErrors); }
      if (fields.length === 0) return false;
      values.push(id);
      return db.prepare(`UPDATE rpc_endpoints SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
    },

    incrementRpcStats(id: string, isError: boolean) {
      if (isError) {
        db.prepare("UPDATE rpc_endpoints SET total_requests = total_requests + 1, total_errors = total_errors + 1 WHERE id = ?").run(id);
      } else {
        db.prepare("UPDATE rpc_endpoints SET total_requests = total_requests + 1 WHERE id = ?").run(id);
      }
    },

    deleteRpcEndpoint(id: string): boolean {
      return db.prepare("DELETE FROM rpc_endpoints WHERE id = ?").run(id).changes > 0;
    },

    // ── RPC Stats History ─────────────────────────────────────────────
    insertRpcStatsSnapshot(row: {
      endpointId: string;
      chainSlug: string;
      timestamp: number;
      totalRequests: number;
      totalErrors: number;
      latency: number;
      healthStatus: string;
    }) {
      const id = `stat_${row.endpointId}_${row.timestamp}`;
      db.prepare(`
        INSERT OR IGNORE INTO rpc_stats_history (id, endpoint_id, chain_slug, timestamp, total_requests, total_errors, latency, health_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, row.endpointId, row.chainSlug, row.timestamp, row.totalRequests, row.totalErrors, row.latency, row.healthStatus);
    },

    getRpcStatsHistory(chainSlug: string, sinceMs?: number): Array<{
      id: string; endpointId: string; chainSlug: string; timestamp: number;
      totalRequests: number; totalErrors: number; latency: number; healthStatus: string;
    }> {
      const since = sinceMs ?? (Date.now() - 3600_000);
      const rows = db.prepare(`
        SELECT * FROM rpc_stats_history WHERE chain_slug = ? AND timestamp >= ? ORDER BY timestamp ASC
      `).all(chainSlug, since) as any[];
      return rows.map((r) => ({
        id: r.id, endpointId: r.endpoint_id, chainSlug: r.chain_slug,
        timestamp: r.timestamp, totalRequests: r.total_requests, totalErrors: r.total_errors,
        latency: r.latency, healthStatus: r.health_status,
      }));
    },

    pruneRpcStatsHistory(retainMs: number) {
      const cutoff = Date.now() - retainMs;
      db.prepare("DELETE FROM rpc_stats_history WHERE timestamp < ?").run(cutoff);
    },

    getRpcChainSummary(): Array<{
      chainSlug: string;
      endpointCount: number;
      healthyCount: number;
      degradedCount: number;
      downCount: number;
      totalRequests: number;
      totalErrors: number;
      avgLatency: number;
    }> {
      const rows = db.prepare(`
        SELECT
          chain_slug,
          COUNT(*) as endpoint_count,
          SUM(CASE WHEN health_status = 'healthy' THEN 1 ELSE 0 END) as healthy_count,
          SUM(CASE WHEN health_status = 'degraded' THEN 1 ELSE 0 END) as degraded_count,
          SUM(CASE WHEN health_status = 'down' THEN 1 ELSE 0 END) as down_count,
          SUM(total_requests) as total_requests,
          SUM(total_errors) as total_errors,
          AVG(CASE WHEN last_latency >= 0 THEN last_latency ELSE NULL END) as avg_latency
        FROM rpc_endpoints
        WHERE is_active = 1
        GROUP BY chain_slug
      `).all() as any[];
      return rows.map((r) => ({
        chainSlug: r.chain_slug,
        endpointCount: r.endpoint_count,
        healthyCount: r.healthy_count,
        degradedCount: r.degraded_count,
        downCount: r.down_count,
        totalRequests: r.total_requests ?? 0,
        totalErrors: r.total_errors ?? 0,
        avgLatency: r.avg_latency != null ? Math.round(r.avg_latency) : -1,
      }));
    },


    insertService(svc: Service) {
      db.prepare(`
        INSERT INTO services (id, provider_id, name, backend_url, api_key, min_reputation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(svc.id, svc.providerId ?? "", svc.name, svc.backendUrl, svc.apiKey, svc.minReputation, svc.createdAt);
    },

    getServiceById(id: string): Service | undefined {
      const row = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as any;
      return row ? rowToService(row) : undefined;
    },

    listServices(): Service[] {
      return (db.prepare("SELECT * FROM services ORDER BY created_at DESC").all() as any[])
        .map(rowToService);
    },

    updateService(id: string, updates: Partial<Pick<Service, "providerId" | "name" | "backendUrl" | "apiKey" | "minReputation">>): boolean {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.providerId !== undefined) { fields.push("provider_id = ?"); values.push(updates.providerId); }
      if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
      if (updates.backendUrl !== undefined) { fields.push("backend_url = ?"); values.push(updates.backendUrl); }
      if (updates.apiKey !== undefined) { fields.push("api_key = ?"); values.push(updates.apiKey); }
      if (updates.minReputation !== undefined) { fields.push("min_reputation = ?"); values.push(updates.minReputation); }
      if (fields.length === 0) return false;
      values.push(id);
      const result = db.prepare(`UPDATE services SET ${fields.join(", ")} WHERE id = ?`).run(...values);
      return result.changes > 0;
    },

    deleteService(id: string): boolean {
      db.prepare("DELETE FROM service_payment_schemes WHERE service_id = ?").run(id);
      const result = db.prepare("DELETE FROM services WHERE id = ?").run(id);
      return result.changes > 0;
    },

    // ── Service Payment Schemes ───────────────────────────────────────
    insertScheme(scheme: ServicePaymentScheme): void {
      db.prepare(`
        INSERT INTO service_payment_schemes (id, service_id, network, token_id, price_amount, price_currency, recipient, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(scheme.id, scheme.serviceId, scheme.network, scheme.tokenId, scheme.priceAmount, scheme.priceCurrency, scheme.recipient, scheme.createdAt);
    },

    getScheme(id: string): ServicePaymentScheme | undefined {
      const row = db.prepare("SELECT * FROM service_payment_schemes WHERE id = ?").get(id) as any;
      return row ? rowToScheme(row) : undefined;
    },

    listSchemesByService(serviceId: string): ServicePaymentScheme[] {
      return (db.prepare("SELECT * FROM service_payment_schemes WHERE service_id = ? ORDER BY created_at ASC").all(serviceId) as any[]).map(rowToScheme);
    },

    updateScheme(id: string, updates: Partial<Pick<ServicePaymentScheme, "priceAmount" | "recipient">>): boolean {
      const fields: string[] = [];
      const values: any[] = [];
      if (updates.priceAmount !== undefined) { fields.push("price_amount = ?"); values.push(updates.priceAmount); }
      if (updates.recipient !== undefined) { fields.push("recipient = ?"); values.push(updates.recipient); }
      if (fields.length === 0) return false;
      values.push(id);
      return db.prepare(`UPDATE service_payment_schemes SET ${fields.join(", ")} WHERE id = ?`).run(...values).changes > 0;
    },

    deleteScheme(id: string): boolean {
      return db.prepare("DELETE FROM service_payment_schemes WHERE id = ?").run(id).changes > 0;
    },

    deleteSchemesByService(serviceId: string): void {
      db.prepare("DELETE FROM service_payment_schemes WHERE service_id = ?").run(serviceId);
    },

    resolveSchemeByPath(
      providerSlug: string,
      serviceSlug: string,
      network: string,
      tokenSlug: string
    ): { service: Service; scheme: ServicePaymentScheme; provider: ServiceProvider } | undefined {
      const allProviders = db.prepare("SELECT * FROM service_providers ORDER BY created_at ASC").all() as any[];
      const provider = allProviders.map(rowToProvider).find(p => slugify(p.name) === providerSlug);
      if (!provider) return undefined;

      const allServices = db.prepare("SELECT * FROM services WHERE provider_id = ? ORDER BY created_at DESC").all(provider.id) as any[];
      const service = allServices.map(rowToService).find(s => slugify(s.name) === serviceSlug);
      if (!service) return undefined;

      const schemes = db.prepare("SELECT * FROM service_payment_schemes WHERE service_id = ? ORDER BY created_at ASC").all(service.id) as any[];
      for (const row of schemes) {
        const scheme = rowToScheme(row);
        if (scheme.network !== network) continue;
        const tokenRow = db.prepare("SELECT * FROM tokens WHERE id = ?").get(scheme.tokenId) as any;
        if (tokenRow && slugify(tokenRow.symbol) === tokenSlug) {
          return { provider, service, scheme };
        }
      }
      return undefined;
    },

    // ── Requests ─────────────────────────────────────────────────────
    insertRequest(r: GatewayRequest) {
      db.prepare(`
        INSERT INTO requests (id, service_id, agent_address, method, path, network, gateway_status, http_status, response_status, response_body, error_reason, payment_id, challenge_at, verified_at, proxy_at, settled_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(r.id, r.serviceId, r.agentAddress, r.method, r.path, r.network,
            r.gatewayStatus, r.httpStatus, r.responseStatus, r.responseBody,
            r.errorReason, r.paymentId, r.challengeAt, r.verifiedAt, r.proxyAt, r.settledAt, r.createdAt);
    },

    updateRequest(id: string, updates: Partial<GatewayRequest>) {
      const cols: string[] = [];
      const vals: any[] = [];
      if (updates.gatewayStatus !== undefined)  { cols.push("gateway_status = ?");  vals.push(updates.gatewayStatus); }
      if (updates.httpStatus !== undefined)     { cols.push("http_status = ?");     vals.push(updates.httpStatus); }
      if (updates.responseStatus !== undefined) { cols.push("response_status = ?"); vals.push(updates.responseStatus); }
      if (updates.responseBody !== undefined)   { cols.push("response_body = ?");   vals.push(updates.responseBody); }
      if (updates.errorReason !== undefined)    { cols.push("error_reason = ?");    vals.push(updates.errorReason); }
      if (updates.paymentId !== undefined)      { cols.push("payment_id = ?");      vals.push(updates.paymentId); }
      if (updates.agentAddress !== undefined)   { cols.push("agent_address = ?");   vals.push(updates.agentAddress); }
      if (updates.challengeAt !== undefined)    { cols.push("challenge_at = ?");    vals.push(updates.challengeAt); }
      if (updates.verifiedAt !== undefined)     { cols.push("verified_at = ?");     vals.push(updates.verifiedAt); }
      if (updates.proxyAt !== undefined)        { cols.push("proxy_at = ?");        vals.push(updates.proxyAt); }
      if (updates.settledAt !== undefined)      { cols.push("settled_at = ?");      vals.push(updates.settledAt); }
      if (cols.length === 0) return;
      vals.push(id);
      db.prepare(`UPDATE requests SET ${cols.join(", ")} WHERE id = ?`).run(...vals);
    },

    /** Find the most recent payment_required request for this agent+service (within 5 min) to resume. */
    findPendingRequest(serviceId: string, agentAddress: string): GatewayRequest | undefined {
      const cutoff = Date.now() - 5 * 60_000;
      const row = db.prepare(
        `SELECT * FROM requests WHERE service_id = ? AND LOWER(agent_address) = LOWER(?) AND gateway_status = 'payment_required' AND created_at > ? ORDER BY created_at DESC LIMIT 1`
      ).get(serviceId, agentAddress, cutoff) as any;
      return row ? rowToRequest(row) : undefined;
    },

    updateRequestPaymentId(requestId: string, paymentId: string) {
      db.prepare("UPDATE requests SET payment_id = ? WHERE id = ?").run(paymentId, requestId);
    },

    listRequests(serviceId?: string, status?: string): GatewayRequest[] {
      let sql = "SELECT * FROM requests";
      const conditions: string[] = [];
      const params: any[] = [];
      if (serviceId) { conditions.push("service_id = ?"); params.push(serviceId); }
      if (status) { conditions.push("gateway_status = ?"); params.push(status); }
      if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
      sql += " ORDER BY created_at DESC";
      return (db.prepare(sql).all(...params) as any[]).map(rowToRequest);
    },

    // ── Payments ─────────────────────────────────────────────────────
    insertPayment(p: Payment) {
      db.prepare(`
        INSERT INTO payments (id, request_id, service_id, agent_address, tx_hash, network, amount, status, settlement_error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.requestId, p.serviceId, p.agentAddress, p.txHash, p.network,
            p.amount, p.status, p.settlementError, p.createdAt);
    },

    listPayments(serviceId?: string): Payment[] {
      const rows = serviceId
        ? db.prepare("SELECT * FROM payments WHERE service_id = ? ORDER BY created_at DESC").all(serviceId)
        : db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
      return (rows as any[]).map(rowToPayment);
    },

    // ── Agent cache ──────────────────────────────────────────────────
    upsertAgentCache(agent: AgentInfo) {
      db.prepare(`
        INSERT INTO agent_cache (address, is_registered, reputation, cached_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(address) DO UPDATE SET
          is_registered = excluded.is_registered,
          reputation = excluded.reputation,
          cached_at = excluded.cached_at
      `).run(agent.address, agent.isRegistered ? 1 : 0, agent.reputation, agent.cachedAt);
    },

    getAgentCache(address: string): AgentInfo | undefined {
      const row = db.prepare("SELECT * FROM agent_cache WHERE address = ?").get(address) as any;
      return row ? { address: row.address, isRegistered: !!row.is_registered,
                     reputation: row.reputation, cachedAt: row.cached_at } : undefined;
    },

    listAgentCache(): AgentInfo[] {
      const rows = db.prepare("SELECT * FROM agent_cache ORDER BY cached_at DESC").all() as any[];
      return rows.map((row: any) => ({
        address: row.address,
        isRegistered: !!row.is_registered,
        reputation: row.reputation,
        cachedAt: row.cached_at,
      }));
    },

    getAgentStats(address: string): {
      totalRequests: number;
      successRequests: number;
      failedRequests: number;
      totalPayments: number;
      settledPayments: number;
      failedPayments: number;
      totalSpent: string;
      lastSeen: number;
    } {
      const addr = address.toLowerCase();
      const reqRow = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN gateway_status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN gateway_status != 'success' THEN 1 ELSE 0 END) as failed,
          MAX(created_at) as last_seen
        FROM requests WHERE LOWER(agent_address) = ?
      `).get(addr) as any;
      const payRow = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'settled' THEN 1 ELSE 0 END) as settled,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          COALESCE(SUM(CASE WHEN status = 'settled' THEN CAST(amount AS REAL) ELSE 0 END), 0) as total_spent
        FROM payments WHERE LOWER(agent_address) = ?
      `).get(addr) as any;
      return {
        totalRequests: reqRow?.total ?? 0,
        successRequests: reqRow?.success ?? 0,
        failedRequests: reqRow?.failed ?? 0,
        totalPayments: payRow?.total ?? 0,
        settledPayments: payRow?.settled ?? 0,
        failedPayments: payRow?.failed ?? 0,
        totalSpent: (payRow?.total_spent ?? 0).toFixed(6),
        lastSeen: reqRow?.last_seen ?? 0,
      };
    },

    // ── Nonce Store (replay protection) ──────────────────────────────
    isNonceUsed(nonce: string): boolean {
      const row = db.prepare("SELECT 1 FROM used_nonces WHERE nonce = ?").get(nonce.toLowerCase());
      return !!row;
    },

    markNonceUsed(nonce: string, network: string = "", agentAddress: string = ""): void {
      db.prepare(`
        INSERT OR IGNORE INTO used_nonces (nonce, network, agent_address, created_at)
        VALUES (?, ?, ?, ?)
      `).run(nonce.toLowerCase(), network, agentAddress, Date.now());
    },

    pruneExpiredNonces(maxAgeMs: number): void {
      const cutoff = Date.now() - maxAgeMs;
      db.prepare("DELETE FROM used_nonces WHERE created_at < ?").run(cutoff);
    },
  };
}

function rowToProvider(row: any): ServiceProvider {
  return {
    id: row.id,
    name: row.name,
    walletAddress: row.wallet_address,
    description: row.description ?? "",
    website: row.website ?? "",
    createdAt: row.created_at,
  };
}

function rowToScheme(row: any): ServicePaymentScheme {
  return {
    id: row.id,
    serviceId: row.service_id,
    network: row.network as Network,
    tokenId: row.token_id,
    priceAmount: row.price_amount,
    priceCurrency: row.price_currency,
    recipient: row.recipient,
    createdAt: row.created_at,
  };
}

function rowToService(row: any): Service {
  return {
    id: row.id,
    providerId: row.provider_id ?? "",
    name: row.name,
    backendUrl: row.backend_url,
    apiKey: row.api_key ?? "",
    minReputation: row.min_reputation,
    createdAt: row.created_at,
  };
}

function rowToChain(row: any): ChainConfig {
  return {
    id: row.id,
    name: row.name,
    chainId: row.chain_id,
    rpcUrl: row.rpc_url,
    explorerUrl: row.explorer_url ?? "",
    isTestnet: !!row.is_testnet,
    nativeCurrency: row.native_currency ?? "ETH",
    erc8004Identity: row.erc8004_identity ?? "",
    createdAt: row.created_at,
  };
}

function rowToToken(row: any): TokenConfig {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    chainSlug: row.chain_slug,
    contractAddress: row.contract_address,
    decimals: row.decimals ?? 6,
    domainName: row.domain_name ?? "",
    domainVersion: row.domain_version ?? "1",
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

function rowToRequest(row: any): GatewayRequest {
  return {
    id: row.id,
    serviceId: row.service_id,
    agentAddress: row.agent_address ?? "",
    method: row.method ?? "",
    path: row.path ?? "",
    network: row.network ?? "",
    gatewayStatus: row.gateway_status ?? "success",
    httpStatus: row.http_status ?? 0,
    responseStatus: row.response_status ?? 0,
    responseBody: row.response_body ?? "",
    errorReason: row.error_reason ?? "",
    paymentId: row.payment_id ?? "",
    challengeAt: row.challenge_at ?? 0,
    verifiedAt: row.verified_at ?? 0,
    proxyAt: row.proxy_at ?? 0,
    settledAt: row.settled_at ?? 0,
    createdAt: row.created_at,
  };
}

function rowToPayment(row: any): Payment {
  return {
    id: row.id,
    requestId: row.request_id ?? "",
    serviceId: row.service_id,
    agentAddress: row.agent_address,
    txHash: row.tx_hash,
    network: row.network,
    amount: row.amount,
    status: row.status,
    settlementError: row.settlement_error ?? "",
    createdAt: row.created_at,
  };
}

function rowToRpcEndpoint(row: any): RpcEndpoint {
  return {
    id: row.id,
    chainSlug: row.chain_slug,
    url: row.url,
    label: row.label ?? "",
    priority: row.priority ?? 0,
    isActive: !!row.is_active,
    healthStatus: row.health_status ?? "unknown",
    lastHealthCheck: row.last_health_check ?? 0,
    lastLatency: row.last_latency ?? -1,
    totalRequests: row.total_requests ?? 0,
    totalErrors: row.total_errors ?? 0,
    createdAt: row.created_at,
  };
}

// Singleton for production use
let _db: ReturnType<typeof createDb> | null = null;
export function getDb(): ReturnType<typeof createDb> {
  if (!_db) {
    // Resolve relative to this file's location (packages/core/src/ or dist/) so the path
    // is always the workspace-root gateway.db regardless of CWD or how the server is started.
    const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../..", "gateway.db");
    _db = createDb(process.env.DB_PATH ?? defaultPath);
  }
  return _db;
}
