import { z } from "zod";

/** Chain slug — validated at runtime against DB entries */
export const NetworkSchema = z.string().min(1);

export const CreateServiceProviderSchema = z.object({
  name: z.string().min(1).max(100),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address"),
  description: z.string().max(500).default(""),
  website: z.string().url().or(z.literal("")).default(""),
});

export const UpdateServiceProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address").optional(),
  description: z.string().max(500).optional(),
  website: z.string().url().or(z.literal("")).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

export const CreateServiceSchema = z.object({
  name: z.string().min(1).max(100),
  providerId: z.string().default(""),
  gatewayPath: z.string().min(1).regex(/^\//, "Must start with /"),
  backendUrl: z.string().url(),
  priceAmount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Must be a decimal number with at most 6 decimal places"),
  network: NetworkSchema,
  tokenId: z.string().min(1),
  recipient: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address").optional(),
  apiKey: z.string().default(""),
  minReputation: z.number().int().min(0).default(0),
});

export const CreateChainSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(100),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url(),
  explorerUrl: z.string().default(""),
  isTestnet: z.boolean().default(false),
  nativeCurrency: z.string().default("ETH"),
  erc8004Identity: z.string().default(""),
});

export const CreateTokenSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/, "Lowercase alphanumeric with hyphens"),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  chainSlug: z.string().min(1),
  contractAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Must be an EVM address"),
  decimals: z.number().int().min(0).max(18).default(6),
  domainName: z.string().min(1),
  domainVersion: z.string().min(1).default("1"),
  isActive: z.boolean().default(true),
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
