import { Hono } from "hono";
import { CreateTokenSchema } from "@x402-gateway-mvp/shared";
import { getDb } from "@x402-gateway-mvp/core/src/db.js";
import { registerToken, unregisterToken, getChainConfig, getPublicClient } from "@x402-gateway-mvp/chain";
import { getAddress, keccak256, toHex, encodeFunctionData, decodeFunctionResult, hexToBigInt } from "viem";

// ── ABI fragments for on-chain reads ─────────────────────────────────────
const ERC20_ABI = [
  { type: "function", name: "name",     inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol",   inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }],  stateMutability: "view" },
] as const;

const DOMAIN_SEPARATOR_ABI = [
  { type: "function", name: "DOMAIN_SEPARATOR", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
] as const;

// EIP-5267 eip712Domain()
const EIP5267_ABI = [
  {
    type: "function", name: "eip712Domain", inputs: [],
    outputs: [
      { name: "fields",            type: "bytes1" },
      { name: "name",              type: "string" },
      { name: "version",           type: "string" },
      { name: "chainId",           type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "salt",              type: "bytes32" },
      { name: "extensions",        type: "uint256[]" },
    ],
    stateMutability: "view",
  },
] as const;

// ERC-3009 transferWithAuthorization ABI for calling
const TWA_ABI = [
  {
    type: "function", name: "transferWithAuthorization",
    inputs: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
      { name: "v",           type: "uint8" },
      { name: "r",           type: "bytes32" },
      { name: "s",           type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ERC-3009 function selector: transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
const TWA_SELECTOR = keccak256(
  toHex("transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)")
).slice(0, 10);

// EIP-1967 implementation storage slot
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

export const tokensRouter = new Hono();

// ── Verify contract on-chain ─────────────────────────────────────────────
tokensRouter.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.chainSlug || !body?.contractAddress) {
    return c.json({ error: "chainSlug and contractAddress are required" }, 400);
  }

  const { chainSlug, contractAddress: rawAddr } = body as { chainSlug: string; contractAddress: string };

  // Validate chain exists
  try { getChainConfig(chainSlug); } catch {
    return c.json({ error: `Chain "${chainSlug}" not found in registry` }, 400);
  }

  let address: `0x${string}`;
  try { address = getAddress(rawAddr); } catch {
    return c.json({ error: "Invalid contract address format" }, 400);
  }

  const client = getPublicClient(chainSlug);
  const result: Record<string, unknown> = {
    contractAddress: address,
    chainSlug,
    erc20: false,
    erc3009: false,
    eip712Domain: false,
    domainSeparator: null,
  };

  // 1. Read ERC-20 basics: name, symbol, decimals
  try {
    const [name, symbol, decimals] = await Promise.all([
      client.readContract({ address, abi: ERC20_ABI, functionName: "name" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    result.erc20 = true;
    result.name = name;
    result.symbol = symbol;
    result.decimals = Number(decimals);
  } catch (err: any) {
    return c.json({
      ...result,
      error: `Failed to read ERC-20 basics (name/symbol/decimals): ${err.shortMessage || err.message}`,
    }, 200); // 200 so frontend can show partial info
  }

  // 2. Check ERC-3009: multi-strategy detection
  //    Strategy A: bytecode selector scan (works for non-proxy contracts)
  //    Strategy B: EIP-1967 proxy — read implementation and scan its bytecode
  //    Strategy C: direct eth_call simulation (most reliable for proxies)
  let erc3009Detected = false;
  try {
    const code = await client.getCode({ address });
    if (code && code.includes(TWA_SELECTOR.slice(2))) {
      erc3009Detected = true;
    }

    // Strategy B: If not found, try EIP-1967 proxy implementation
    if (!erc3009Detected && code) {
      try {
        const implSlotData = await client.request({
          method: "eth_getStorageAt" as any,
          params: [address, EIP1967_IMPL_SLOT, "latest"],
        }) as string;
        if (implSlotData && implSlotData !== "0x" + "0".repeat(64)) {
          const implAddress = ("0x" + implSlotData.slice(-40)) as `0x${string}`;
          result.proxyDetected = true;
          result.implementationAddress = implAddress;
          const implCode = await client.getCode({ address: implAddress });
          if (implCode && implCode.includes(TWA_SELECTOR.slice(2))) {
            erc3009Detected = true;
          }
        }
      } catch { /* not an EIP-1967 proxy */ }
    }

    // Strategy C: direct eth_call with dummy data (works through any proxy)
    if (!erc3009Detected) {
      try {
        const calldata = encodeFunctionData({
          abi: TWA_ABI,
          functionName: "transferWithAuthorization",
          args: [
            "0x0000000000000000000000000000000000000001",
            "0x0000000000000000000000000000000000000002",
            0n, 0n, BigInt(Math.floor(Date.now() / 1000) + 3600),
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            0, // v
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          ],
        });
        await client.call({ to: address, data: calldata });
        // If no revert, function exists (very unlikely with dummy args, but possible)
        erc3009Detected = true;
      } catch (callErr: any) {
        // If the error is about the call reverting (not about function not existing),
        // then the function exists but rejected our dummy params — that's a positive signal.
        const msg = (callErr.shortMessage || callErr.message || "").toLowerCase();
        // "execution reverted" with revert data means the function was found and executed but reverted
        // "function not found" / "invalid opcode" / empty revert with no data means no such function
        if (callErr.data && callErr.data !== "0x") {
          // Has revert data → function exists, just rejected our dummy params
          erc3009Detected = true;
        } else if (msg.includes("revert") && !msg.includes("missing revert data")) {
          // Generic revert but from the function itself
          erc3009Detected = true;
        }
      }
    }

    result.erc3009 = erc3009Detected;
    if (!erc3009Detected) {
      result.erc3009Warning = "Could not detect transferWithAuthorization via bytecode scan, proxy check, or direct call simulation.";
    }
  } catch {
    result.erc3009 = false;
    result.erc3009Warning = "Unable to check contract for ERC-3009 support";
  }

  // 3. Read DOMAIN_SEPARATOR()
  try {
    const ds = await client.readContract({ address, abi: DOMAIN_SEPARATOR_ABI, functionName: "DOMAIN_SEPARATOR" });
    result.domainSeparator = ds;
  } catch {
    result.domainSeparator = null;
    result.domainSeparatorWarning = "Contract does not expose DOMAIN_SEPARATOR()";
  }

  // 4. Try EIP-5267 eip712Domain() — multi-strategy detection
  //    Strategy A: Direct readContract call → extract domain data
  //    Strategy B: If call reverts, check if function exists via error analysis + bytecode scan
  //    Strategy C: Raw eth_call fallback for ABI mismatch
  const EIP712_DOMAIN_SELECTOR = keccak256(toHex("eip712Domain()")).slice(0, 10); // 0x84b0196e
  let eip712Detected = false;
  let eip712DataExtracted = false;

  // Strategy A: Direct call
  try {
    const domain = await client.readContract({ address, abi: EIP5267_ABI, functionName: "eip712Domain" });
    eip712Detected = true;
    eip712DataExtracted = true;
    result.eip712Domain = true;
    result.domainName = domain[1];
    result.domainVersion = domain[2];
    result.domainChainId = Number(domain[3]);
    result.domainVerifyingContract = domain[4];
  } catch (eip5267Err: any) {
    const errMsg = (eip5267Err.shortMessage || eip5267Err.message || "").toLowerCase();

    // If viem says "The contract function 'eip712Domain' reverted" — the function EXISTS but reverts
    // This is different from "function not found" / "could not decode" which means no such function
    const functionRevertedPattern = /contract function.*eip712domain.*revert/i;
    if (functionRevertedPattern.test(eip5267Err.shortMessage || eip5267Err.message || "")) {
      eip712Detected = true; // Function exists, just reverts (e.g. not initialized)
    }

    // Strategy B: Bytecode scan for eip712Domain selector (direct + proxy implementation)
    if (!eip712Detected) {
      try {
        const code = await client.getCode({ address });
        if (code && code.includes(EIP712_DOMAIN_SELECTOR.slice(2))) {
          eip712Detected = true;
        }
        // Check proxy implementation bytecode if not found in proxy
        if (!eip712Detected && result.proxyDetected && result.implementationAddress) {
          const implCode = await client.getCode({ address: result.implementationAddress as `0x${string}` });
          if (implCode && implCode.includes(EIP712_DOMAIN_SELECTOR.slice(2))) {
            eip712Detected = true;
          }
        }
      } catch { /* bytecode scan failed */ }
    }

    // Strategy C: Raw eth_call — may return data even if ABI decoding fails
    if (!eip712Detected) {
      try {
        const rawResult = await client.call({ to: address, data: EIP712_DOMAIN_SELECTOR as `0x${string}` });
        if (rawResult.data && rawResult.data.length > 2) {
          eip712Detected = true;
          // Try to decode the raw data
          try {
            const decoded = decodeFunctionResult({ abi: EIP5267_ABI, functionName: "eip712Domain", data: rawResult.data });
            eip712DataExtracted = true;
            result.domainName = decoded[1];
            result.domainVersion = decoded[2];
            result.domainChainId = Number(decoded[3]);
            result.domainVerifyingContract = decoded[4];
          } catch { /* couldn't decode but function exists */ }
        }
      } catch (rawErr: any) {
        // If raw eth_call also reverts with data, function exists
        if (rawErr.data && rawErr.data !== "0x") {
          eip712Detected = true;
        }
      }
    }

    // Set result based on detection
    result.eip712Domain = eip712Detected;
    if (eip712Detected && !eip712DataExtracted) {
      // Function exists but we couldn't extract domain data (likely reverts because not initialized)
      result.domainName = result.symbol;
      result.domainVersion = "2";
      result.domainNameSource = "inferred";
      result.domainNameWarning = `eip712Domain() is implemented but currently reverts (contract may need initialization). Domain name defaults to symbol, version defaults to "2". Please verify manually.`;
    } else if (!eip712Detected) {
      result.domainName = result.symbol;
      result.domainVersion = "2";
      result.domainNameSource = "inferred";
      result.domainNameWarning = `eip712Domain() not available (${eip5267Err.shortMessage || eip5267Err.message || "unknown error"}). Domain name defaults to symbol, version defaults to "2". Please verify manually.`;
    }
  }

  // 5. Suggest a token ID
  result.suggestedId = `${(result.symbol as string).toLowerCase()}-${chainSlug}`;

  return c.json(result);
});

// List all tokens
tokensRouter.get("/", (c) => {
  return c.json(getDb().listTokens());
});

// Get single token
tokensRouter.get("/:id", (c) => {
  const token = getDb().getToken(c.req.param("id"));
  if (!token) return c.json({ error: "Token not found" }, 404);
  return c.json(token);
});

// Create token
tokensRouter.post("/", async (c) => {
  const parsed = CreateTokenSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, 400);
  }
  const data = parsed.data;
  const db = getDb();

  // Validate chain exists
  if (!db.getChain(data.chainSlug)) {
    return c.json({ error: `Chain "${data.chainSlug}" not found. Create the chain first.` }, 400);
  }
  if (db.getToken(data.id)) {
    return c.json({ error: `Token ID "${data.id}" already exists` }, 409);
  }
  // Check duplicate: same chain + same contract address
  const existing = db.getTokenByChainAndAddress(data.chainSlug, data.contractAddress);
  if (existing) {
    return c.json({
      error: `该链上已存在相同合约地址的代币: "${existing.id}" (${existing.symbol})`,
      existingTokenId: existing.id,
    }, 409);
  }
  const token = { ...data, createdAt: Date.now() };
  db.insertToken(token);
  registerToken(token); // Update runtime registry
  return c.json(token, 201);
});

// Update token
tokensRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getDb();
  const existing = db.getToken(id);
  if (!existing) return c.json({ error: "Token not found" }, 404);

  // If changing chainSlug, validate it
  if (body.chainSlug && !db.getChain(body.chainSlug)) {
    return c.json({ error: `Chain "${body.chainSlug}" not found` }, 400);
  }

  const ok = db.updateToken(id, body);
  if (!ok) return c.json({ error: "No fields updated" }, 400);

  // Reload into registry
  const updated = db.getToken(id)!;
  registerToken(updated);
  return c.json(updated);
});

// Delete token
tokensRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const db = getDb();
  // Check if any services reference this token
  const services = db.listServices().filter((s) => s.tokenId === id);
  if (services.length > 0) {
    return c.json({
      error: `Cannot delete: ${services.length} service(s) reference this token`,
      services: services.map((s) => ({ id: s.id, name: s.name })),
    }, 409);
  }
  const ok = db.deleteToken(id);
  if (!ok) return c.json({ error: "Token not found" }, 404);
  unregisterToken(id);
  return c.json({ deleted: true });
});
