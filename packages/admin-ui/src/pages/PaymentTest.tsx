import { useState, useCallback, useEffect, useRef } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodeAbiParameters, parseAbiParameters, concat } from "viem";

// ── EIP-1193 / EIP-6963 types ──────────────────────────────────────────────
interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  [key: string]: any;
}

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;       // data URI
  rdns: string;       // e.g. "io.metamask"
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

interface EIP6963AnnounceEvent extends Event {
  detail: EIP6963ProviderDetail;
}

declare global {
  interface Window { ethereum?: EIP1193Provider; }
  interface WindowEventMap {
    "eip6963:announceProvider": EIP6963AnnounceEvent;
  }
}

// keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
  )
);

type StepStatus = "idle" | "running" | "success" | "error";

interface Step {
  label: string;
  status: StepStatus;
  detail?: unknown;
  error?: string;
}

function makeSteps(): Step[] {
  return [
    { label: "Step 1 · 发送未授权请求，获取 402 支付要求", status: "idle" },
    { label: "Step 2 · 构建 EIP-712 签名 (TransferWithAuthorization)", status: "idle" },
    { label: "Step 3 · 携带支付凭证重发请求", status: "idle" },
    { label: "Step 4 · 解析链上结算结果", status: "idle" },
  ];
}

function StatusDot({ status }: { status: StepStatus }) {
  const colors: Record<StepStatus, string> = {
    idle: "#475569",
    running: "#fbbf24",
    success: "#34d399",
    error: "#f87171",
  };
  const labels: Record<StepStatus, string> = {
    idle: "等待",
    running: "执行中",
    success: "成功",
    error: "失败",
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: colors[status], display: "inline-block",
        boxShadow: status === "running" ? `0 0 8px ${colors[status]}` : "none",
        animation: status === "running" ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ fontSize: 11, color: colors[status], fontWeight: 600 }}>{labels[status]}</span>
    </span>
  );
}

function explorerTxUrl(txHash: string, network: string): string {
  if (network === "optimism-sepolia") return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
  if (network === "sepolia") return `https://sepolia.etherscan.io/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

/** Render a JSON value, auto-linking txHash fields to blockchain explorer */
function JsonViewer({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const isLong = text.split("\n").length > 15;

  // Extract txHash and network from data for the clickable link
  const obj = (typeof data === "object" && data !== null) ? data as Record<string, unknown> : null;
  const txHash = obj?.txHash as string | undefined;
  const network = obj?.network as string | undefined;

  return (
    <div style={{ position: "relative" }}>
      <pre style={{
        margin: 0, padding: 12, background: "#0d1117", borderRadius: 8,
        fontSize: 12, color: "#94a3b8", overflowX: "auto",
        maxHeight: expanded ? "none" : 320, overflowY: expanded ? "visible" : "auto",
        whiteSpace: "pre-wrap", wordBreak: "break-all",
        lineHeight: 1.6,
      }}>
        {text}
      </pre>
      {txHash && (
        <a
          href={explorerTxUrl(txHash, network ?? "")}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            margin: "8px 0 0", padding: "6px 14px",
            background: "#0c2d48", border: "1px solid #155e75",
            borderRadius: 8, color: "#22d3ee", fontSize: 12, fontWeight: 600,
            textDecoration: "none", transition: "background 0.2s, border-color 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#164e63"; e.currentTarget.style.borderColor = "#22d3ee"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#0c2d48"; e.currentTarget.style.borderColor = "#155e75"; }}
        >
          🔗 在区块链浏览器中查看交易 ↗
        </a>
      )}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            display: "block", margin: "6px auto 0", background: "#1e2d45",
            border: "none", borderRadius: 4, color: "#60a5fa", cursor: "pointer",
            fontSize: 11, padding: "3px 12px",
          }}
        >{expanded ? "收起" : "展开全部"}</button>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "#0d1117",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0",
  fontSize: 14, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "#60a5fa", display: "block", marginBottom: 6,
};

function stepBorderColor(status: StepStatus): string {
  if (status === "success") return "#065f46";
  if (status === "error") return "#7f1d1d";
  if (status === "running") return "#78350f";
  return "#1e2d45";
}

function stepBubbleBg(status: StepStatus): string {
  if (status === "success") return "#065f46";
  if (status === "error") return "#7f1d1d";
  return "#1e2d45";
}

function stepBubbleColor(status: StepStatus): string {
  if (status === "success") return "#34d399";
  if (status === "error") return "#f87171";
  return "#60a5fa";
}

type SignMode = "wallet" | "privatekey";

export function PaymentTest() {
  const [signMode, setSignMode] = useState<SignMode>("wallet");

  // ── Wallet state (EIP-6963 multi-wallet) ──
  const [discoveredWallets, setDiscoveredWallets] = useState<EIP6963ProviderDetail[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<EIP1193Provider | null>(null);
  const [selectedWalletName, setSelectedWalletName] = useState<string>("");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const accountsHandlerRef = useRef<((accounts: string[]) => void) | null>(null);

  // ── Private key state ──
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // ── Common state ──
  const [apiPath, setApiPath] = useState("");
  const [method, setMethod] = useState("GET");
  const [requestBody, setRequestBody] = useState("");
  const [steps, setSteps] = useState<Step[]>(makeSteps());
  const [running, setRunning] = useState(false);
  const [apiResult, setApiResult] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  // ── EIP-6963: discover all wallet extensions ──
  useEffect(() => {
    const wallets: EIP6963ProviderDetail[] = [];

    const handleAnnounce = (event: EIP6963AnnounceEvent) => {
      // Deduplicate by uuid
      if (!wallets.some(w => w.info.uuid === event.detail.info.uuid)) {
        wallets.push(event.detail);
        setDiscoveredWallets([...wallets]);
      }
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounce as any);
    // Ask all providers to announce themselves
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback: if no EIP-6963 providers found after 500ms, try window.ethereum
    const fallbackTimer = setTimeout(() => {
      if (wallets.length === 0 && window.ethereum) {
        const fallbackDetail: EIP6963ProviderDetail = {
          info: {
            uuid: "fallback-window-ethereum",
            name: window.ethereum.isMetaMask ? "MetaMask" : "Browser Wallet",
            icon: "",
            rdns: window.ethereum.isMetaMask ? "io.metamask" : "unknown",
          },
          provider: window.ethereum,
        };
        wallets.push(fallbackDetail);
        setDiscoveredWallets([...wallets]);
      }
    }, 500);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleAnnounce as any);
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Clean up accounts listener when provider changes
  useEffect(() => {
    return () => {
      if (accountsHandlerRef.current && selectedProvider) {
        selectedProvider.removeListener("accountsChanged", accountsHandlerRef.current);
      }
    };
  }, [selectedProvider]);

  const connectWallet = useCallback(async (wallet: EIP6963ProviderDetail) => {
    try {
      const accounts: string[] = await wallet.provider.request({ method: "eth_requestAccounts" });
      setSelectedProvider(wallet.provider);
      setSelectedWalletName(wallet.info.name);
      setWalletAddress(accounts[0] ?? null);

      // Listen for account changes
      const handler = (accs: string[]) => setWalletAddress(accs[0] ?? null);
      accountsHandlerRef.current = handler;
      wallet.provider.on("accountsChanged", handler);
    } catch (err: any) {
      if (err.code === 4001) {
        alert("用户拒绝了连接请求");
      } else {
        alert(`连接 ${wallet.info.name} 失败: ${err.message ?? err}`);
      }
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    if (accountsHandlerRef.current && selectedProvider) {
      selectedProvider.removeListener("accountsChanged", accountsHandlerRef.current);
      accountsHandlerRef.current = null;
    }
    setSelectedProvider(null);
    setSelectedWalletName("");
    setWalletAddress(null);
  }, [selectedProvider]);

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setDone(false);
    setApiResult(null);
    setSteps(makeSteps());

    // ── Resolve signer ──
    let agentAddress: `0x${string}`;
    let useWalletSignTypedData = false;
    let manualSignFn: ((digest: `0x${string}`) => Promise<`0x${string}`>) | null = null;

    if (signMode === "wallet") {
      if (!walletAddress || !selectedProvider) {
        alert("请先连接钱包");
        setRunning(false);
        return;
      }
      agentAddress = walletAddress as `0x${string}`;
      useWalletSignTypedData = true;
    } else {
      const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
      let account: ReturnType<typeof privateKeyToAccount>;
      try {
        account = privateKeyToAccount(pk);
      } catch {
        alert("私钥格式错误，请检查后重试");
        setRunning(false);
        return;
      }
      agentAddress = account.address;
      manualSignFn = async (digest) => account.sign({ hash: digest });
    }

    const extraHeaders: Record<string, string> = {
      "X-Agent-Address": agentAddress,
      ...(method !== "GET" && requestBody ? { "Content-Type": "application/json" } : {}),
    };

    function makeFetchInit(paymentSig?: string): RequestInit {
      return {
        method,
        headers: { ...extraHeaders, ...(paymentSig ? { "PAYMENT-SIGNATURE": paymentSig } : {}) },
        ...(method !== "GET" && requestBody ? { body: requestBody } : {}),
      };
    }

    try {
      // ── Step 1: Unauthenticated request ──────────────────────────────
      updateStep(0, { status: "running" });
      const res1 = await fetch(`/gateway${apiPath}`, makeFetchInit());
      let body1: any;
      try {
        body1 = await res1.json();
      } catch {
        updateStep(0, {
          status: "error",
          error: `无法解析服务器响应 (HTTP ${res1.status})，后端可能未启动`,
        });
        setRunning(false);
        return;
      }

      if (res1.status !== 402) {
        updateStep(0, {
          status: "error",
          error: `期望 402，实际收到 ${res1.status}（路径可能未注册）`,
          detail: body1,
        });
        setRunning(false);
        return;
      }

      const req = body1.requirement;
      updateStep(0, {
        status: "success",
        detail: {
          httpStatus: 402,
          network: req.network,
          maxAmountRequired: req.maxAmountRequired,
          payTo: req.payTo,
          asset: req.asset,
          maxTimeoutSeconds: req.maxTimeoutSeconds,
        },
      });

      // ── Step 2: Build & sign EIP-712 authorization ───────────────────
      updateStep(1, { status: "running" });

      const network = req.network as string;
      const domainSeparator = req.domainSeparator as `0x${string}`;
      const dsIsZero = domainSeparator === ("0x" + "0".repeat(64));

      if (!domainSeparator) {
        updateStep(1, { status: "error", error: "402 响应未包含 domainSeparator（网关版本过旧）" });
        setRunning(false);
        return;
      }

      // Check: wallet mode + DS=0 → signTypedData won't match server verification
      if (useWalletSignTypedData && dsIsZero) {
        updateStep(1, {
          status: "error",
          error: "合约 domainSeparator 为 0（initializeV2 未调用）。钱包 signTypedData 的签名与链上 DS=0 不一致，验证会失败。请切换到「私钥模式」作为临时方案。",
        });
        setRunning(false);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
      const value = BigInt(req.maxAmountRequired);
      const validAfter = 0n;
      const validBefore = BigInt(now + (req.maxTimeoutSeconds ?? 300));

      let signature: `0x${string}`;

      if (useWalletSignTypedData) {
        // ── MetaMask: signTypedData_v4 ──
        const chainId = req.chainId as number | undefined;
        const domainName = req.domainName as string | undefined;
        const domainVersion = req.domainVersion as string | undefined;
        if (!chainId) {
          updateStep(1, { status: "error", error: `402 响应未包含 chainId（网关版本过旧或链未配置）` });
          setRunning(false);
          return;
        }
        if (!domainName || !domainVersion) {
          updateStep(1, { status: "error", error: `402 响应未包含 domainName/domainVersion（代币未配置）` });
          setRunning(false);
          return;
        }

        // Request MetaMask to switch to the correct chain
        try {
          await selectedProvider!.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            updateStep(1, { status: "error", error: `请在 ${selectedWalletName} 中添加网络 ${network} 后重试` });
          } else if (switchErr.code === 4001) {
            updateStep(1, { status: "error", error: "用户拒绝切换网络" });
          } else {
            updateStep(1, { status: "error", error: `切换网络失败: ${switchErr.message}` });
          }
          setRunning(false);
          return;
        }

        const typedData = {
          types: {
            EIP712Domain: [
              { name: "name", type: "string" },
              { name: "version", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "verifyingContract", type: "address" },
            ],
            TransferWithAuthorization: [
              { name: "from", type: "address" },
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
              { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce", type: "bytes32" },
            ],
          },
          domain: {
            name: domainName,
            version: domainVersion,
            chainId: chainId,
            verifyingContract: req.asset as string,
          },
          primaryType: "TransferWithAuthorization",
          message: {
            from: agentAddress,
            to: req.payTo as string,
            value: value.toString(),
            validAfter: "0",
            validBefore: validBefore.toString(),
            nonce,
          },
        };

        try {
          signature = await selectedProvider!.request({
            method: "eth_signTypedData_v4",
            params: [agentAddress, JSON.stringify(typedData)],
          });
        } catch (signErr: any) {
          if (signErr.code === 4001) {
            updateStep(1, { status: "error", error: `用户在 ${selectedWalletName} 中拒绝签名` });
          } else {
            updateStep(1, { status: "error", error: `${selectedWalletName} 签名失败: ${signErr.message}` });
          }
          setRunning(false);
          return;
        }
      } else {
        // ── Private key: manual digest computation ──
        const structHash = keccak256(encodeAbiParameters(
          parseAbiParameters("bytes32, address, address, uint256, uint256, uint256, bytes32"),
          [
            TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
            agentAddress,
            req.payTo as `0x${string}`,
            value,
            validAfter,
            validBefore,
            nonce,
          ]
        ));
        const digest = keccak256(concat(["0x1901", domainSeparator, structHash]));
        signature = await manualSignFn!(digest);
      }

      const authorization = {
        from: agentAddress,
        to: req.payTo,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      };

      updateStep(1, {
        status: "success",
        detail: {
          mode: useWalletSignTypedData ? `${selectedWalletName} signTypedData` : "私钥本地签名",
          domainSeparator,
          note: dsIsZero
            ? "⚠ DS=0x0：合约 initializeV2 未调用"
            : "DS 已从合约 DOMAIN_SEPARATOR() 读取",
          authorization,
          signature: `${signature.slice(0, 22)}...${signature.slice(-10)}`,
        },
      });

      // ── Step 3: Send payment request ──────────────────────────────────
      updateStep(2, { status: "running" });

      const payload = {
        x402Version: 1,
        scheme: "exact",
        network,
        payload: { signature, authorization },
      };
      const paymentHeader = btoa(JSON.stringify(payload));

      const res2 = await fetch(`/gateway${apiPath}`, makeFetchInit(paymentHeader));

      // Read body once before any other operations
      const ct = res2.headers.get("content-type") ?? "";
      const apiBody = ct.includes("json") ? await res2.json().catch(() => null) : await res2.text();
      const settlementHeader = res2.headers.get("PAYMENT-RESPONSE");
      const settlement = settlementHeader ? JSON.parse(atob(settlementHeader)) : null;

      if (!res2.ok) {
        updateStep(2, { status: "error", error: `HTTP ${res2.status}`, detail: apiBody });
        setRunning(false);
        return;
      }

      updateStep(2, {
        status: "success",
        detail: { httpStatus: res2.status, settlement },
      });

      // ── Step 4: Settlement result ──────────────────────────────────────
      updateStep(3, { status: "running" });
      if (!settlement) {
        updateStep(3, { status: "success", detail: { status: "无结算响应（旧版网关）" } });
      } else if (settlement.settlementError) {
        updateStep(3, {
          status: "error",
          error: settlement.settlementError,
          detail: {
            note: "链上结算失败。交易未广播（viem 模拟阶段即失败，不消耗 gas）",
            reason: settlement.settlementError,
          },
        });
      } else {
        updateStep(3, {
          status: "success",
          detail: { txHash: settlement.txHash, network, status: "链上结算已广播" },
        });
        setApiResult(apiBody);
        setDone(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSteps(prev => {
        const idx = prev.findIndex(s => s.status === "running");
        if (idx < 0) return prev;
        return prev.map((s, i) => i === idx ? { ...s, status: "error", error: msg } : s);
      });
    } finally {
      setRunning(false);
    }
  }

  const hasStarted = steps.some(s => s.status !== "idle");
  const canRun = signMode === "wallet" ? !!walletAddress : !!privateKey;

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Payment Flow Test</h1>
      <p style={{ color: "#475569", fontSize: 13, marginBottom: 28 }}>
        可视化执行完整 x402 支付流程 &nbsp;·&nbsp; 支持 Web3 钱包签名或私钥本地签名
      </p>

      {/* ── Form ── */}
      <form onSubmit={run} style={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 12, padding: 24, marginBottom: 24 }}>

        {/* ── Sign mode tabs ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 8, overflow: "hidden", border: "1px solid #1e2d45" }}>
          <button type="button" onClick={() => setSignMode("wallet")} style={{
            flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            background: signMode === "wallet" ? "#1d4ed8" : "#0d1117",
            color: signMode === "wallet" ? "#fff" : "#64748b",
            transition: "all 0.2s",
          }}>
            🔗 Web3 钱包
          </button>
          <button type="button" onClick={() => setSignMode("privatekey")} style={{
            flex: 1, padding: "10px 0", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
            background: signMode === "privatekey" ? "#1d4ed8" : "#0d1117",
            color: signMode === "privatekey" ? "#fff" : "#64748b",
            transition: "all 0.2s",
          }}>
            🔑 私钥输入
          </button>
        </div>

        {/* ── Wallet connect (multi-wallet via EIP-6963) ── */}
        {signMode === "wallet" && (
          <div style={{ marginBottom: 16 }}>
            {walletAddress && selectedProvider ? (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", background: "#0d1117", border: "1px solid #065f46",
                borderRadius: 8,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "#34d399", fontWeight: 600, marginBottom: 4 }}>
                    ✓ 已通过 {selectedWalletName} 连接
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, color: "#e2e8f0", wordBreak: "break-all" }}>
                    {walletAddress}
                  </div>
                </div>
                <button type="button" onClick={disconnectWallet} style={{
                  background: "none", border: "1px solid #1e2d45", borderRadius: 6,
                  color: "#64748b", cursor: "pointer", fontSize: 12, padding: "4px 10px",
                  flexShrink: 0, marginLeft: 12,
                }}>断开</button>
              </div>
            ) : discoveredWallets.length === 0 ? (
              <div style={{
                padding: "14px 16px", background: "#1c1917", border: "1px solid #78350f",
                borderRadius: 8, color: "#fbbf24", fontSize: 13, lineHeight: 1.7,
              }}>
                ⚠ 未检测到 Web3 钱包插件。请安装以下任一钱包扩展：
                <span style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                  <a href="https://metamask.io/download/" target="_blank" rel="noreferrer"
                    style={{ color: "#60a5fa", textDecoration: "none" }}>MetaMask</a>
                  <a href="https://app.uniswap.org" target="_blank" rel="noreferrer"
                    style={{ color: "#60a5fa", textDecoration: "none" }}>Uniswap Wallet</a>
                  <a href="https://web3.bitget.com/" target="_blank" rel="noreferrer"
                    style={{ color: "#60a5fa", textDecoration: "none" }}>Bitget Wallet</a>
                </span>
                <div style={{ marginTop: 6, fontSize: 12, color: "#92400e" }}>或切换到「私钥输入」模式。</div>
              </div>
            ) : (
              <div>
                <label style={{ ...labelStyle, marginBottom: 10 }}>选择钱包</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {discoveredWallets.map((w) => (
                    <button
                      key={w.info.uuid}
                      type="button"
                      onClick={() => connectWallet(w)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", padding: "12px 16px",
                        background: "#0d1117", border: "1px solid #1e2d45",
                        borderRadius: 8, cursor: "pointer",
                        transition: "border-color 0.2s, background 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#3b82f6";
                        e.currentTarget.style.background = "#111827";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#1e2d45";
                        e.currentTarget.style.background = "#0d1117";
                      }}
                    >
                      {w.info.icon ? (
                        <img src={w.info.icon} alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />
                      ) : (
                        <div style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: "#1e2d45", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 14, color: "#60a5fa",
                        }}>🔗</div>
                      )}
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>{w.info.name}</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{w.info.rdns}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Private key input ── */}
        {signMode === "privatekey" && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Agent 私钥</label>
            <div style={{ position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                value={privateKey}
                onChange={e => setPrivateKey(e.target.value)}
                placeholder="0x..."
                style={{ ...inputStyle, paddingRight: 56 }}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#60a5fa", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, padding: "4px 6px",
                }}
              >{showKey ? "隐藏" : "显示"}</button>
            </div>
            <div style={{ fontSize: 11, color: "#334155", marginTop: 4 }}>
              私钥仅在浏览器本地使用，不会传输至任何服务器
            </div>
          </div>
        )}

        {/* ── API path & method ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>API 路径</label>
            <input
              value={apiPath}
              onChange={e => setApiPath(e.target.value)}
              placeholder="/echo (请输入已注册服务的网关路径)"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>HTTP 方法</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </div>
        </div>

        {method !== "GET" && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>请求体 (JSON)</label>
            <textarea
              value={requestBody}
              onChange={e => setRequestBody(e.target.value)}
              rows={3}
              placeholder='{"key": "value"}'
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
            />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="submit"
            disabled={running || !canRun}
            style={{
              padding: "10px 32px",
              background: (running || !canRun) ? "#1e2d45" : "#1d4ed8",
              color: (running || !canRun) ? "#475569" : "#fff",
              border: "none", borderRadius: 8,
              cursor: (running || !canRun) ? "not-allowed" : "pointer",
              fontSize: 14, fontWeight: 700,
              transition: "background 0.2s",
            }}
          >
            {running ? "⏳ 执行中..." : "▶ 执行完整支付流程"}
          </button>
          <span style={{ fontSize: 12, color: "#334155" }}>
            {signMode === "wallet" ? "钱包弹窗签名" : "私钥不离开浏览器"}
          </span>
        </div>
      </form>

      {/* ── Step cards ── */}
      {hasStarted && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {steps.map((step, idx) => (
            <div key={idx} style={{
              background: "#111827",
              border: `1px solid ${stepBorderColor(step.status)}`,
              borderRadius: 12, overflow: "hidden",
              transition: "border-color 0.3s",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: stepBubbleBg(step.status),
                    color: stepBubbleColor(step.status),
                    flexShrink: 0,
                  }}>{idx + 1}</div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: step.status === "idle" ? "#475569" : "#e2e8f0",
                  }}>{step.label}</span>
                </div>
                <StatusDot status={step.status} />
              </div>

              {step.error && (
                <div style={{ padding: "0 18px 14px", color: "#f87171", fontSize: 12 }}>
                  ⚠ {step.error}
                </div>
              )}

              {step.detail !== undefined && (
                <div style={{ padding: "0 18px 14px" }}>
                  <JsonViewer data={step.detail} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Final API result ── */}
      {done && apiResult !== null && (
        <div style={{
          background: "#111827",
          border: "1px solid #065f46",
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399", marginBottom: 14 }}>
            ✅ API 响应内容
          </div>
          <JsonViewer data={apiResult} />
        </div>
      )}
    </div>
  );
}
