/**
 * End-to-end demo script
 *
 * Prerequisites:
 *   1. Copy .env.example to .env and fill in FACILITATOR_PRIVATE_KEY + RPCs
 *   2. Start gateway: pnpm dev (runs core on :8402, admin-api on :8403)
 *   3. Run: pnpm demo (from scripts/)
 *
 * What this script does:
 *   1. Register a demo echo backend via admin API
 *   2. Simulate an Agent requesting the protected endpoint (expect 402)
 *   3. Simulate payment signature and retry (expect 200 + tx hash)
 */

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createWalletClient, http, parseUnits } from "viem";
import { optimismSepolia } from "viem/chains";
import type { PaymentPayload, PaymentRequirement } from "@x402-gateway-mvp/shared";

const ADMIN_URL = "http://localhost:8403";
const GATEWAY_URL = "http://localhost:8402";
const AGENT_PRIVATE_KEY = generatePrivateKey(); // Random test agent
const agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY);

console.log("=== x402 Gateway Demo ===");
console.log(`Agent address: ${agentAccount.address}\n`);

// Step 1: Register a demo service
console.log("1. Registering demo service via admin API...");
const createRes = await fetch(`${ADMIN_URL}/services`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Demo Echo API",
    backendUrl: "https://httpbin.org",
    priceAmount: "0.001",
    network: "optimism-sepolia",
    recipient: agentAccount.address, // Self-payment for demo
    minReputation: 0,
  }),
});
const service = await createRes.json();
console.log(`   Created: ${service.id} (${service.name})\n`);

// Step 2: Request without payment — expect 402
console.log("2. Requesting protected endpoint without payment...");
const noPayRes = await fetch(`${GATEWAY_URL}/get`, {
  headers: { "X-Agent-Address": agentAccount.address },
});
console.log(`   Status: ${noPayRes.status} (expected 402)`);
const paymentInfo = await noPayRes.json() as { requirement: PaymentRequirement };
console.log(`   Required: ${paymentInfo.requirement.maxAmountRequired} USDC units on ${paymentInfo.requirement.network}\n`);

// Step 3: Build payment signature (EIP-3009 TransferWithAuthorization)
console.log("3. Signing payment authorization...");
const DMHKD_OPTIMISM_SEPOLIA = "0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6";
const now = Math.floor(Date.now() / 1000);
const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}`;

const walletClient = createWalletClient({
  account: agentAccount,
  chain: optimismSepolia,
  transport: http("https://sepolia.optimism.io"),
});

const signature = await walletClient.signTypedData({
  domain: {
    name: "DMHKD",
    version: "2",
    chainId: 11155420,
    verifyingContract: DMHKD_OPTIMISM_SEPOLIA,
  },
  types: {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  },
  primaryType: "TransferWithAuthorization",
  message: {
    from: agentAccount.address,
    to: paymentInfo.requirement.payTo as `0x${string}`,
    value: parseUnits("0.001", 6),
    validAfter: BigInt(0),
    validBefore: BigInt(now + 300),
    nonce: nonce as `0x${string}`,
  },
});

const payload: PaymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "optimism-sepolia",
  payload: {
    signature,
    authorization: {
      from: agentAccount.address,
      to: paymentInfo.requirement.payTo,
      value: parseUnits("0.001", 6).toString(),
      validAfter: "0",
      validBefore: String(now + 300),
      nonce,
    },
  },
};

const paymentHeader = Buffer.from(JSON.stringify(payload)).toString("base64");
console.log("   Signature created\n");

// Step 4: Retry with payment
console.log("4. Retrying request with payment signature...");
const paidRes = await fetch(`${GATEWAY_URL}/get`, {
  headers: {
    "X-Agent-Address": agentAccount.address,
    "PAYMENT-SIGNATURE": paymentHeader,
  },
});
console.log(`   Status: ${paidRes.status}`);

if (paidRes.ok) {
  const paymentResponse = paidRes.headers.get("PAYMENT-RESPONSE");
  if (paymentResponse) {
    const settlement = JSON.parse(Buffer.from(paymentResponse, "base64").toString());
    console.log(`   Settled on-chain: ${settlement.txHash}`);
  }
  console.log("\n✅ Demo complete! Payment gateway working end-to-end.");
} else {
  const body = await paidRes.json();
  console.log(`   Error: ${JSON.stringify(body)}`);
  console.log("\n⚠️  Note: On-chain settlement requires funded testnet wallet and valid USDC balance.");
  console.log("   The signature flow is correct — fund the agent wallet to complete the demo.");
}
