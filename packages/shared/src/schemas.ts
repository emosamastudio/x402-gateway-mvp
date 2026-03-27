import { z } from "zod";

export const NetworkSchema = z.enum(["base-sepolia", "polygon-amoy"]);

export const CreateServiceSchema = z.object({
  name: z.string().min(1).max(100),
  backendUrl: z.string().url(),
  priceAmount: z.string().regex(/^\d+(\.\d+)?$/, "Must be a decimal number"),
  network: NetworkSchema,
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address"),
  minReputation: z.number().int().min(0).default(0),
});

export const PaymentPayloadSchema = z.object({
  x402Version: z.number(),
  scheme: z.literal("exact"),
  network: NetworkSchema,
  payload: z.object({
    signature: z.string(),
    authorization: z.object({
      from: z.string(),
      to: z.string(),
      value: z.string(),
      validAfter: z.string(),
      validBefore: z.string(),
      nonce: z.string(),
    }),
  }),
});
