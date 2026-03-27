import type { Network, SettleResult, TransferAuthorization } from "@x402-gateway/shared";
import { getWalletClient, getPublicClient, USDC_ADDRESSES } from "@x402-gateway/chain";
import { globalNonceStore } from "./nonce.js";

const USDC_TRANSFER_ABI = [
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
  network: Network
): Promise<SettleResult> {
  const walletClient = getWalletClient(network);
  const publicClient = getPublicClient(network);
  const usdcAddress = USDC_ADDRESSES[network];
  const { v, r, s } = splitSignature(signature);

  try {
    const hash = await walletClient.writeContract({
      address: usdcAddress,
      abi: USDC_TRANSFER_ABI,
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

    await publicClient.waitForTransactionReceipt({ hash });

    // Mark nonce as used only after confirmed on-chain
    globalNonceStore.markUsed(authorization.nonce);

    return { txHash: hash, network };
  } catch (err) {
    throw new Error(`Settlement failed for nonce ${authorization.nonce}: ${String(err)}`);
  }
}
