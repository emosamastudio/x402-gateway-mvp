import { verifyTypedData } from "viem";
import type { PaymentPayload, PaymentRequirement, VerifyResult } from "@x402-gateway/shared";
import { USDC_ADDRESSES, CHAIN_IDS } from "@x402-gateway/chain";
import { globalNonceStore } from "./nonce.js";

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export async function verifyPayment(
  payload: PaymentPayload,
  requirement: PaymentRequirement
): Promise<VerifyResult> {
  const { authorization, signature } = payload.payload;
  const now = Math.floor(Date.now() / 1000);

  // Check expiry
  if (Number(authorization.validBefore) < now) {
    return { isValid: false, error: "Payment expired" };
  }

  // Check validAfter (payment not yet active)
  if (Number(authorization.validAfter) > now) {
    return { isValid: false, error: "Payment not yet valid" };
  }

  // Check amount
  if (BigInt(authorization.value) < BigInt(requirement.maxAmountRequired)) {
    return { isValid: false, error: "Payment amount too low" };
  }

  // Check recipient
  if (authorization.to.toLowerCase() !== requirement.payTo.toLowerCase()) {
    return { isValid: false, error: "Payment recipient mismatch" };
  }

  // Check replay
  if (globalNonceStore.isUsed(authorization.nonce)) {
    return { isValid: false, error: "Payment nonce already used (replay attack)" };
  }

  // Verify EIP-712 signature
  const usdcAddress = USDC_ADDRESSES[payload.network];
  const chainId = CHAIN_IDS[payload.network];

  const isSignatureValid = await verifyTypedData({
    address: authorization.from as `0x${string}`,
    domain: {
      name: "USD Coin",
      version: "2",
      chainId,
      verifyingContract: usdcAddress,
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from as `0x${string}`,
      to: authorization.to as `0x${string}`,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce as `0x${string}`,
    },
    signature: signature as `0x${string}`,
  });

  if (!isSignatureValid) {
    return { isValid: false, error: "Invalid payment signature" };
  }

  return { isValid: true };
}
