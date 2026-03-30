// packages/provider-ui/src/pages/Services.tsx
import { useState, useEffect, useCallback } from "react";
import { listMyServices, createService, deleteService, listAvailableTokens, listAvailableChains } from "../api.js";
import type { Service, TokenConfig, ChainConfig } from "@x402-gateway-mvp/shared";
import { useAuth } from "../auth.js";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#0d1117",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none",
};
const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6, marginTop: 14 };

interface FormData {
  name: string; gatewayPath: string; backendUrl: string;
  priceAmount: string; network: string; tokenId: string; minReputation: number;
}
const EMPTY: FormData = { name: "", gatewayPath: "", backendUrl: "", priceAmount: "0.001", network: "", tokenId: "", minReputation: 0 };

export function Services() {
  const { provider } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [svcs, toks, chs] = await Promise.all([listMyServices(), listAvailableTokens(), listAvailableChains()]);
    setServices(svcs); setTokens(toks); setChains(chs);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter tokens by selected network
  const availableTokens = form.network ? tokens.filter(t => t.chainSlug === form.network) : tokens;

  const handleCreate = async () => {
    if (!form.name || !form.gatewayPath || !form.backendUrl || !form.network || !form.tokenId) {
      setError("请填写所有必填字段"); return;
    }
    setSaving(true); setError("");
    try {
      await createService({ ...form, recipient: provider?.walletAddress ?? "" });
      setShowForm(false); setForm(EMPTY);
      await load();
    } catch (e: unknown) { setError((e instanceof Error ? e.message : undefined) ?? "创建失败"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确认删除服务「${name}」？`)) return;
    await deleteService(id);
    await load();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22 }}>我的服务</h1>
        <button
          onClick={() => setShowForm(true)}
          style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer" }}
        >
          + 新建服务
        </button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, width: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ color: "#e2e8f0", marginBottom: 16 }}>新建服务</h2>

            <label style={LABEL}>服务名称 *</label>
            <input style={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My API" />

            <label style={LABEL}>网关路径 * (例: /my-api)</label>
            <input style={INPUT} value={form.gatewayPath} onChange={e => setForm(f => ({ ...f, gatewayPath: e.target.value }))} placeholder="/my-api" />

            <label style={LABEL}>后端地址 *</label>
            <input style={INPUT} value={form.backendUrl} onChange={e => setForm(f => ({ ...f, backendUrl: e.target.value }))} placeholder="https://api.example.com" />

            <label style={LABEL}>网络 *</label>
            <select
              style={{ ...INPUT, cursor: "pointer" }}
              value={form.network}
              onChange={e => setForm(f => ({ ...f, network: e.target.value, tokenId: "" }))}
            >
              <option value="">-- 选择网络 --</option>
              {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <label style={LABEL}>收款 Token *</label>
            <select
              style={{ ...INPUT, cursor: "pointer" }}
              value={form.tokenId}
              onChange={e => setForm(f => ({ ...f, tokenId: e.target.value }))}
            >
              <option value="">-- 选择 Token --</option>
              {availableTokens.map(t => <option key={t.id} value={t.id}>{t.symbol} ({t.id})</option>)}
            </select>

            <label style={LABEL}>价格 (DMHKD) *</label>
            <input style={INPUT} type="number" step="0.001" value={form.priceAmount} onChange={e => setForm(f => ({ ...f, priceAmount: e.target.value }))} />

            <label style={LABEL}>最低信誉分 (0 = 不限)</label>
            <input style={INPUT} type="number" min="0" max="100" value={form.minReputation} onChange={e => setForm(f => ({ ...f, minReputation: parseInt(e.target.value) || 0 }))} />

            {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={handleCreate} disabled={saving} style={{ flex: 1, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>
                {saving ? "创建中..." : "创建"}
              </button>
              <button onClick={() => { setShowForm(false); setForm(EMPTY); setError(""); }} style={{ flex: 1, background: "transparent", color: "#9ca3af", border: "1px solid #1e2d45", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Services List */}
      {services.length === 0 ? (
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280" }}>还没有服务，点击「新建服务」开始</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {services.map(s => (
            <div key={s.id} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ color: "#e2e8f0", fontWeight: 600 }}>{s.name}</p>
                <p style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: 13, marginTop: 4 }}>{s.gatewayPath}</p>
                <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{s.network} · {s.priceAmount} {s.priceCurrency}</p>
              </div>
              <button
                onClick={() => handleDelete(s.id, s.name)}
                style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
