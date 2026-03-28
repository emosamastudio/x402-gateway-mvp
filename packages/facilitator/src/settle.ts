import type { Network, SettleResult, TransferAuthorization } from "@x402-gateway-mvp/shared";
import { getWalletClient } from "@x402-gateway-mvp/chain";
import { globalNonceStore } from "./nonce.js";

const DMHKD_TRANSFER_ABI = [
  {
    name: "transferWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

function splitSignature(sig: string): { v: number; r: `0x${string}`; s: `0x${string}` } {
  const hex = sig.replace("0x", "");
  const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
  const s = `0x${hex.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(hex.slice(128, 130), 16);
  return { r, s, v };
}

export async function settlePayment(
  authorization: TransferAuthorization,
  signature: string,
  network: Network,
  tokenAddress: string,
): Promise<SettleResult> {
  const walletClient = getWalletClient(network);
  const { v, r, s } = splitSignature(signature);

  // Extract a concise revert reason from viem errors
  function toCleanError(err: unknown): string {
    if (err instanceof Error) {
      // viem BaseError exposes shortMessage (e.g. "FiatTokenV2: invalid signature")
      const short = (err as any).shortMessage as string | undefined;
      if (short) return short;
      // Fallback: first non-empty line of the message
      const firstLine = err.message.split("\n").find(l => l.trim());
      return firstLine?.trim() ?? err.message;
    }
    return String(err);
  }

  try {
    const hash = await walletClient.writeContract({
      address: tokenAddress as `0x${string}`,
      abi: DMHKD_TRANSFER_ABI,
      functionName: "transferWithAuthorization",
      args: [
        authorization.from as `0x${string}`,
        authorization.to as `0x${string}`,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce as `0x${string}`,
        v,
        r,
        s,
      ],
    });

    // Mark nonce as used immediately after broadcast to prevent replay attacks.
    // We don't wait for receipt — simulation inside writeContract already ensures
    // the tx won't revert, and waiting for a block (~12s on Sepolia) would block
    // the HTTP response for too long.
    globalNonceStore.markUsed(authorization.nonce);

    return { txHash: hash, network };
  } catch (err) {
    throw new Error(`Settlement failed: ${toCleanError(err)}`);
  }
}
