import { useState, useEffect, useCallback } from "react";
import { listTokens, createToken, updateToken, deleteToken, listChains, verifyTokenContract } from "../api.js";
import type { TokenConfig, ChainConfig } from "@x402-gateway-mvp/shared";
import type { TokenVerifyResult } from "../api.js";

const CARD_BG = "#111827";
const CARD_BORDER = "#1e2d45";
const ACCENT = "#3b82f6";
const SUCCESS = "#10b981";
const DANGER = "#ef4444";
const WARN = "#f59e0b";
const TEXT_PRIMARY = "#e2e8f0";
const TEXT_SECONDARY = "#94a3b8";
const TEXT_MUTED = "#475569";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: "#0d1117",
  border: `1px solid ${CARD_BORDER}`, borderRadius: 10, color: TEXT_PRIMARY,
  fontSize: 14, boxSizing: "border-box", outline: "none",
};

const btnBase: React.CSSProperties = {
  border: "none", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600, padding: "8px 18px",
  transition: "background 0.2s",
};

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: bg,
      padding: "3px 9px", borderRadius: 20, letterSpacing: 0.3,
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

function TokenCard({
  token, chains, onUpdate, onDelete,
}: {
  token: TokenConfig;
  chains: ChainConfig[];
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    contractAddress: token.contractAddress,
    domainName: token.domainName,
    domainVersion: token.domainVersion,
    isActive: token.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chain = chains.find((c) => c.id === token.chainSlug);

  // Soft chain label colors (no reds or alarming tones)
  const chainLabelColors: Record<string, { text: string; bg: string }> = {
    "optimism-sepolia": { text: "#f97316", bg: "#431407" },
    "optimism":         { text: "#f97316", bg: "#431407" },
    "sepolia":          { text: "#22d3ee", bg: "#083344" },
    "ethereum":         { text: "#818cf8", bg: "#1e1b4b" },
    "base":             { text: "#3b82f6", bg: "#172554" },
    "base-sepolia":     { text: "#60a5fa", bg: "#172554" },
    "arbitrum":         { text: "#2dd4bf", bg: "#042f2e" },
    "polygon":          { text: "#a78bfa", bg: "#2e1065" },
  };
  const cl = chainLabelColors[token.chainSlug] || { text: "#60a5fa", bg: "#172554" };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateToken(token.id, form);
      setEditing(false);
      onUpdate();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm(`确定删除代币 "${token.symbol}" (${token.id})？\n注意: 被服务引用的代币无法删除。`)) return;
    try {
      await deleteToken(token.id);
      onDelete();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14,
      overflow: "hidden", transition: "border-color 0.2s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2d4a6f"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", gap: 12 }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: token.isActive ? "#0d2818" : "#1e293b",
            border: `1px solid ${token.isActive ? "#166534" : CARD_BORDER}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800,
            color: token.isActive ? SUCCESS : TEXT_MUTED,
          }}>{token.symbol.slice(0, 3)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{token.symbol}</span>
              {token.name && <span style={{ fontSize: 12, color: TEXT_MUTED }}>{token.name}</span>}
              <Badge text={chain?.name || token.chainSlug} color={cl.text} bg={cl.bg} />
              {chain?.isTestnet && <Badge text="TESTNET" color="#f59e0b" bg="#422006" />}
              {token.isActive
                ? <Badge text="ACTIVE" color={SUCCESS} bg="#052e16" />
                : <Badge text="INACTIVE" color={DANGER} bg="#3b1111" />
              }
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: TEXT_MUTED, fontFamily: "monospace" }}>{token.contractAddress.slice(0, 10)}...{token.contractAddress.slice(-6)}</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>Decimals: {token.decimals}</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>Domain: {token.domainName} v{token.domainVersion}</span>
            </div>
          </div>
        </div>
        <span style={{ fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${CARD_BORDER}`, padding: "16px 20px", background: "#0c1018" }}>
          {!editing ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>合约地址</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY, wordBreak: "break-all" }}>{token.contractAddress}</code>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Token ID</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY }}>{token.id}</code>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>链</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY }}>{chain?.name || token.chainSlug}</code>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>EIP-712 Domain Name</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY }}>{token.domainName}</code>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>EIP-712 Domain Version</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY }}>{token.domainVersion}</code>
                </div>
              </div>
              <div style={{
                padding: "10px 14px", background: "#1a1a2e", border: `1px solid ${CARD_BORDER}`,
                borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span style={{ fontSize: 14 }}>⚠️</span>
                <span style={{ fontSize: 11, color: WARN }}>此代币须实现 EIP-3009 transferWithAuthorization 接口 (如 USDC / EURC / FiatToken 标准)</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: "#60a5fa" }}>✏️ 编辑</button>
                <button onClick={(e) => { e.stopPropagation(); remove(); }} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: DANGER }}>🗑 删除</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {error && <div style={{ fontSize: 13, color: "#fca5a5", padding: "8px 12px", background: "#3b1111", borderRadius: 8 }}>{error}</div>}
              <div>
                <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>合约地址</label>
                <input style={inputStyle} value={form.contractAddress} onChange={(e) => setForm({ ...form, contractAddress: e.target.value })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>EIP-712 Domain Name</label>
                  <input style={inputStyle} value={form.domainName} onChange={(e) => setForm({ ...form, domainName: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>EIP-712 Domain Version</label>
                  <input style={inputStyle} value={form.domainVersion} onChange={(e) => setForm({ ...form, domainVersion: e.target.value })} />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>启用</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={save} disabled={saving} style={{ ...btnBase, background: ACCENT, color: "#fff" }}>{saving ? "保存中..." : "💾 保存"}</button>
                <button onClick={() => setEditing(false)} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerifyBadge({ ok, label, warn, status }: { ok: boolean; label: string; warn?: string; status?: "ok" | "warn" | "fail" }) {
  // status overrides ok for 3-state display: ok (green ✅), warn (yellow ⚠️), fail (red ❌)
  const resolvedStatus = status ?? (ok ? "ok" : "fail");
  const icon = resolvedStatus === "ok" ? "✅" : resolvedStatus === "warn" ? "⚠️" : "❌";
  const color = resolvedStatus === "ok" ? SUCCESS : resolvedStatus === "warn" ? WARN : DANGER;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
      {warn && <span style={{ fontSize: 11, color: TEXT_MUTED, marginLeft: 4 }}>— {warn}</span>}
    </div>
  );
}

type FormStep = "input" | "verifying" | "review" | "submitting";

function CreateTokenForm({ chains, tokens: existingTokens, onCreated }: { chains: ChainConfig[]; tokens: TokenConfig[]; onCreated: () => void }) {
  const [chainSlug, setChainSlug] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [step, setStep] = useState<FormStep>("input");
  const [verifyResult, setVerifyResult] = useState<TokenVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Editable overrides for review step
  const [overrides, setOverrides] = useState({
    id: "", symbol: "", name: "", domainName: "", domainVersion: "", decimals: "6", isActive: true,
  });

  const reset = () => {
    setStep("input");
    setChainSlug("");
    setContractAddress("");
    setVerifyResult(null);
    setError(null);
    setOverrides({ id: "", symbol: "", name: "", domainName: "", domainVersion: "", decimals: "6", isActive: true });
  };

  const handleVerify = async () => {
    setError(null);
    if (!chainSlug) { setError("请先选择链"); return; }
    if (!contractAddress || !contractAddress.startsWith("0x")) { setError("请输入有效的合约地址"); return; }

    // Client-side duplicate check
    const dup = existingTokens.find(
      (t) => t.chainSlug === chainSlug && t.contractAddress.toLowerCase() === contractAddress.toLowerCase()
    );
    if (dup) {
      setError(`该链上已存在相同合约地址的代币: "${dup.id}" (${dup.symbol})，无法重复添加`);
      return;
    }

    setStep("verifying");
    try {
      const result = await verifyTokenContract(chainSlug, contractAddress);
      setVerifyResult(result);
      if (result.error && !result.erc20) {
        setError(result.error);
        setStep("input");
        return;
      }
      // Pre-fill overrides from on-chain data
      setOverrides({
        id: result.suggestedId || "",
        symbol: result.symbol || "",
        name: result.name || "",
        domainName: result.domainName || "",
        domainVersion: result.domainVersion || "2",
        decimals: String(result.decimals ?? 6),
        isActive: true,
      });
      setStep("review");
    } catch (err: any) {
      setError(err.message);
      setStep("input");
    }
  };

  const handleConfirm = async () => {
    setError(null);
    if (!overrides.id || !overrides.symbol || !overrides.domainName) {
      setError("代币 ID、符号和 Domain Name 为必填项");
      return;
    }
    setStep("submitting");
    try {
      await createToken({
        id: overrides.id,
        symbol: overrides.symbol,
        name: overrides.name,
        chainSlug,
        contractAddress: verifyResult!.contractAddress,
        decimals: Number(overrides.decimals),
        domainName: overrides.domainName,
        domainVersion: overrides.domainVersion,
        isActive: overrides.isActive,
      });
      onCreated();
      reset();
    } catch (err: any) {
      setError(err.message);
      setStep("review");
    }
  };

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 3, height: 12, borderRadius: 2, background: "#60a5fa", display: "inline-block" }} />
        添加新代币
      </div>
      <div style={{
        padding: "10px 14px", background: "#1a1a2e", border: `1px solid ${CARD_BORDER}`,
        borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: 11, color: WARN }}>输入链和合约地址后，系统将自动验证 ERC-3009 合规性并读取代币信息</span>
      </div>

      {error && <div style={{ fontSize: 13, color: "#fca5a5", padding: "8px 12px", background: "#3b1111", borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {/* ── Step 1: Input chain + address ── */}
      {(step === "input" || step === "verifying") && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>所属链</label>
              <select style={{ ...inputStyle, appearance: "auto" }} value={chainSlug} onChange={(e) => setChainSlug(e.target.value)} disabled={step === "verifying"}>
                <option value="">选择链...</option>
                {chains.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>合约地址</label>
              <input style={inputStyle} placeholder="0x..." value={contractAddress} onChange={(e) => setContractAddress(e.target.value)} disabled={step === "verifying"} />
            </div>
          </div>
          <button type="button" onClick={handleVerify} disabled={step === "verifying"} style={{ ...btnBase, background: ACCENT, color: "#fff", padding: "10px 24px" }}>
            {step === "verifying" ? "🔍 验证中..." : "🔍 验证合约"}
          </button>
        </>
      )}

      {/* ── Step 2: Review verified data ── */}
      {(step === "review" || step === "submitting") && verifyResult && (
        <>
          {/* Verification results */}
          <div style={{
            background: "#0c1018", border: `1px solid ${CARD_BORDER}`, borderRadius: 10,
            padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", marginBottom: 10 }}>合约验证结果</div>
            {/* Overall x402 compatibility banner */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
              padding: "7px 11px",
              background: verifyResult.x402Compatible ? "#052e16" : "#3b0a0a",
              border: `1px solid ${verifyResult.x402Compatible ? "#166534" : "#7f1d1d"}`,
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 15 }}>{verifyResult.x402Compatible ? "✅" : "❌"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: verifyResult.x402Compatible ? SUCCESS : DANGER }}>
                {verifyResult.x402Compatible ? "x402 兼容" : "不兼容 x402 支付协议"}
              </span>
              {!verifyResult.x402Compatible && (
                <span style={{ fontSize: 11, color: TEXT_MUTED }}>— 需要 ERC-20、ERC-3009 及有效的 DOMAIN_SEPARATOR</span>
              )}
            </div>
            {/* Three essential checks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <VerifyBadge ok={verifyResult.erc20} label="ERC-20 标准" />
              <VerifyBadge ok={verifyResult.erc3009} label="ERC-3009 transferWithAuthorization" warn={verifyResult.erc3009Warning} />
              <VerifyBadge ok={!!verifyResult.domainSeparator} label="DOMAIN_SEPARATOR()"
                status={verifyResult.domainSeparator && verifyResult.domainSeparator !== "0x" + "0".repeat(64) ? "ok" : (verifyResult.domainSeparator ? "warn" : "fail")}
                warn={verifyResult.domainSeparator && verifyResult.domainSeparator === "0x" + "0".repeat(64)
                  ? "值为全零，合约可能尚未初始化"
                  : verifyResult.domainSeparatorWarning} />
            </div>
            {/* EIP-5267 informational row — not a compatibility requirement */}
            <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 6 }}>
              <span style={{ fontSize: 12, marginTop: 1 }}>ℹ️</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED, lineHeight: 1.5 }}>
                EIP-5267 eip712Domain(): {verifyResult.domainNameSource === "eip5267"
                  ? <span style={{ color: SUCCESS }}>链上读取成功，域名/版本已验证</span>
                  : verifyResult.eip712Domain
                    ? <span style={{ color: TEXT_SECONDARY }}>已实现，但当前调用失败（代理合约初始化前的正常现象，不影响 x402 使用）</span>
                    : <span style={{ color: TEXT_SECONDARY }}>未实现（不影响 x402 使用，域信息由 DOMAIN_SEPARATOR 提供）</span>
                }
              </span>
            </div>
            {verifyResult.domainSeparator && (
              <div style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600 }}>DOMAIN_SEPARATOR: </span>
                <code style={{ fontSize: 10, color: TEXT_SECONDARY, wordBreak: "break-all" }}>{verifyResult.domainSeparator}</code>
              </div>
            )}
            {verifyResult.proxyDetected && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 10, color: WARN, fontWeight: 600 }}>🔗 代理合约 (EIP-1967) </span>
                {verifyResult.implementationAddress && (
                  <code style={{ fontSize: 10, color: TEXT_SECONDARY, wordBreak: "break-all" }}>→ {verifyResult.implementationAddress}</code>
                )}
              </div>
            )}
          </div>

          {/* Editable form fields pre-filled from on-chain */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>代币 ID</label>
              <input style={inputStyle} value={overrides.id} onChange={(e) => setOverrides({ ...overrides, id: e.target.value })} disabled={step === "submitting"} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>
                代币符号 {verifyResult.erc20 && <span style={{ fontSize: 10, color: SUCCESS }}>(链上读取)</span>}
              </label>
              <input style={inputStyle} value={overrides.symbol} onChange={(e) => setOverrides({ ...overrides, symbol: e.target.value })} disabled={step === "submitting"} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>
                代币名称 {verifyResult.erc20 && <span style={{ fontSize: 10, color: SUCCESS }}>(链上读取)</span>}
              </label>
              <input style={inputStyle} value={overrides.name} onChange={(e) => setOverrides({ ...overrides, name: e.target.value })} disabled={step === "submitting"} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>
                小数位数 {verifyResult.erc20 && <span style={{ fontSize: 10, color: SUCCESS }}>(链上读取)</span>}
              </label>
              <input style={inputStyle} type="number" min="0" max="18" value={overrides.decimals} onChange={(e) => setOverrides({ ...overrides, decimals: e.target.value })} disabled={step === "submitting"} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>
                EIP-712 Domain Name
                {verifyResult.domainNameSource === "eip5267"
                  ? <span style={{ fontSize: 10, color: SUCCESS }}> (链上验证)</span>
                  : <span style={{ fontSize: 10, color: WARN }}> (从合约符号推断，可修改)</span>
                }
              </label>
              <input style={inputStyle} value={overrides.domainName} onChange={(e) => setOverrides({ ...overrides, domainName: e.target.value })} disabled={step === "submitting"} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>
                EIP-712 Domain Version
                {verifyResult.domainNameSource === "eip5267"
                  ? <span style={{ fontSize: 10, color: SUCCESS }}> (链上验证)</span>
                  : <span style={{ fontSize: 10, color: WARN }}> (从合约符号推断，可修改)</span>
                }
              </label>
              <input style={inputStyle} value={overrides.domainVersion} onChange={(e) => setOverrides({ ...overrides, domainVersion: e.target.value })} disabled={step === "submitting"} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={overrides.isActive} onChange={(e) => setOverrides({ ...overrides, isActive: e.target.checked })} disabled={step === "submitting"} />
              <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>启用</span>
            </label>
            <span style={{ fontSize: 11, color: TEXT_MUTED }}>
              链: <strong style={{ color: TEXT_SECONDARY }}>{chains.find((c) => c.id === chainSlug)?.name || chainSlug}</strong>
              {" · "}合约: <code style={{ fontSize: 11, color: TEXT_SECONDARY }}>{verifyResult.contractAddress}</code>
            </span>
          </div>

          {!verifyResult.erc3009 && (
            <div style={{
              padding: "10px 14px", background: "#3b1111", border: "1px solid #7f1d1d",
              borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 12, color: "#fca5a5" }}>
                该合约未检测到 ERC-3009 transferWithAuthorization 支持。添加后支付流程可能无法正常工作。继续添加请自行确认合约兼容性。
              </span>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleConfirm} disabled={step === "submitting"} style={{ ...btnBase, background: SUCCESS, color: "#fff", padding: "10px 24px" }}>
              {step === "submitting" ? "添加中..." : "✅ 确认添加"}
            </button>
            <button type="button" onClick={reset} disabled={step === "submitting"} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>
              ↩ 重新输入
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function Tokens() {
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([listTokens(), listChains()]);
      setTokens(t);
      setChains(c);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const displayed = filter ? tokens.filter((t) => t.chainSlug === filter) : tokens;
  const activeCount = tokens.filter((t) => t.isActive).length;
  const uniqueChains = [...new Set(tokens.map((t) => t.chainSlug))];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>代币配置</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>管理可支付的稳定币 (需实现 EIP-3009)</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowForm((v) => !v)} style={{
            ...btnBase, fontSize: 13,
            background: showForm ? ACCENT + "20" : "transparent",
            border: `1px solid ${showForm ? ACCENT : CARD_BORDER}`,
            color: showForm ? ACCENT : TEXT_SECONDARY,
          }}>➕ 添加代币</button>
          <button onClick={load} style={{ ...btnBase, fontSize: 13, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>↻ 刷新</button>
        </div>
      </div>

      {showForm && <CreateTokenForm chains={chains} tokens={tokens} onCreated={() => { load(); setShowForm(false); }} />}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "💰", label: "总代币数", value: tokens.length, accent: ACCENT },
          { icon: "✅", label: "已启用", value: activeCount, accent: SUCCESS },
          { icon: "⛓", label: "覆盖链数", value: uniqueChains.length, accent: WARN },
        ].map((s) => (
          <div key={s.label} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.accent }}>{s.value}</div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      {uniqueChains.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("")} style={{ ...btnBase, fontSize: 11, padding: "5px 12px", background: !filter ? ACCENT + "20" : "transparent", border: `1px solid ${!filter ? ACCENT : CARD_BORDER}`, color: !filter ? ACCENT : TEXT_MUTED }}>全部</button>
          {uniqueChains.map((slug) => {
            const c = chains.find((ch) => ch.id === slug);
            return (
              <button key={slug} onClick={() => setFilter(slug)} style={{ ...btnBase, fontSize: 11, padding: "5px 12px", background: filter === slug ? ACCENT + "20" : "transparent", border: `1px solid ${filter === slug ? ACCENT : CARD_BORDER}`, color: filter === slug ? ACCENT : TEXT_MUTED }}>
                {c?.name || slug}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: TEXT_MUTED, background: CARD_BG, borderRadius: 14, border: `1px solid ${CARD_BORDER}` }}>⏳ 加载中...</div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: "60px 24px", textAlign: "center", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`, borderRadius: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>💰</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>暂无代币</div>
          <div style={{ fontSize: 14, color: TEXT_MUTED }}>点击「添加代币」配置可支付的稳定币</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayed.map((t) => (
            <TokenCard key={t.id} token={t} chains={chains} onUpdate={load} onDelete={load} />
          ))}
        </div>
      )}
    </div>
  );
}
