// SQLite-backed nonce store — prevents replay attacks across restarts.
// Falls back to in-memory Set when no DB provider is configured (testing).

type DbProvider = {
  isNonceUsed(nonce: string): boolean;
  markNonceUsed(nonce: string, network?: string, agentAddress?: string): void;
};

export class NonceStore {
  private db: DbProvider | null = null;
  // Fallback for tests / when DB is not yet configured
  private memFallback = new Set<string>();

  /** Inject the DB provider (call once at startup from core/index.ts) */
  setDb(db: DbProvider): void {
    this.db = db;
  }

  isUsed(nonce: string): boolean {
    if (this.db) return this.db.isNonceUsed(nonce);
    return this.memFallback.has(nonce.toLowerCase());
  }

  markUsed(nonce: string, network: string = "", agentAddress: string = ""): void {
    if (this.db) {
      this.db.markNonceUsed(nonce, network, agentAddress);
    } else {
      this.memFallback.add(nonce.toLowerCase());
    }
  }
}

// Singleton for use across request handlers
export const globalNonceStore = new NonceStore();
