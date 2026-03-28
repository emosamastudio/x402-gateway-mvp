import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  listChains, createChain, updateChain, deleteChain,
  listRpcEndpoints, createRpcEndpoint, updateRpcEndpoint, deleteRpcEndpoint,
  triggerRpcHealthCheck, resetRpcEndpointStats, listRpcStatsHistory,
} from "../api.js";
import type { ChainConfig, RpcEndpoint } from "@x402-gateway-mvp/shared";
import type { RpcStatsSnapshot } from "../api.js";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

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

/* ── Health Status Badge ── */
function HealthBadge({ status, latency }: { status: string; latency: number }) {
  const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    healthy:  { label: "健康", color: SUCCESS, bg: "#052e16", dot: SUCCESS },
    degraded: { label: "降级", color: WARN, bg: "#422006", dot: WARN },
    down:     { label: "离线", color: DANGER, bg: "#3b1111", dot: DANGER },
    unknown:  { label: "未检测", color: TEXT_MUTED, bg: "#1e293b", dot: TEXT_MUTED },
  };
  const m = map[status] || map.unknown;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, color: m.color, background: m.bg,
      padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, display: "inline-block" }} />
      {m.label}
      {latency >= 0 && <span style={{ fontWeight: 400, opacity: 0.8 }}>{latency}ms</span>}
    </span>
  );
}

/* ── RPC Endpoint Card ── */
function RpcEndpointCard({
  endpoint, onUpdate, onDelete,
}: {
  endpoint: RpcEndpoint;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ label: endpoint.label, url: endpoint.url, priority: endpoint.priority, isActive: endpoint.isActive });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateRpcEndpoint(endpoint.id, form);
      setEditing(false);
      onUpdate();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm(`确定删除 RPC 端点 "${endpoint.label || endpoint.url}"？`)) return;
    try {
      await deleteRpcEndpoint(endpoint.id);
      onDelete();
    } catch (e: any) { alert(e.message); }
  };

  const resetStats = async () => {
    try {
      await resetRpcEndpointStats(endpoint.id);
      onUpdate();
    } catch (e: any) { alert(e.message); }
  };

  const errorRate = endpoint.totalRequests > 0
    ? ((endpoint.totalErrors / endpoint.totalRequests) * 100).toFixed(1)
    : "0.0";

  if (editing) {
    return (
      <div style={{ background: "#0c1018", border: `1px solid ${CARD_BORDER}`, borderRadius: 10, padding: 14 }}>
        {error && <div style={{ fontSize: 12, color: "#fca5a5", padding: "6px 10px", background: "#3b1111", borderRadius: 6, marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>标签</label>
            <input style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Alchemy" />
          </div>
          <div>
            <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>URL</label>
            <input style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{ width: 80 }}>
            <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>优先级</label>
            <input style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }} type="number" min="0" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", marginTop: 14 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>启用</span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={save} disabled={saving} style={{ ...btnBase, fontSize: 11, padding: "6px 14px", background: ACCENT, color: "#fff" }}>{saving ? "..." : "保存"}</button>
          <button onClick={() => setEditing(false)} style={{ ...btnBase, fontSize: 11, padding: "6px 14px", background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#0c1018", border: `1px solid ${CARD_BORDER}`, borderRadius: 10,
      padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
      opacity: endpoint.isActive ? 1 : 0.5,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT_PRIMARY }}>
            {endpoint.label || `端点 #${endpoint.priority}`}
          </span>
          <HealthBadge status={endpoint.healthStatus} latency={endpoint.lastLatency} />
          {!endpoint.isActive && <Badge text="已禁用" color={TEXT_MUTED} bg="#1e293b" />}
          <Badge text={`P${endpoint.priority}`} color="#60a5fa" bg="#172554" />
        </div>
        <code style={{ fontSize: 11, color: TEXT_MUTED, wordBreak: "break-all" }}>{endpoint.url}</code>
        <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
          <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>
            调用: <strong style={{ color: TEXT_PRIMARY }}>{endpoint.totalRequests.toLocaleString()}</strong>
          </span>
          <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>
            错误: <strong style={{ color: endpoint.totalErrors > 0 ? DANGER : TEXT_PRIMARY }}>{endpoint.totalErrors.toLocaleString()}</strong>
          </span>
          <span style={{ fontSize: 11, color: TEXT_SECONDARY }}>
            错误率: <strong style={{ color: parseFloat(errorRate) > 5 ? DANGER : parseFloat(errorRate) > 1 ? WARN : SUCCESS }}>{errorRate}%</strong>
          </span>
          {endpoint.lastHealthCheck > 0 && (
            <span style={{ fontSize: 11, color: TEXT_MUTED }}>
              上次检测: {new Date(endpoint.lastHealthCheck).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button onClick={() => setEditing(true)} style={{ ...btnBase, fontSize: 10, padding: "5px 10px", background: "transparent", border: `1px solid ${CARD_BORDER}`, color: "#60a5fa" }} title="编辑">✏️</button>
        <button onClick={resetStats} style={{ ...btnBase, fontSize: 10, padding: "5px 10px", background: "transparent", border: `1px solid ${CARD_BORDER}`, color: WARN }} title="重置统计">🔄</button>
        <button onClick={remove} style={{ ...btnBase, fontSize: 10, padding: "5px 10px", background: "transparent", border: `1px solid ${CARD_BORDER}`, color: DANGER }} title="删除">🗑</button>
      </div>
    </div>
  );
}

/* ── Add RPC Endpoint Form (inline) ── */
function AddRpcForm({ chainSlug, onCreated }: { chainSlug: string; onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!url) { setError("请输入 RPC URL"); return; }
    setLoading(true);
    setError(null);
    try {
      await createRpcEndpoint({ chainSlug, url, label, priority });
      setUrl("");
      setLabel("");
      setPriority(0);
      onCreated();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ background: "#0a0e14", border: `1px dashed ${CARD_BORDER}`, borderRadius: 10, padding: 12 }}>
      {error && <div style={{ fontSize: 11, color: "#fca5a5", marginBottom: 6 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 80px", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>标签</label>
          <input style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Alchemy" />
        </div>
        <div>
          <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>RPC URL</label>
          <input style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <label style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 3 }}>优先级</label>
          <input style={{ ...inputStyle, fontSize: 12, padding: "8px 10px" }} type="number" min="0" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
        </div>
      </div>
      <button onClick={submit} disabled={loading} style={{ ...btnBase, fontSize: 11, padding: "6px 16px", background: ACCENT, color: "#fff" }}>
        {loading ? "⏳ 连通性检测中..." : "➕ 添加端点"}
      </button>
    </div>
  );
}

/* ── Chain Sparkline ── */
function buildSparkData(snapshots: RpcStatsSnapshot[]) {
  const byEp = new Map<string, RpcStatsSnapshot[]>();
  for (const s of snapshots) {
    if (!byEp.has(s.endpointId)) byEp.set(s.endpointId, []);
    byEp.get(s.endpointId)!.push(s);
  }
  for (const list of byEp.values()) list.sort((a, b) => a.timestamp - b.timestamp);
  const allTimes = [...new Set(snapshots.map(s => s.timestamp))].sort((a, b) => a - b);
  const prevReq = new Map<string, number>();
  return allTimes.map(ts => {
    let total = 0;
    for (const [epId, list] of byEp) {
      const snap = list.find(s => s.timestamp === ts);
      if (snap) {
        const prev = prevReq.get(epId);
        if (prev !== undefined) total += Math.max(0, snap.totalRequests - prev);
        prevReq.set(epId, snap.totalRequests);
      }
    }
    return { v: total };
  });
}

function ChainSparkline({ chainSlug }: { chainSlug: string }) {
  const [data, setData] = useState<{ v: number }[]>([]);
  useEffect(() => {
    listRpcStatsHistory(chainSlug, 1)
      .then(snaps => setData(buildSparkData(snaps)))
      .catch(() => {});
  }, [chainSlug]);
  if (data.length < 2) return null;
  return (
    <div style={{ width: 110, height: 36, flexShrink: 0, opacity: 0.75 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`sg_${chainSlug}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="20%" stopColor="#6366f1" stopOpacity={0.5}/>
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02}/>
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={1.5} fill={`url(#sg_${chainSlug})`} dot={false} isAnimationActive={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Chain Card (with RPC endpoints) ── */
function ChainCard({
  chain, endpoints, onUpdate, onDelete,
}: {
  chain: ChainConfig;
  endpoints: RpcEndpoint[];
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAddRpc, setShowAddRpc] = useState(false);
  const [form, setForm] = useState({ rpcUrl: chain.rpcUrl, explorerUrl: chain.explorerUrl, erc8004Identity: chain.erc8004Identity });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chainEndpoints = endpoints.filter((e) => e.chainSlug === chain.id);
  const healthyCount = chainEndpoints.filter((e) => e.isActive && e.healthStatus === "healthy").length;
  const totalCalls = chainEndpoints.reduce((s, e) => s + e.totalRequests, 0);
  const totalErrors = chainEndpoints.reduce((s, e) => s + e.totalErrors, 0);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateChain(chain.id, form);
      setEditing(false);
      onUpdate();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirm(`确定删除链 "${chain.name}" (${chain.id})？`)) return;
    try {
      await deleteChain(chain.id);
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
      {/* Header */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", gap: 12 }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>⛓</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{chain.name}</span>
              <Badge text={chain.id} color="#60a5fa" bg="#172554" />
              {chain.isTestnet && <Badge text="TESTNET" color={WARN} bg="#422006" />}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 3, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>Chain ID: {chain.chainId}</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>{chain.nativeCurrency}</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>
                RPC: <strong style={{ color: healthyCount > 0 ? SUCCESS : (chainEndpoints.length > 0 ? WARN : TEXT_MUTED) }}>{healthyCount}/{chainEndpoints.length}</strong> 健康
              </span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>
                调用: <strong style={{ color: TEXT_PRIMARY }}>{totalCalls.toLocaleString()}</strong>
              </span>
              {totalErrors > 0 && (
                <>
                  <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
                  <span style={{ fontSize: 11, color: DANGER }}>
                    错误: {totalErrors.toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChainSparkline chainSlug={chain.id} />
        <span style={{ fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
      </div>

      {/* Expanded Panel */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${CARD_BORDER}`, padding: "16px 20px", background: "#0c1018" }}>
          {!editing ? (
            <>
              {/* Chain basic info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Explorer</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY, wordBreak: "break-all" }}>{chain.explorerUrl || "—"}</code>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>ERC-8004 Identity</div>
                  <code style={{ fontSize: 12, color: TEXT_SECONDARY, wordBreak: "break-all" }}>{chain.erc8004Identity || "—"}</code>
                </div>
              </div>

              {/* RPC Endpoints Section */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    RPC 端点 ({chainEndpoints.length})
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setShowAddRpc((v) => !v); }} style={{
                    ...btnBase, fontSize: 10, padding: "4px 12px",
                    background: showAddRpc ? ACCENT + "20" : "transparent",
                    border: `1px solid ${showAddRpc ? ACCENT : CARD_BORDER}`,
                    color: showAddRpc ? ACCENT : TEXT_MUTED,
                  }}>➕ 添加端点</button>
                </div>

                {showAddRpc && (
                  <div style={{ marginBottom: 10 }}>
                    <AddRpcForm chainSlug={chain.id} onCreated={() => { setShowAddRpc(false); onUpdate(); }} />
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {chainEndpoints.length === 0 ? (
                    <div style={{ padding: "20px 14px", textAlign: "center", fontSize: 12, color: TEXT_MUTED, background: "#0a0e14", borderRadius: 10, border: `1px dashed ${CARD_BORDER}` }}>
                      暂无 RPC 端点，请添加至少一个
                    </div>
                  ) : (
                    chainEndpoints.map((ep) => (
                      <RpcEndpointCard key={ep.id} endpoint={ep} onUpdate={onUpdate} onDelete={onUpdate} />
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: "#60a5fa" }}>✏️ 编辑链信息</button>
                <button onClick={(e) => { e.stopPropagation(); remove(); }} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: DANGER }}>🗑 删除链</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {error && <div style={{ fontSize: 13, color: "#fca5a5", padding: "8px 12px", background: "#3b1111", borderRadius: 8 }}>{error}</div>}
              <div>
                <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>Explorer URL</label>
                <input style={inputStyle} value={form.explorerUrl} onChange={(e) => setForm({ ...form, explorerUrl: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>ERC-8004 Identity 合约</label>
                <input style={inputStyle} value={form.erc8004Identity} onChange={(e) => setForm({ ...form, erc8004Identity: e.target.value })} placeholder="0x..." />
              </div>
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

/* ── Create Chain Form ── */
function CreateChainForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    id: "", name: "", chainId: "", rpcUrl: "", explorerUrl: "",
    isTestnet: false, nativeCurrency: "ETH", erc8004Identity: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createChain({
        ...form,
        chainId: Number(form.chainId),
      });
      onCreated();
      setForm({ id: "", name: "", chainId: "", rpcUrl: "", explorerUrl: "", isTestnet: false, nativeCurrency: "ETH", erc8004Identity: "" });
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 14, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 3, height: 12, borderRadius: 2, background: "#60a5fa", display: "inline-block" }} />
        添加新链
      </div>
      <div style={{
        padding: "10px 14px", background: "#1a1a2e", border: `1px solid ${CARD_BORDER}`,
        borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: 11, color: WARN }}>添加链后可在展开面板中配置多个 RPC 端点。初始 RPC URL 将自动创建为第一个端点。</span>
      </div>
      {error && <div style={{ fontSize: 13, color: "#fca5a5", padding: "8px 12px", background: "#3b1111", borderRadius: 8, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>链 ID (slug)</label>
          <input style={inputStyle} placeholder="e.g. base-mainnet" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>显示名称</label>
          <input style={inputStyle} placeholder="e.g. Base Mainnet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>EVM Chain ID</label>
          <input style={inputStyle} type="number" placeholder="e.g. 8453" value={form.chainId} onChange={(e) => setForm({ ...form, chainId: e.target.value })} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>原生代币</label>
          <input style={inputStyle} placeholder="ETH" value={form.nativeCurrency} onChange={(e) => setForm({ ...form, nativeCurrency: e.target.value })} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>初始 RPC URL</label>
          <input style={inputStyle} placeholder="https://..." value={form.rpcUrl} onChange={(e) => setForm({ ...form, rpcUrl: e.target.value })} required />
        </div>
        <div>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>Explorer URL (可选)</label>
          <input style={inputStyle} placeholder="https://..." value={form.explorerUrl} onChange={(e) => setForm({ ...form, explorerUrl: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, display: "block", marginBottom: 4 }}>ERC-8004 合约 (可选)</label>
          <input style={inputStyle} placeholder="0x..." value={form.erc8004Identity} onChange={(e) => setForm({ ...form, erc8004Identity: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={form.isTestnet} onChange={(e) => setForm({ ...form, isTestnet: e.target.checked })} />
          <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>测试网</span>
        </label>
      </div>
      <button type="submit" disabled={loading} style={{ ...btnBase, background: ACCENT, color: "#fff", padding: "10px 24px" }}>
        {loading ? "添加中..." : "➕ 添加链"}
      </button>
    </form>
  );
}

/* ── Main Page ── */
export function Chains() {
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [endpoints, setEndpoints] = useState<RpcEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([listChains(), listRpcEndpoints()]);
      setChains(c);
      setEndpoints(e);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh endpoints every 30s for live health updates
  useEffect(() => {
    autoRefreshRef.current = setInterval(async () => {
      try {
        const e = await listRpcEndpoints();
        setEndpoints(e);
      } catch { /* ignore */ }
    }, 30_000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, []);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const result = await triggerRpcHealthCheck();
      setEndpoints(result.endpoints);
      // Also refresh from DB for persisted data
      const fresh = await listRpcEndpoints();
      setEndpoints(fresh);
    } catch (e: any) { alert("健康检查失败: " + e.message); }
    finally { setHealthChecking(false); }
  };

  const totalEndpoints = endpoints.length;
  const healthyEndpoints = endpoints.filter((e) => e.isActive && e.healthStatus === "healthy").length;
  const totalRpcCalls = endpoints.reduce((s, e) => s + e.totalRequests, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>链配置</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>管理 EVM 链、RPC 端点与健康监控</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/stats" style={{
            ...btnBase, fontSize: 13, textDecoration: "none",
            background: "transparent", border: `1px solid #6366f1`,
            color: "#818cf8", display: "inline-flex", alignItems: "center", gap: 4,
          }}>📊 RPC 统计</Link>
          <button onClick={runHealthCheck} disabled={healthChecking} style={{
            ...btnBase, fontSize: 13,
            background: "transparent", border: `1px solid ${SUCCESS}`,
            color: SUCCESS, opacity: healthChecking ? 0.6 : 1,
          }}>{healthChecking ? "⏳ 检测中..." : "🩺 健康检测"}</button>
          <button onClick={() => setShowForm((v) => !v)} style={{
            ...btnBase, fontSize: 13,
            background: showForm ? ACCENT + "20" : "transparent",
            border: `1px solid ${showForm ? ACCENT : CARD_BORDER}`,
            color: showForm ? ACCENT : TEXT_SECONDARY,
          }}>➕ 添加链</button>
          <button onClick={load} style={{ ...btnBase, fontSize: 13, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>↻ 刷新</button>
        </div>
      </div>

      {showForm && <CreateChainForm onCreated={() => { load(); setShowForm(false); }} />}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "⛓", label: "总链数", value: chains.length, accent: ACCENT },
          { icon: "🔗", label: "RPC 端点", value: totalEndpoints, accent: "#60a5fa" },
          { icon: "💚", label: "健康端点", value: `${healthyEndpoints}/${totalEndpoints}`, accent: SUCCESS },
          { icon: "📊", label: "总调用量", value: totalRpcCalls.toLocaleString(), accent: WARN },
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

      {loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: TEXT_MUTED, background: CARD_BG, borderRadius: 14, border: `1px solid ${CARD_BORDER}` }}>⏳ 加载中...</div>
      ) : chains.length === 0 ? (
        <div style={{ padding: "60px 24px", textAlign: "center", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`, borderRadius: 16 }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>⛓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>暂无链配置</div>
          <div style={{ fontSize: 14, color: TEXT_MUTED }}>点击「添加链」开始配置 EVM 链</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {chains.map((c) => (
            <ChainCard key={c.id} chain={c} endpoints={endpoints} onUpdate={load} onDelete={load} />
          ))}
        </div>
      )}
    </div>
  );
}
