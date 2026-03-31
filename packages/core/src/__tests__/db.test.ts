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
      providerId: "",
      apiKey: "",
      minReputation: 0,
      createdAt: 1000,
    });
    const svc = db.getServiceById("svc_1");
    expect(svc?.name).toBe("Weather API");
    expect(svc?.backendUrl).toBe("http://localhost:3001");
  });

  it("lists all services", () => {
    db.insertService({
      id: "svc_1", name: "A", backendUrl: "http://a.com",
      providerId: "", apiKey: "", minReputation: 0, createdAt: 1,
    });
    db.insertService({
      id: "svc_2", name: "B", backendUrl: "http://b.com",
      providerId: "", apiKey: "", minReputation: 50, createdAt: 2,
    });
    expect(db.listServices()).toHaveLength(2);
  });

  it("inserts and queries payments", () => {
    db.insertService({
      id: "svc_1", name: "A", backendUrl: "http://a.com",
      providerId: "", apiKey: "", minReputation: 0, createdAt: 1,
    });
    db.insertPayment({
      id: "pay_1", requestId: "req_1", serviceId: "svc_1",
      agentAddress: "0xaaaa", txHash: "0xtx1", network: "optimism-sepolia",
      amount: "0.001", status: "settled", settlementError: "", createdAt: 2,
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

  // ── Chains ─────────────────────────────────────────────────────────

  describe("chains CRUD", () => {
    it("retrieves seeded chain by id", () => {
      const chain = db.getChain("optimism-sepolia");
      expect(chain?.chainId).toBe(11155420);
      expect(chain?.nativeCurrency).toBe("ETH");
    });

    it("returns undefined for unknown chain", () => {
      expect(db.getChain("unknown-chain")).toBeUndefined();
    });

    it("inserts a new chain and lists it among all chains", () => {
      const beforeCount = db.listChains().length; // seeded chains already present
      db.insertChain({
        id: "base-sepolia",
        name: "Base Sepolia",
        chainId: 84532,
        rpcUrl: "https://sepolia.base.org",
        explorerUrl: "https://sepolia.basescan.org",
        isTestnet: true,
        nativeCurrency: "ETH",
        erc8004Identity: "",
        createdAt: 9999,
      });
      expect(db.listChains()).toHaveLength(beforeCount + 1);
      expect(db.getChain("base-sepolia")?.chainId).toBe(84532);
    });

    it("updates a chain field", () => {
      const updated = db.updateChain("optimism-sepolia", { name: "OP Sepolia" });
      expect(updated).toBe(true);
      expect(db.getChain("optimism-sepolia")?.name).toBe("OP Sepolia");
    });

    it("returns false when updating non-existent chain", () => {
      expect(db.updateChain("ghost", { name: "Ghost" })).toBe(false);
    });

    it("returns false when update has no fields", () => {
      expect(db.updateChain("optimism-sepolia", {})).toBe(false);
    });

    it("deletes a chain", () => {
      expect(db.deleteChain("sepolia")).toBe(true);
      expect(db.getChain("sepolia")).toBeUndefined();
    });

    it("returns false when deleting non-existent chain", () => {
      expect(db.deleteChain("ghost")).toBe(false);
    });
  });

  // ── Tokens ─────────────────────────────────────────────────────────

  describe("tokens CRUD", () => {
    it("retrieves seeded token by id", () => {
      const token = db.getToken("dmhkd-optimism-sepolia");
      expect(token?.symbol).toBe("DMHKD");
      expect(token?.decimals).toBe(6);
    });

    it("returns undefined for unknown token", () => {
      expect(db.getToken("nonexistent")).toBeUndefined();
    });

    it("inserts a new token and retrieves it", () => {
      db.insertToken({
        id: "usdc-base-sepolia",
        symbol: "USDC",
        name: "USD Coin",
        chainSlug: "base-sepolia",
        contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        decimals: 6,
        domainName: "USDC",
        domainVersion: "2",
        isActive: true,
        createdAt: 5000,
      });
      const token = db.getToken("usdc-base-sepolia");
      expect(token?.symbol).toBe("USDC");
      expect(token?.chainSlug).toBe("base-sepolia");
    });

    it("finds token by chain and contract address (case-insensitive)", () => {
      const token = db.getTokenByChainAndAddress(
        "optimism-sepolia",
        db.getToken("dmhkd-optimism-sepolia")!.contractAddress.toUpperCase()
      );
      expect(token?.id).toBe("dmhkd-optimism-sepolia");
    });

    it("updates a token field", () => {
      db.updateToken("dmhkd-optimism-sepolia", { isActive: false });
      expect(db.getToken("dmhkd-optimism-sepolia")?.isActive).toBe(false);
    });

    it("returns false when update has no fields", () => {
      expect(db.updateToken("dmhkd-optimism-sepolia", {})).toBe(false);
    });

    it("deletes a token", () => {
      expect(db.deleteToken("dmhkd-sepolia")).toBe(true);
      expect(db.getToken("dmhkd-sepolia")).toBeUndefined();
    });
  });

  // ── Services (update / delete) ──────────────────────────────────────

  describe("service update and delete", () => {
    beforeEach(() => {
      db.insertService({
        id: "svc_upd", name: "Updatable", backendUrl: "http://upd.com",
        providerId: "", apiKey: "", minReputation: 0, createdAt: 1,
      });
    });

    it("updates service fields", () => {
      const ok = db.updateService("svc_upd", { name: "Renamed" });
      expect(ok).toBe(true);
      const svc = db.getServiceById("svc_upd");
      expect(svc?.name).toBe("Renamed");
    });

    it("returns false when updating non-existent service", () => {
      expect(db.updateService("ghost", { name: "Ghost" })).toBe(false);
    });

    it("returns false when update has no fields", () => {
      expect(db.updateService("svc_upd", {})).toBe(false);
    });

    it("deletes a service", () => {
      expect(db.deleteService("svc_upd")).toBe(true);
      expect(db.getServiceById("svc_upd")).toBeUndefined();
    });

    it("returns false when deleting non-existent service", () => {
      expect(db.deleteService("ghost")).toBe(false);
    });
  });

  // ── Requests ────────────────────────────────────────────────────────

  describe("requests", () => {
    const baseRequest = {
      id: "req_1", serviceId: "svc_1", agentAddress: "0xABCD",
      method: "GET", path: "/api/data", network: "optimism-sepolia",
      gatewayStatus: "payment_required", httpStatus: 402, responseStatus: 0,
      responseBody: "", errorReason: "", paymentId: "",
      challengeAt: 0, verifiedAt: 0, proxyAt: 0, settledAt: 0, createdAt: Date.now(),
    };

    it("inserts and retrieves a request via listRequests", () => {
      db.insertRequest(baseRequest);
      const requests = db.listRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0].agentAddress).toBe("0xABCD");
    });

    it("listRequests filters by serviceId", () => {
      db.insertRequest({ ...baseRequest, id: "req_a", serviceId: "svc_a" });
      db.insertRequest({ ...baseRequest, id: "req_b", serviceId: "svc_b" });
      expect(db.listRequests("svc_a")).toHaveLength(1);
      expect(db.listRequests("svc_b")).toHaveLength(1);
      expect(db.listRequests("svc_x")).toHaveLength(0);
    });

    it("listRequests filters by status", () => {
      db.insertRequest({ ...baseRequest, id: "req_p", gatewayStatus: "payment_required" });
      db.insertRequest({ ...baseRequest, id: "req_s", gatewayStatus: "success" });
      expect(db.listRequests(undefined, "payment_required")).toHaveLength(1);
      expect(db.listRequests(undefined, "success")).toHaveLength(1);
    });

    it("updateRequest changes gatewayStatus", () => {
      db.insertRequest(baseRequest);
      db.updateRequest("req_1", { gatewayStatus: "verifying", verifiedAt: 1234 });
      const req = db.listRequests()[0];
      expect(req.gatewayStatus).toBe("verifying");
      expect(req.verifiedAt).toBe(1234);
    });

    it("findPendingRequest finds a recent request case-insensitively", () => {
      db.insertRequest({
        ...baseRequest,
        agentAddress: "0xabcd", // lowercase
        createdAt: Date.now(),
      });
      // Query with uppercase agent address — should still find it
      const found = db.findPendingRequest("svc_1", "0xABCD");
      expect(found?.id).toBe("req_1");
    });

    it("findPendingRequest returns undefined for old requests (> 5 min)", () => {
      db.insertRequest({
        ...baseRequest,
        createdAt: Date.now() - 10 * 60_000, // 10 minutes ago
      });
      expect(db.findPendingRequest("svc_1", "0xABCD")).toBeUndefined();
    });

    it("findPendingRequest returns undefined when no matching service/agent", () => {
      db.insertRequest({ ...baseRequest, createdAt: Date.now() });
      expect(db.findPendingRequest("svc_OTHER", "0xABCD")).toBeUndefined();
    });
  });

  // ── Nonces ──────────────────────────────────────────────────────────

  describe("nonce store", () => {
    it("returns false for unused nonce", () => {
      expect(db.isNonceUsed("0xunused")).toBe(false);
    });

    it("marks a nonce as used and detects replay", () => {
      db.markNonceUsed("0xdeadbeef");
      expect(db.isNonceUsed("0xdeadbeef")).toBe(true);
    });

    it("nonce check is case-insensitive (stored lowercased)", () => {
      db.markNonceUsed("0xDEADBEEF");
      expect(db.isNonceUsed("0xdeadbeef")).toBe(true);
      expect(db.isNonceUsed("0xDEADBEEF")).toBe(true);
    });

    it("pruneExpiredNonces removes old nonces but keeps recent ones", async () => {
      db.markNonceUsed("0xold");
      // Wait 10ms, then mark a fresh nonce
      await new Promise((r) => setTimeout(r, 10));
      db.markNonceUsed("0xfresh");
      // Prune nonces older than 5ms — only "0xold" should be removed
      db.pruneExpiredNonces(5);
      expect(db.isNonceUsed("0xold")).toBe(false);
      expect(db.isNonceUsed("0xfresh")).toBe(true);
    });
  });

  // ── Service Payment Schemes ──────────────────────────────────────────

  describe("service payment schemes", () => {
    beforeEach(() => {
      db.insertService({
        id: "svc_scheme_test", providerId: "", name: "Scheme Test",
        backendUrl: "http://test.com", apiKey: "", minReputation: 0, createdAt: Date.now(),
      });
      db.insertScheme({
        id: "scheme_test_1",
        serviceId: "svc_scheme_test",
        network: "test-network",
        tokenId: "token-1",
        priceAmount: "0.001",
        priceCurrency: "USDC",
        recipient: "0x1234567890123456789012345678901234567890",
        createdAt: Date.now(),
      });
    });

    it("inserts and retrieves a scheme", () => {
      const fetched = db.getScheme("scheme_test_1");
      expect(fetched).toBeDefined();
      expect(fetched!.priceAmount).toBe("0.001");
      expect(fetched!.serviceId).toBe("svc_scheme_test");
    });

    it("lists schemes by service", () => {
      const schemes = db.listSchemesByService("svc_scheme_test");
      expect(schemes.length).toBeGreaterThanOrEqual(1);
    });

    it("updates scheme price", () => {
      db.updateScheme("scheme_test_1", { priceAmount: "0.002" });
      const updated = db.getScheme("scheme_test_1");
      expect(updated!.priceAmount).toBe("0.002");
    });

    it("deletes scheme", () => {
      db.deleteScheme("scheme_test_1");
      expect(db.getScheme("scheme_test_1")).toBeUndefined();
    });
  });
});
