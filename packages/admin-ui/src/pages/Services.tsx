import { useState, useEffect, useCallback } from "react";
import {
  listServices, createService, updateService, deleteService,
  listServiceSchemes, createServiceScheme, updateServiceScheme, deleteServiceScheme,
  listChains, listTokens, listProviders,
} from "../api.js";
import type { Service, ServicePaymentScheme, ChainConfig, TokenConfig, ServiceProvider } from "@x402-gateway-mvp/shared";
import { slugify } from "@x402-gateway-mvp/shared";

/* ── Styles ──────────────────────────────────────────────────── */
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
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#60a5fa", display: "block", marginBottom: 6,
};
const btnBase: React.CSSProperties = {
  border: "none", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600, padding: "8px 18px",
  display: "inline-flex", alignItems: "center", gap: 6,
};

/* ── Helpers ──────────────────────────────────────────────────── */
function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        ...btnBase, padding: "3px 10px", fontSize: 11, fontWeight: 500,
        background: copied ? "#065f46" : "transparent",
        border: `1px solid ${copied ? "#10b981" : CARD_BORDER}`,
        color: copied ? "#34d399" : "#60a5fa",
      }}>{copied ? "✓ 已复制" : (label ?? "复制")}</button>
  );
}

function Badge({ text, color = "#60a5fa", bg = "#1e3a5f" }: { text: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color, background: bg,
      padding: "3px 10px", borderRadius: 20, letterSpacing: 0.3, textTransform: "uppercase",
    }}>{text}</span>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/* ── Confirm Dialog ───────────────────────────────────────────── */
function ConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", zIndex: 9999 }} onClick={onCancel}>
      <div style={{ background: "#1a1f2e", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: 32, maxWidth: 420, width: "90%" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 14, color: TEXT_SECONDARY, marginBottom: 24, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{message}</div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>取消</button>
          <button type="button" onClick={onConfirm} style={{ ...btnBase, background: DANGER, color: "#fff" }}>确认删除</button>
        </div>
      </div>
    </div>
  );
}

/* ── Service Form ─────────────────────────────────────────────── */
type ServiceFormData = {
  name: string; backendUrl: string; apiKey: string; minReputation: number; providerId: string;
};
const EMPTY_SERVICE_FORM: ServiceFormData = { name: "", backendUrl: "", apiKey: "", minReputation: 0, providerId: "" };

function ServiceFormModal({ initial, isEdit, onSubmit, onCancel, loading, error, providers }: {
  initial: ServiceFormData; isEdit: boolean;
  onSubmit: (data: ServiceFormData) => void; onCancel: () => void;
  loading: boolean; error: string | null; providers: ServiceProvider[];
}) {
  const [form, setForm] = useState<ServiceFormData>(initial);
  const set = (key: keyof ServiceFormData, val: any) => setForm(f => ({ ...f, [key]: val }));
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", zIndex: 9999 }} onClick={onCancel}>
      <div style={{ background: "#1a1f2e", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: 32, maxWidth: 480, width: "90%", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 24 }}>
          {isEdit ? "✏️ 编辑服务" : "➕ 注册新服务"}
        </div>
        {error && <div style={{ padding: "10px 14px", background: "#3b1111", border: "1px solid #7f1d1d", borderRadius: 8, color: "#fca5a5", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <form onSubmit={e => { e.preventDefault(); onSubmit(form); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>服务名称</label>
              <input style={inputStyle} placeholder="My API Service" value={form.name} onChange={e => set("name", e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>后端 URL</label>
              <input style={inputStyle} placeholder="http://localhost:3001/api" value={form.backendUrl} onChange={e => set("backendUrl", e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>服务商 (可选)</label>
              <select style={{ ...inputStyle, cursor: "pointer" }} value={form.providerId} onChange={e => set("providerId", e.target.value)}>
                <option value="">无</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name} — {p.walletAddress.slice(0, 6)}...{p.walletAddress.slice(-4)}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>后端 API Key <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>(可选)</span></label>
              <input style={inputStyle} placeholder="留空则不发送" value={form.apiKey} onChange={e => set("apiKey", e.target.value)} type="password" autoComplete="off" />
            </div>
            <div>
              <label style={labelStyle}>最低信誉分 (0 = 不限制)</label>
              <input style={inputStyle} type="number" min={0} value={form.minReputation} onChange={e => set("minReputation", Number(e.target.value))} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 16, padding: "10px 14px", background: "#0c1018", borderRadius: 8, lineHeight: 1.6 }}>
            创建服务后，在展开面板中添加支付方案，网关路径将自动生成。
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
            <button type="button" onClick={onCancel} style={{ ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY }}>取消</button>
            <button type="submit" disabled={loading} style={{ ...btnBase, background: ACCENT, color: "#fff", opacity: loading ? 0.6 : 1 }}>
              {loading ? "处理中..." : isEdit ? "保存更改" : "注册服务"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Scheme Inline Form ───────────────────────────────────────── */
interface SchemeFormData { network: string; tokenId: string; priceAmount: string; recipient: string; }
const EMPTY_SCHEME: SchemeFormData = { network: "", tokenId: "", priceAmount: "0.001", recipient: "" };

function SchemeInlineForm({ form, setForm, chains, filteredTokens, isEdit, saving, error, onSubmit, onCancel }: {
  form: SchemeFormData;
  setForm: React.Dispatch<React.SetStateAction<SchemeFormData>>;
  chains: ChainConfig[]; filteredTokens: TokenConfig[];
  isEdit: boolean; saving: boolean; error: string;
  onSubmit: () => void; onCancel: () => void;
}) {
  const SI: React.CSSProperties = { padding: "7px 10px", background: "#111827", border: `1px solid ${CARD_BORDER}`, borderRadius: 6, color: TEXT_PRIMARY, fontSize: 13, outline: "none" };
  return (
    <div style={{ background: "#0f1929", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, marginTop: 8 }}>
      <p style={{ color: "#60a5fa", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{isEdit ? "编辑方案" : "添加支付方案"}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {!isEdit && (
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>网络 *</label>
            <select style={{ ...SI, minWidth: 140, cursor: "pointer" }} value={form.network}
              onChange={e => setForm(f => ({ ...f, network: e.target.value, tokenId: "" }))}>
              <option value="">-- 选择网络 --</option>
              {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {!isEdit && (
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>Token *</label>
            <select style={{ ...SI, minWidth: 140, cursor: "pointer" }} value={form.tokenId}
              onChange={e => setForm(f => ({ ...f, tokenId: e.target.value }))} disabled={!form.network}>
              <option value="">-- 选择 Token --</option>
              {filteredTokens.map(t => <option key={t.id} value={t.id}>{t.symbol}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>价格 *</label>
          <input style={{ ...SI, width: 100 }} type="number" step="0.001" min="0" value={form.priceAmount}
            onChange={e => setForm(f => ({ ...f, priceAmount: e.target.value }))} />
        </div>
        <div>
          <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>收款地址 (可选)</label>
          <input style={{ ...SI, width: 200 }} value={form.recipient}
            onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))} placeholder="0x… 留空使用服务商钱包" />
        </div>
        <button onClick={onSubmit} disabled={saving}
          style={{ background: "#166534", color: "#4ade80", border: "1px solid #166534", borderRadius: 6, padding: "7px 16px", cursor: "pointer", fontSize: 13 }}>
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onCancel}
          style={{ background: "transparent", color: "#9ca3af", border: `1px solid ${CARD_BORDER}`, borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontSize: 13 }}>
          取消
        </button>
      </div>
      {error && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

/* ── Service Card ─────────────────────────────────────────────── */
function ServiceCard({ service, providers, chains, tokens, onEdit, onDelete }: {
  service: Service; providers: ServiceProvider[];
  chains: ChainConfig[]; tokens: TokenConfig[];
  onEdit: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [schemes, setSchemes] = useState<ServicePaymentScheme[] | null>(null);
  const [addingScheme, setAddingScheme] = useState(false);
  const [editingScheme, setEditingScheme] = useState<ServicePaymentScheme | null>(null);
  const [schemeForm, setSchemeForm] = useState<SchemeFormData>(EMPTY_SCHEME);
  const [schemeSaving, setSchemeSaving] = useState(false);
  const [schemeError, setSchemeError] = useState("");

  const prov = providers.find(p => p.id === service.providerId);

  const loadSchemes = async () => {
    const s = await listServiceSchemes(service.id);
    setSchemes(s);
  };

  const handleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && schemes === null) await loadSchemes();
  };

  const filteredTokens = (network: string) => tokens.filter(t => t.isActive && t.chainSlug === network);

  const computePath = (sch: ServicePaymentScheme) => {
    const pSlug = slugify(prov?.name ?? service.providerId ?? "unknown");
    const sSlug = slugify(service.name);
    const tok = tokens.find(t => t.id === sch.tokenId);
    const tSlug = slugify(tok?.symbol ?? sch.tokenId);
    return `/${pSlug}/${sSlug}/${sch.network}/${tSlug}`;
  };

  const openAdd = () => { setAddingScheme(true); setEditingScheme(null); setSchemeForm(EMPTY_SCHEME); setSchemeError(""); };
  const openEdit = (sch: ServicePaymentScheme) => {
    setEditingScheme(sch); setAddingScheme(false);
    setSchemeForm({ network: sch.network, tokenId: sch.tokenId, priceAmount: sch.priceAmount, recipient: sch.recipient });
    setSchemeError("");
  };
  const cancelScheme = () => { setAddingScheme(false); setEditingScheme(null); setSchemeForm(EMPTY_SCHEME); setSchemeError(""); };

  const handleSchemeSubmit = async () => {
    if (!schemeForm.priceAmount) { setSchemeError("请填写价格"); return; }
    if (!editingScheme && (!schemeForm.network || !schemeForm.tokenId)) { setSchemeError("请选择网络和 Token"); return; }
    setSchemeSaving(true); setSchemeError("");
    try {
      if (editingScheme) {
        await updateServiceScheme(service.id, editingScheme.id, { priceAmount: schemeForm.priceAmount, recipient: schemeForm.recipient || undefined });
      } else {
        await createServiceScheme(service.id, { network: schemeForm.network, tokenId: schemeForm.tokenId, priceAmount: schemeForm.priceAmount, recipient: schemeForm.recipient || undefined });
      }
      cancelScheme();
      await loadSchemes();
    } catch (e: any) {
      setSchemeError(e.message ?? "操作失败");
    } finally { setSchemeSaving(false); }
  };

  const handleDeleteScheme = async (sch: ServicePaymentScheme) => {
    if (!confirm(`确认删除方案 ${sch.network} / ${sch.priceCurrency}？`)) return;
    await deleteServiceScheme(service.id, sch.id);
    await loadSchemes();
  };

  return (
    <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14, overflow: "hidden" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#2d4a6f"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = CARD_BORDER; }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", cursor: "pointer" }} onClick={handleExpand}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${ACCENT} 0%, #8b5cf6 100%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
            {service.name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{service.name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              {prov && <Badge text={prov.name} color="#94a3b8" bg="#0b1220" />}
              {schemes !== null && <Badge text={`${schemes.length} 个方案`} color="#4ade80" bg="#1a2d1a" />}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={e => { e.stopPropagation(); onEdit(); }}
            style={{ ...btnBase, padding: "6px 14px", background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT }}>
            编辑
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ ...btnBase, padding: "6px 14px", background: "transparent", border: `1px solid ${DANGER}`, color: DANGER }}>
            删除
          </button>
          <span style={{ fontSize: 16, color: TEXT_MUTED, transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
        </div>
      </div>

      {/* Expanded: schemes + details */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${CARD_BORDER}`, background: "#0c1018" }}>
          {/* Service details */}
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${CARD_BORDER}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>后端 URL</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY, fontFamily: "monospace", wordBreak: "break-all" }}>{service.backendUrl}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>创建时间</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{formatDate(service.createdAt)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Service ID</div>
              <div style={{ fontSize: 11, color: TEXT_SECONDARY, fontFamily: "monospace" }}>{service.id}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>最低信誉分</div>
              <div style={{ fontSize: 12, color: TEXT_SECONDARY }}>{service.minReputation === 0 ? "不限制" : service.minReputation}</div>
            </div>
          </div>

          {/* Schemes section */}
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>支付方案</span>
              {!addingScheme && !editingScheme && (
                <button onClick={e => { e.stopPropagation(); openAdd(); }}
                  style={{ background: "#1a2d1a", color: "#4ade80", border: "1px solid #166534", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}>
                  + 添加方案
                </button>
              )}
            </div>

            {schemes === null && <p style={{ color: TEXT_MUTED, fontSize: 12 }}>加载中...</p>}
            {schemes?.length === 0 && !addingScheme && (
              <p style={{ color: TEXT_MUTED, fontSize: 12, fontStyle: "italic" }}>暂无支付方案 — 点击「添加方案」</p>
            )}

            {schemes?.map(sch => {
              if (editingScheme?.id === sch.id) {
                return (
                  <SchemeInlineForm key={sch.id} form={schemeForm} setForm={setSchemeForm}
                    chains={chains} filteredTokens={filteredTokens(schemeForm.network)}
                    isEdit saving={schemeSaving} error={schemeError}
                    onSubmit={handleSchemeSubmit} onCancel={cancelScheme} />
                );
              }
              const path = computePath(sch);
              const tok = tokens.find(t => t.id === sch.tokenId);
              return (
                <div key={sch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #0f1929", flexWrap: "wrap" }}>
                  <Badge text={sch.network} color="#60a5fa" bg="#1e3a5f" />
                  <span style={{ color: TEXT_PRIMARY, fontSize: 13, fontWeight: 500, minWidth: 50 }}>{tok?.symbol ?? sch.tokenId}</span>
                  <span style={{ color: "#4ade80", fontSize: 13, minWidth: 70 }}>{sch.priceAmount}</span>
                  <span style={{ color: TEXT_MUTED, fontSize: 11, fontFamily: "monospace", minWidth: 90 }} title={sch.recipient}>
                    {sch.recipient.slice(0, 8)}…{sch.recipient.slice(-4)}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                    <code style={{ background: INPUT_BG, padding: "3px 8px", borderRadius: 5, color: "#fbbf24", fontSize: 12, fontFamily: "monospace", border: `1px solid ${CARD_BORDER}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }} title={path}>
                      {path}
                    </code>
                    <CopyBtn text={`http://localhost:8402${path}`} label="URL" />
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(sch)}
                      style={{ background: "transparent", color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
                      编辑
                    </button>
                    <button onClick={() => handleDeleteScheme(sch)}
                      style={{ background: "transparent", color: DANGER, border: `1px solid ${DANGER}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
                      删除
                    </button>
                  </div>
                </div>
              );
            })}

            {addingScheme && (
              <SchemeInlineForm form={schemeForm} setForm={setSchemeForm}
                chains={chains} filteredTokens={filteredTokens(schemeForm.network)}
                isEdit={false} saving={schemeSaving} error={schemeError}
                onSubmit={handleSchemeSubmit} onCancel={cancelScheme} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stats Bar ────────────────────────────────────────────────── */
function StatsBar({ services }: { services: Service[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
      {[{
        label: "注册服务总数", value: services.length, icon: "📡",
      }, {
        label: "今日新增",
        value: services.filter(s => { const t = new Date(); t.setHours(0, 0, 0, 0); return s.createdAt >= t.getTime(); }).length,
        icon: "⚡",
      }].map(stat => (
        <div key={stat.label} style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{stat.icon}</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: TEXT_PRIMARY }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600 }}>{stat.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Search Bar ───────────────────────────────────────────────── */
function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative", marginBottom: 20 }}>
      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: TEXT_MUTED, pointerEvents: "none" }}>🔍</span>
      <input type="text" placeholder="搜索服务名称、后端地址..." value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, paddingLeft: 38, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 10 }} />
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────── */
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
      setServices(s); setChains(c); setTokens(t); setProviders(p);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = services.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.backendUrl.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
  });

  const handleCreate = async (data: ServiceFormData) => {
    setFormLoading(true); setFormError(null);
    try {
      await createService({ name: data.name, backendUrl: data.backendUrl, apiKey: data.apiKey, minReputation: data.minReputation, providerId: data.providerId || undefined });
      setShowForm(false); load();
    } catch (err: any) { setFormError(err.message); }
    finally { setFormLoading(false); }
  };

  const handleUpdate = async (data: ServiceFormData) => {
    if (!editingService) return;
    setFormLoading(true); setFormError(null);
    try {
      await updateService(editingService.id, { name: data.name, backendUrl: data.backendUrl, apiKey: data.apiKey, minReputation: data.minReputation, providerId: data.providerId || undefined });
      setEditingService(null); load();
    } catch (err: any) { setFormError(err.message); }
    finally { setFormLoading(false); }
  };

  const handleDelete = async () => {
    if (!deletingService) return;
    try { await deleteService(deletingService.id); setDeletingService(null); load(); }
    catch (err: any) { alert(`删除失败: ${err.message}`); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>服务管理</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>管理通过 x402 网关注册的 API 服务，点击卡片展开支付方案</p>
        </div>
        <button type="button" onClick={() => { setShowForm(true); setFormError(null); }}
          style={{ ...btnBase, padding: "10px 22px", fontSize: 14, background: `linear-gradient(135deg, ${ACCENT} 0%, #8b5cf6 100%)`, color: "#fff" }}>
          + 注册服务
        </button>
      </div>

      <StatsBar services={services} />
      {services.length > 0 && <SearchBar value={search} onChange={setSearch} />}

      {services.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "80px 24px", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`, borderRadius: 16, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>🔌</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>还没有注册任何服务</div>
          <button type="button" onClick={() => setShowForm(true)} style={{ ...btnBase, padding: "12px 28px", fontSize: 15, background: ACCENT, color: "#fff", marginTop: 16 }}>+ 注册服务</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: TEXT_MUTED, fontSize: 14, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12 }}>
          没有找到匹配的服务
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(s => (
            <ServiceCard key={s.id} service={s} providers={providers} chains={chains} tokens={tokens}
              onEdit={() => { setEditingService(s); setFormError(null); }}
              onDelete={() => setDeletingService(s)} />
          ))}
        </div>
      )}

      {showForm && (
        <ServiceFormModal initial={EMPTY_SERVICE_FORM} isEdit={false}
          onSubmit={handleCreate} onCancel={() => setShowForm(false)}
          loading={formLoading} error={formError} providers={providers} />
      )}
      {editingService && (
        <ServiceFormModal
          initial={{ name: editingService.name, backendUrl: editingService.backendUrl, apiKey: editingService.apiKey, minReputation: editingService.minReputation, providerId: editingService.providerId ?? "" }}
          isEdit onSubmit={handleUpdate} onCancel={() => setEditingService(null)}
          loading={formLoading} error={formError} providers={providers} />
      )}
      {deletingService && (
        <ConfirmDialog title="确认删除服务"
          message={`确定要删除「${deletingService.name}」吗？\n删除后该服务及其所有支付方案将无法访问，且此操作不可撤销。`}
          onConfirm={handleDelete} onCancel={() => setDeletingService(null)} />
      )}
    </div>
  );
}
