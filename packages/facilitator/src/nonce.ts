// In-memory nonce store — prevents replay attacks within a process lifetime.
// For multi-process deployments, replace with Redis or SQLite-backed store.
export class NonceStore {
  private used = new Set<string>();

  isUsed(nonce: string): boolean {
    return this.used.has(nonce.toLowerCase());
  }

  markUsed(nonce: string): void {
    this.used.add(nonce.toLowerCase());
  }
}

// Singleton for use across request handlers
export const globalNonceStore = new NonceStore();
