import { z } from "zod";

export const NetworkSchema = z.enum(["base-sepolia", "polygon-amoy"]);

export const CreateServiceSchema = z.object({
  name: z.string().min(1).max(100),
  backendUrl: z.string().url(),
  priceAmount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Must be a decimal number with at most 6 decimal places"),
  network: NetworkSchema,
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address"),
  minReputation: z.number().int().min(0).default(0),
});

export const PaymentPayloadSchema = z.object({
  x402Version: z.number().int().positive(),
  scheme: z.literal("exact"),
  network: NetworkSchema,
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Must be 65-byte ECDSA signature"),
    authorization: z.object({
      from: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address"),
      to: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address"),
      value: z.string().regex(/^\d+$/, "Must be a numeric string"),
      validAfter: z.string().regex(/^\d+$/, "Must be a unix timestamp"),
      validBefore: z.string().regex(/^\d+$/, "Must be a unix timestamp"),
      nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Must be a bytes32 hex string"),
    }),
  }),
});
