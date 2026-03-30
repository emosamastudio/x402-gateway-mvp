// packages/admin-api/src/middleware/provider-jwt.ts
import { sign, verify } from "hono/jwt";
import type { Context, Next } from "hono";

// Shared Hono Env type for provider-authenticated routes
export type ProviderEnv = {
  Variables: {
    providerId: string;
    providerAddress: string;
  };
};

const JWT_SECRET = process.env.PROVIDER_JWT_SECRET ?? (() => {
  const fallback = crypto.randomUUID();
  console.warn("⚠️  PROVIDER_JWT_SECRET not set — provider tokens will be invalidated on restart.");
  return fallback;
})();

const JWT_EXPIRES_IN = 60 * 60 * 24; // 24 hours in seconds

// In-memory nonce store: address → { nonce, expiresAt }
const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();

export function generateNonce(address: string): string {
  const nonce = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  nonceStore.set(address.toLowerCase(), { nonce, expiresAt });
  return nonce;
}

export function getNonceMessage(address: string): string | null {
  const entry = nonceStore.get(address.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return null;
  }
  return `Sign in to x402 Gateway\nNonce: ${entry.nonce}\nExpires: ${new Date(entry.expiresAt).toISOString()}`;
}

export function consumeNonce(address: string): boolean {
  const entry = nonceStore.get(address.toLowerCase());
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(address.toLowerCase());
    return false;
  }
  nonceStore.delete(address.toLowerCase());
  return true;
}

export async function signProviderJwt(providerId: string, walletAddress: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: providerId, address: walletAddress.toLowerCase(), iat: now, exp: now + JWT_EXPIRES_IN },
    JWT_SECRET,
    "HS256"
  );
}

export interface ProviderJwtPayload {
  sub: string;        // providerId
  address: string;    // walletAddress (lowercase)
  iat: number;
  exp: number;
}

export async function verifyProviderJwt(c: Context<ProviderEnv>, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing provider token" }, 401);
  }
  const token = header.slice(7);
  try {
    const payload = await verify(token, JWT_SECRET, "HS256") as unknown as ProviderJwtPayload;
    c.set("providerId", payload.sub);
    c.set("providerAddress", payload.address);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired provider token" }, 401);
  }
}
