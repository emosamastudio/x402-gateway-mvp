import { useState, useEffect, useCallback } from "react";
import { listServices, createService, updateService, deleteService, listChains, listTokens, listProviders } from "../api.js";
import type { Service, ChainConfig, TokenConfig, ServiceProvider } from "@x402-gateway-mvp/shared";

/* ────────────────────── Styles ────────────────────── */

const CARD_BG = "#111827";
const CARD_BORDER = "#1e2d45";
const ACCENT = "#3b82f6";
const DANGER = "#ef4444";
const SUCCESS = "#10b981";
const TEXT_PRIMARY = "#e2e8f0";
const TEXT_SECONDARY = "#94a3b8";
const TEXT_MUTED = "#475569";
const INPUT_BG = "#0d1117";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: INPUT_BG,
  border: `1px solid ${CARD_BORDER}`, borderRadius: 8, color: TEXT_PRIMARY,
  fontSize: 14, boxSizing: "border-box", outline: "none",
  transition: "border-color 0.2s",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#60a5fa", display: "block", marginBottom: 6,
};

const btnBase: React.CSSProperties = {
  border: "none", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600, padding: "8px 18px",
  transition: "background 0.2s, transform 0.1s, box-shadow 0.2s",
  display: "inline-flex", alignItems: "center", gap: 6,
};

/* ────────────────────── Helpers ────────────────────── */

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        ...btnBase, padding: "3px 10px", fontSize: 11, fontWeight: 500,
        background: copied ? "#065f46" : "transparent",
        border: `1px solid ${copied ? "#10b981" : CARD_BORDER}`,
        color: copied ? "#34d399" : "#60a5fa",
      }}
    >{copied ? "✓ 已复制" : (label ?? "复制")}</button>
  );
}

function Badge({ text, color = "#60a5fa", bg = "#1e3a5f" }: { text: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color, background: bg,
      padding: "3px 10px", borderRadius: 20, letterSpacing: 0.3,
      textTransform: "uppercase",
    }}>{text}</span>
  );
}

function networkColor(network: string) {
  if (network === "optimism-sepolia") return { color: "#f87171", bg: "#3b1111" };
  if (network === "sepolia") return { color: "#a78bfa", bg: "#2e1065" };
  return { color: "#60a5fa", bg: "#1e3a5f" };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/* ────────────────────── Empty State ────────────────────── */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "80px 24px", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`,
      borderRadius: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>🔌</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>还没有注册任何服务</div>
      <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 24, maxWidth: 360 }}>
        注册你的第一个 API 服务，开始通过 x402 网关接收加密支付
      </div>
      <button
        type="button"
        onClick={onAdd}
        style={{ ...btnBase, padding: "12px 28px", fontSize: 15, background: ACCENT, color: "#fff" }}
      >+ 注册服务</button>
    </div>
  );
}

/* ────────────────────── Confirm Dialog ────────────────────── */
function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        background: "#1a1f2e", border: `1px solid ${CARD_BORDER}`, borderRadius: 16,
        padding: 32, maxWidth: 420, width: "90%",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 14, color: TEXT_SECONDARY, marginBottom: 24, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{message}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{
            ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY,
          }}>取消</button>
          <button type="button" onClick={onConfirm} style={{
            ...btnBase, background: DANGER, color: "#fff",
          }}>确认删除</button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── Service Form (Create / Edit) ────────────────────── */
type FormData = {
  name: string; providerId?: string; gatewayPath: string; backendUrl: string; priceAmount: string;
  network: string; tokenId: string; recipient?: string; apiKey: string; minReputation: number;
};

const EMPTY_FORM: FormData = {
  name: "", gatewayPath: "", backendUrl: "", priceAmount: "0.001",
  network: "", tokenId: "", recipient: "", apiKey: "", minReputation: 0,
};

function ServiceFormModal({ initial, isEdit, onSubmit, onCancel, loading, error, chains, tokens, providers }: {
  initial: FormData; isEdit: boolean;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
  loading: boolean; error: string | null;
  chains: ChainConfig[]; tokens: TokenConfig[];
  providers: ServiceProvider[];
}) {
  const [form, setForm] = useState<FormData>(initial);
  const set = (key: keyof FormData, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const filteredTokens = tokens.filter((t) => t.isActive && t.chainSlug === form.network);
  const selectedToken = tokens.find((t) => t.id === form.tokenId);

  const handleNetworkChange = (network: string) => {
    const firstToken = tokens.filter((t) => t.isActive && t.chainSlug === network)[0];
    setForm((f) => ({ ...f, network, tokenId: firstToken?.id || "" }));
  };

  const handleProviderChange = (providerId: string) => {
    const prov = providers.find((p) => p.id === providerId);
    setForm((f) => ({ ...f, providerId, recipient: prov && (!f.recipient || f.recipient === "") ? prov.walletAddress : f.recipient }));
  };

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", zIndex: 9999,
    }} onClick={onCancel}>
      <div style={{
        background: "#1a1f2e", border: `1px solid ${CARD_BORDER}`, borderRadius: 16,
        padding: 32, maxWidth: 520, width: "90%",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        maxHeight: "90vh", overflowY: "auto",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 24 }}>
          {isEdit ? "✏️ 编辑服务" : "➕ 注册新服务"}
        </div>
        {error && (
          <div style={{
            padding: "10px 14px", background: "#3b1111", border: "1px solid #7f1d1d",
            borderRadius: 8, color: "#fca5a5", fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>服务名称</label>
              <input style={inputStyle} placeholder="My API Service" value={form.name}
                onChange={(e) => set("name", e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>网关路径</label>
              <input style={inputStyle} placeholder="/echo 或 /api/weather" value={form.gatewayPath}
                onChange={(e) => set("gatewayPath", e.target.value)} required />
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                用户通过此路径访问网关，如 <code style={{ color: "#fbbf24" }}>http://localhost:8402/echo</code>
              </div>
            </div>
            <div>
              <label style={labelStyle}>后端 URL</label>
              <input style={inputStyle} placeholder="http://localhost:3001/api" value={form.backendUrl}
                onChange={(e) => set("backendUrl", e.target.value)} required />
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                请求通过验证后将被转发到此地址
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>单次请求价格 ({selectedToken?.symbol || "token"})</label>
                <input style={inputStyle} placeholder="0.001" value={form.priceAmount}
                  onChange={(e) => set("priceAmount", e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>链</label>
                <select style={{ ...inputStyle, cursor: "pointer" }} value={form.network}
                  onChange={(e) => handleNetworkChange(e.target.value)} required>
                  <option value="">选择链...</option>
                  {chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>支付代币</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.tokenId}
                onChange={(e) => set("tokenId", e.target.value)} required disabled={!form.network}>
                <option value="">选择代币...</option>
                {filteredTokens.map((t) => <option key={t.id} value={t.id}>{t.symbol} — {t.name || t.id}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>服务商 (可选)</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.providerId || ""}
                onChange={(e) => handleProviderChange(e.target.value)}>
                <option value="">无</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.walletAddress.slice(0, 6)}...{p.walletAddress.slice(-4)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>收款地址</label>
              <input style={inputStyle} placeholder="0x..." value={form.recipient || ""}
                onChange={(e) => set("recipient", e.target.value)} />
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                选择服务商后可自动填充，也可手动覆盖
              </div>
            </div>
            <div>
              <label style={labelStyle}>后端 API Key <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>(可选)</span></label>
              <input style={inputStyle} placeholder="留空则不发送 API Key" value={form.apiKey}
                onChange={(e) => set("apiKey", e.target.value)}
                type="password" autoComplete="off" />
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                如果后端需要认证，填写 API Key，网关将在转发时以 <code style={{ color: "#94a3b8" }}>Authorization: Bearer</code> 方式发送
              </div>
            </div>
            <div>
              <label style={labelStyle}>最低信誉分 (0 = 不限制)</label>
              <input style={inputStyle} type="number" min={0} value={form.minReputation}
                onChange={(e) => set("minReputation", Number(e.target.value))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 28 }}>
            <button type="button" onClick={onCancel} style={{
              ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY,
            }}>取消</button>
            <button type="submit" disabled={loading} style={{
              ...btnBase, background: ACCENT, color: "#fff", opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "处理中..." : isEdit ? "保存更改" : "注册服务"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ────────────────────── Service Card ────────────────────── */
function ServiceCard({ service, onEdit, onDelete, providers }: {
  service: Service; onEdit: () => void; onDelete: () => void; providers: ServiceProvider[];
}) {
  const [expanded, setExpanded] = useState(false);
  const gatewayPath = service.gatewayPath || "/";
  const gatewayUrl = `http://localhost:8402${gatewayPath}`;
  const nc = networkColor(service.network);

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14,
      overflow: "hidden", transition: "border-color 0.2s, box-shadow 0.2s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2d4a6f"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderBottom: `1px solid ${CARD_BORDER}`,
        cursor: "pointer",
      }} onClick={() => setExpanded((v) => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${ACCENT} 0%, #8b5cf6 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>{service.name.charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY, wordBreak: "break-word" }}>{service.name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <div style={{ fontSize: 12, color: TEXT_MUTED }}>{service.priceAmount} DMHKD / request</div>
              {service.providerId ? (() => {
                const prov = providers.find((p) => p.id === service.providerId);
                return prov ? <Badge text={prov.name} color="#94a3b8" bg="#0b1220" /> : <Badge text={service.providerId} color="#94a3b8" bg="#0b1220" />;
              })() : null}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <Badge text={service.network} color={nc.color} bg={nc.bg} />
          <span style={{ fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
        </div>
      </div>

      {/* Gateway Path (always visible) */}
      <div style={{ padding: "12px 20px", background: "#0c1018" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: SUCCESS, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Gateway</span>
          <code style={{
            background: INPUT_BG, padding: "4px 10px", borderRadius: 6,
            color: "#fbbf24", fontSize: 13, fontFamily: "monospace",
            border: `1px solid ${CARD_BORDER}`, wordBreak: "break-all",
          }}>{gatewayPath}</code>
          <CopyBtn text={gatewayPath} label="路径" />
          <CopyBtn text={gatewayUrl} label="完整 URL" />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${CARD_BORDER}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <DetailItem label="后端 URL" value={service.backendUrl} mono />
            <DetailItem label="收款地址" value={service.recipient} mono />
            <DetailItem label="API Key" value={service.apiKey ? "••••••••" : "未设置"} />
            <DetailItem label="最低信誉分" value={service.minReputation === 0 ? "不限制" : String(service.minReputation)} />
            <DetailItem label="创建时间" value={formatDate(service.createdAt)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <DetailItem label="Service ID" value={service.id} mono />
          </div>

          {/* Action buttons */}
          <div style={{
            display: "flex", gap: 10, justifyContent: "flex-end",
            borderTop: `1px solid ${CARD_BORDER}`, paddingTop: 16,
          }}>
            <button type="button" onClick={onEdit} style={{
              ...btnBase, background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ACCENT; }}
            >✏️ 编辑</button>
            <button type="button" onClick={onDelete} style={{
              ...btnBase, background: "transparent", border: `1px solid ${DANGER}`, color: DANGER,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = DANGER; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = DANGER; }}
            >🗑️ 删除</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{
        fontSize: 13, color: TEXT_SECONDARY, wordBreak: "break-all",
        fontFamily: mono ? "monospace" : "inherit",
      }}>{value}</div>
    </div>
  );
}

/* ────────────────────── Stats Bar ────────────────────── */
function StatsBar({ services }: { services: Service[] }) {
  const networks = new Set(services.map((s) => s.network));
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24,
    }}>
      {[{
        label: "注册服务总数", value: services.length, icon: "📡",
      }, {
        label: "网络覆盖", value: networks.size, icon: "🔗",
      }, {
        label: "今日新增",
        value: services.filter((s) => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          return s.createdAt >= today.getTime();
        }).length,
        icon: "⚡",
      }].map((stat) => (
        <div key={stat.label} style={{
          background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12,
          padding: "16px 20px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#1e293b",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>{stat.icon}</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRIMARY }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600 }}>{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────── Search Bar ────────────────────── */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 20 }}>
      <span style={{
        position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
        fontSize: 14, color: TEXT_MUTED, pointerEvents: "none",
      }}>🔍</span>
      <input
        type="text"
        placeholder="搜索服务名称、路径或地址..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle, paddingLeft: 38, background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`, borderRadius: 10,
        }}
      />
    </div>
  );
}

/* ────────────────────── Main Component ────────────────────── */
export function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([listServices(), listChains(), listTokens(), listProviders()]).then(([s, c, t, p]) => {
      setServices(s);
      setChains(c);
      setTokens(t);
      setProviders(p);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = services.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    let gp: string;
    try { gp = new URL(s.backendUrl).pathname; } catch { gp = ""; }
    return (
      s.name.toLowerCase().includes(q) ||
      s.backendUrl.toLowerCase().includes(q) ||
      s.recipient.toLowerCase().includes(q) ||
      s.network.toLowerCase().includes(q) ||
      gp.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  // Create
  const handleCreate = async (data: FormData) => {
    setFormLoading(true);
    setFormError(null);
    try {
      await createService({
        name: data.name,
        gatewayPath: data.gatewayPath,
        backendUrl: data.backendUrl,
        priceAmount: data.priceAmount,
        network: data.network,
        tokenId: data.tokenId,
        recipient: data.recipient,
        providerId: data.providerId,
        apiKey: data.apiKey,
        minReputation: data.minReputation,
      });
      setShowForm(false);
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // Update
  const handleUpdate = async (data: FormData) => {
    if (!editingService) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await updateService(editingService.id, {
        name: data.name,
        gatewayPath: data.gatewayPath,
        backendUrl: data.backendUrl,
        priceAmount: data.priceAmount,
        network: data.network,
        tokenId: data.tokenId,
        recipient: data.recipient,
        providerId: data.providerId,
        apiKey: data.apiKey,
        minReputation: data.minReputation,
      });
      setEditingService(null);
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deletingService) return;
    try {
      await deleteService(deletingService.id);
      setDeletingService(null);
      load();
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>服务管理</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>管理通过 x402 网关注册的 API 服务</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); setFormError(null); }}
          style={{
            ...btnBase, padding: "10px 22px", fontSize: 14,
            background: `linear-gradient(135deg, ${ACCENT} 0%, #8b5cf6 100%)`,
            color: "#fff", boxShadow: "0 4px 14px rgba(59,130,246,0.3)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(59,130,246,0.4)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(59,130,246,0.3)"; }}
        >+ 注册服务</button>
      </div>

      {/* Stats */}
      <StatsBar services={services} />

      {/* Search */}
      {services.length > 0 && <SearchBar value={search} onChange={setSearch} />}

      {/* Service List */}
      {services.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : filtered.length === 0 ? (
        <div style={{
          padding: "40px 24px", textAlign: "center", color: TEXT_MUTED, fontSize: 14,
          background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12,
        }}>
          没有找到匹配的服务
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              providers={providers}
              onEdit={() => { setEditingService(s); setFormError(null); }}
              onDelete={() => setDeletingService(s)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <ServiceFormModal
          initial={EMPTY_FORM}
          isEdit={false}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          loading={formLoading}
          error={formError}
          chains={chains}
          tokens={tokens}
          providers={providers}
        />
      )}

      {/* Edit Modal */}
      {editingService && (
        <ServiceFormModal
          initial={{
            name: editingService.name,
            gatewayPath: editingService.gatewayPath,
            backendUrl: editingService.backendUrl,
            priceAmount: editingService.priceAmount,
            network: editingService.network,
            tokenId: editingService.tokenId || "",
            recipient: editingService.recipient,
            providerId: editingService.providerId || "",
            apiKey: editingService.apiKey,
            minReputation: editingService.minReputation,
          }}
          isEdit
          onSubmit={handleUpdate}
          onCancel={() => setEditingService(null)}
          loading={formLoading}
          error={formError}
          chains={chains}
          tokens={tokens}
          providers={providers}
        />
      )}

      {/* Delete Confirm */}
      {deletingService && (
        <ConfirmDialog
          title="确认删除服务"
          message={`确定要删除「${deletingService.name}」吗？\n删除后该服务将无法通过网关访问，且此操作不可撤销。`}
          onConfirm={handleDelete}
          onCancel={() => setDeletingService(null)}
        />
      )}
    </div>
  );
}
