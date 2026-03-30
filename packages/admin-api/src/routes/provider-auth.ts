// packages/admin-api/src/routes/provider-auth.ts
import { Hono } from "hono";
import { randomUUID } from "crypto";
import { verifyMessage } from "viem";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import { generateNonce, getNonceMessage, consumeNonce, signProviderJwt } from "../middleware/provider-jwt.js";

export const providerAuthRouter = new Hono();

// GET /provider/auth/nonce?address=0x...
providerAuthRouter.get("/nonce", (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "address query param required" }, 400);
  generateNonce(address);
  const message = getNonceMessage(address)!;
  return c.json({ message });
});

// POST /provider/auth/verify  { walletAddress, signature }
providerAuthRouter.post("/verify", async (c) => {
  const { walletAddress, signature } = await c.req.json();
  if (!walletAddress || !signature) {
    return c.json({ error: "walletAddress and signature required" }, 400);
  }

  const message = getNonceMessage(walletAddress);
  if (!message) {
    return c.json({ error: "No valid nonce found. Call /nonce first." }, 400);
  }

  const valid = await verifyMessage({
    address: walletAddress as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });
  if (!valid) return c.json({ error: "Invalid signature" }, 401);

  // Consume nonce (prevent replay)
  consumeNonce(walletAddress);

  const db = getDb();
  let provider = db.getProviderByWallet(walletAddress);
  let needsProfile = false;

  if (!provider) {
    // Auto-create minimal provider record on first sign-in
    const id = `prov_${randomUUID()}`;
    const now = Date.now();
    db.insertProvider({ id, name: "", walletAddress, description: "", website: "", createdAt: now });
    provider = db.getProvider(id)!;
    needsProfile = true;
  }

  const token = await signProviderJwt(provider.id, walletAddress);
  return c.json({ token, provider, needsProfile });
});
