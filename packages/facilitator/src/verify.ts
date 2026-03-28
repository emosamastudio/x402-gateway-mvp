import { keccak256, encodeAbiParameters, parseAbiParameters, recoverAddress, concat } from "viem";
import type { PaymentPayload, PaymentRequirement, VerifyResult } from "@x402-gateway-mvp/shared";
import { getDomainSeparator } from "@x402-gateway-mvp/chain";
import { globalNonceStore } from "./nonce.js";

// keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
  )
);

/**
 * Compute the EIP-712 digest for TransferWithAuthorization using the provided domain separator.
 * We use the actual on-chain DOMAIN_SEPARATOR() value rather than computing it from domain fields,
 * because the proxy contract's _DOMAIN_SEPARATOR_SLOT may not have been initialized via initializeV2.
 */
function computeTransferAuthDigest(
  from: string, to: string, value: bigint,
  validAfter: bigint, validBefore: bigint, nonce: string,
  domainSeparator: `0x${string}`
): `0x${string}` {
  const structHash = keccak256(encodeAbiParameters(
    parseAbiParameters("bytes32, address, address, uint256, uint256, uint256, bytes32"),
    [
      TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
      from as `0x${string}`,
      to as `0x${string}`,
      value,
      validAfter,
      validBefore,
      nonce as `0x${string}`,
    ]
  ));
  // "\x19\x01" prefix per EIP-191
  return keccak256(concat(["0x1901", domainSeparator, structHash]));
}

export async function verifyPayment(
  payload: PaymentPayload,
  requirement: PaymentRequirement
): Promise<VerifyResult> {
  const { authorization, signature } = payload.payload;
  const now = Math.floor(Date.now() / 1000);

  // Check network matches
  if (payload.network !== requirement.network) {
    return { isValid: false, error: "Payment network does not match service network" };
  }

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

  // Read the actual domain separator from the contract (cached after first call).
  // Uses the token contract address from the payment requirement.
  const domainSeparator = await getDomainSeparator(payload.network, requirement.asset);

  const digest = computeTransferAuthDigest(
    authorization.from, authorization.to,
    BigInt(authorization.value),
    BigInt(authorization.validAfter),
    BigInt(authorization.validBefore),
    authorization.nonce,
    domainSeparator
  );

  let recovered: string;
  try {
    recovered = await recoverAddress({ hash: digest, signature: signature as `0x${string}` });
  } catch {
    return { isValid: false, error: "Malformed signature" };
  }

  if (recovered.toLowerCase() !== authorization.from.toLowerCase()) {
    return { isValid: false, error: "Invalid payment signature" };
  }

  return { isValid: true };
}
