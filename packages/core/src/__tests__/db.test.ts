import { describe, it, expect, beforeEach } from "vitest";
import { createDb } from "../db.js";

describe("Database", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    // Use in-memory SQLite for tests
    db = createDb(":memory:");
  });

  it("inserts and retrieves a service", () => {
    db.insertService({
      id: "svc_1",
      name: "Weather API",
      backendUrl: "http://localhost:3001",
      priceAmount: "0.001",
      priceCurrency: "DMHKD",
      network: "optimism-sepolia",
      recipient: "0x1111111111111111111111111111111111111111",
      minReputation: 0,
      createdAt: 1000,
    });
    const svc = db.getServiceById("svc_1");
    expect(svc?.name).toBe("Weather API");
    expect(svc?.priceAmount).toBe("0.001");
  });

  it("lists all services", () => {
    db.insertService({
      id: "svc_1", name: "A", backendUrl: "http://a.com",
      priceAmount: "0.001", priceCurrency: "USDC", network: "optimism-sepolia",
      recipient: "0x1111111111111111111111111111111111111111", minReputation: 0, createdAt: 1,
    });
    db.insertService({
      id: "svc_2", name: "B", backendUrl: "http://b.com",
      priceAmount: "0.002", priceCurrency: "USDC", network: "sepolia",
      recipient: "0x2222222222222222222222222222222222222222", minReputation: 50, createdAt: 2,
    });
    expect(db.listServices()).toHaveLength(2);
  });

  it("inserts and queries payments", () => {
    db.insertService({
      id: "svc_1", name: "A", backendUrl: "http://a.com",
      priceAmount: "0.001", priceCurrency: "USDC", network: "optimism-sepolia",
      recipient: "0x1111111111111111111111111111111111111111", minReputation: 0, createdAt: 1,
    });
    db.insertPayment({
      id: "pay_1", serviceId: "svc_1",
      agentAddress: "0xaaaa", txHash: "0xtx1", network: "optimism-sepolia",
      amount: "0.001", status: "settled", createdAt: 2,
    });
    const payments = db.listPayments();
    expect(payments).toHaveLength(1);
    expect(payments[0].txHash).toBe("0xtx1");
  });

  it("upserts and retrieves agent cache", () => {
    db.upsertAgentCache({
      address: "0xagent", isRegistered: true, reputation: 80, cachedAt: 1000,
    });
    const agent = db.getAgentCache("0xagent");
    expect(agent?.isRegistered).toBe(true);
    expect(agent?.reputation).toBe(80);
  });
});
