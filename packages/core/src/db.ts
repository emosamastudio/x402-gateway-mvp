import Database from "better-sqlite3";
import type { Service, Payment, AgentInfo } from "@x402-gateway/shared";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  backend_url TEXT NOT NULL,
  price_amount TEXT NOT NULL,
  price_currency TEXT NOT NULL,
  network TEXT NOT NULL,
  recipient TEXT NOT NULL,
  min_reputation INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  agent_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  network TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_cache (
  address TEXT PRIMARY KEY,
  is_registered INTEGER NOT NULL,
  reputation INTEGER NOT NULL,
  cached_at INTEGER NOT NULL
);
`;

export function createDb(path: string) {
  const db = new Database(path);
  db.exec(SCHEMA);

  return {
    insertService(svc: Service) {
      db.prepare(`
        INSERT INTO services (id, name, backend_url, price_amount, price_currency, network, recipient, min_reputation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(svc.id, svc.name, svc.backendUrl, svc.priceAmount, svc.priceCurrency,
              svc.network, svc.recipient, svc.minReputation, svc.createdAt);
    },

    getServiceById(id: string): Service | undefined {
      const row = db.prepare("SELECT * FROM services WHERE id = ?").get(id) as any;
      return row ? rowToService(row) : undefined;
    },

    listServices(): Service[] {
      return (db.prepare("SELECT * FROM services ORDER BY created_at DESC").all() as any[])
        .map(rowToService);
    },

    insertPayment(p: Payment) {
      db.prepare(`
        INSERT INTO payments (id, service_id, agent_address, tx_hash, network, amount, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(p.id, p.serviceId, p.agentAddress, p.txHash, p.network, p.amount, p.status, p.createdAt);
    },

    listPayments(serviceId?: string): Payment[] {
      const rows = serviceId
        ? db.prepare("SELECT * FROM payments WHERE service_id = ? ORDER BY created_at DESC").all(serviceId)
        : db.prepare("SELECT * FROM payments ORDER BY created_at DESC").all();
      return (rows as any[]).map(rowToPayment);
    },

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
  };
}

function rowToService(row: any): Service {
  return {
    id: row.id, name: row.name, backendUrl: row.backend_url,
    priceAmount: row.price_amount, priceCurrency: row.price_currency,
    network: row.network, recipient: row.recipient,
    minReputation: row.min_reputation, createdAt: row.created_at,
  };
}

function rowToPayment(row: any): Payment {
  return {
    id: row.id, serviceId: row.service_id, agentAddress: row.agent_address,
    txHash: row.tx_hash, network: row.network, amount: row.amount,
    status: row.status, createdAt: row.created_at,
  };
}

// Singleton for production use
let _db: ReturnType<typeof createDb> | null = null;
export function getDb(): ReturnType<typeof createDb> {
  if (!_db) _db = createDb(process.env.DB_PATH ?? "./gateway.db");
  return _db;
}
