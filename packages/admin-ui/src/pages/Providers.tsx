import React, { useEffect, useState, useCallback } from "react";
import type { ServiceProvider, Service } from "@x402-gateway-mvp/shared";
import { listProviders, createProvider, updateProvider, deleteProvider, listProviderServices } from "../api.js";

/* ────────────────────── Design Tokens ────────────────────── */

const CARD_BG = "#111827";
const CARD_BORDER = "#1e2d45";
const ACCENT = "#3b82f6";
const DANGER = "#ef4444";
const SUCCESS = "#10b981";
const WARN = "#f59e0b";
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

/* ────────────────────── Shared Components ────────────────────── */

function Badge({ text, color = "#60a5fa", bg = "#1e3a5f" }: { text: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color, background: bg,
      padding: "3px 10px", borderRadius: 20, letterSpacing: 0.3,
    }}>{text}</span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        ...btnBase, padding: "2px 8px", fontSize: 11, fontWeight: 500,
        background: copied ? "#065f46" : "transparent",
        border: `1px solid ${copied ? "#10b981" : CARD_BORDER}`,
        color: copied ? "#34d399" : "#60a5fa",
      }}
    >{copied ? "✓" : "复制"}</button>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function shortAddr(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

/* ────────────────────── Confirm Dialog ────────────────────── */

function ConfirmDialog({ title, message, onConfirm, onCancel, danger = true }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
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
            ...btnBase, background: danger ? DANGER : ACCENT, color: "#fff",
          }}>{danger ? "确认删除" : "确认"}</button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────── Provider Form Modal ────────────────────── */

type ProviderFormData = {
  name: string;
  walletAddress: string;
  description: string;
  website: string;
};

const EMPTY_FORM: ProviderFormData = { name: "", walletAddress: "", description: "", website: "" };

function ProviderFormModal({ initial, isEdit, onSubmit, onCancel, loading, error }: {
  initial: ProviderFormData; isEdit: boolean;
  onSubmit: (data: ProviderFormData) => void;
  onCancel: () => void;
  loading: boolean; error: string | null;
}) {
  const [form, setForm] = useState<ProviderFormData>(initial);
  const set = (key: keyof ProviderFormData, val: string) => setForm((f) => ({ ...f, [key]: val }));

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
          {isEdit ? "✏️ 编辑服务商" : "➕ 新建服务商"}
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
              <label style={labelStyle}>名称 *</label>
              <input style={inputStyle} placeholder="Acme AI Services" value={form.name}
                onChange={(e) => set("name", e.target.value)} required maxLength={100} />
            </div>
            <div>
              <label style={labelStyle}>钱包地址 *</label>
              <input style={{ ...inputStyle, fontFamily: "monospace" }} placeholder="0x..." value={form.walletAddress}
                onChange={(e) => set("walletAddress", e.target.value)} required
                pattern="^0x[0-9a-fA-F]{40}$" title="有效的 EVM 地址 (0x + 40位十六进制)" />
              <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                此地址将作为其下服务的默认收款地址，也用于 ERC-8004 链上身份查询
              </div>
            </div>
            <div>
              <label style={labelStyle}>描述 <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>(可选)</span></label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
                placeholder="简要描述此服务商..."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                maxLength={500}
              />
            </div>
            <div>
              <label style={labelStyle}>网站 <span style={{ color: TEXT_MUTED, fontWeight: 400 }}>(可选)</span></label>
              <input style={inputStyle} placeholder="https://example.com" value={form.website}
                onChange={(e) => set("website", e.target.value)} type="url" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 28 }}>
            <button type="button" onClick={onCancel} style={{
              ...btnBase, background: "transparent", border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY,
            }}>取消</button>
            <button type="submit" disabled={loading} style={{
              ...btnBase, background: ACCENT, color: "#fff", opacity: loading ? 0.6 : 1,
            }}>
              {loading ? "处理中..." : isEdit ? "保存更改" : "创建服务商"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ────────────────────── Provider Card ────────────────────── */

function ProviderCard({ provider, onEdit, onDelete }: {
  provider: ServiceProvider; onEdit: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoaded, setServicesLoaded] = useState(false);

  const loadServices = useCallback(async () => {
    if (servicesLoaded) return;
    try {
      const svcs = await listProviderServices(provider.id);
      setServices(svcs);
    } catch { /* ignore */ }
    setServicesLoaded(true);
  }, [provider.id, servicesLoaded]);

  useEffect(() => {
    if (expanded && !servicesLoaded) loadServices();
  }, [expanded, servicesLoaded, loadServices]);

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
            width: 40, height: 40, borderRadius: 12,
            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>{provider.name.charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRIMARY }}>{provider.name}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <code style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "monospace" }}>{shortAddr(provider.walletAddress)}</code>
              <CopyBtn text={provider.walletAddress} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {servicesLoaded && (
            <Badge
              text={`${services.length} 服务`}
              color={services.length > 0 ? SUCCESS : TEXT_MUTED}
              bg={services.length > 0 ? "#052e16" : "#1e293b"}
            />
          )}
          <span style={{ fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>▾</span>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ padding: "10px 20px", background: "#0c1018", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {provider.website && (
          <a href={provider.website} target="_blank" rel="noreferrer"
            style={{ fontSize: 12, color: ACCENT, textDecoration: "none" }}
            onClick={(e) => e.stopPropagation()}>
            🔗 {provider.website.replace(/^https?:\/\//, "")}
          </a>
        )}
        {provider.description && (
          <span style={{ fontSize: 12, color: TEXT_SECONDARY }}>{provider.description.length > 60 ? provider.description.slice(0, 60) + "..." : provider.description}</span>
        )}
        <span style={{ fontSize: 11, color: TEXT_MUTED, marginLeft: "auto" }}>创建于 {formatDate(provider.createdAt)}</span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${CARD_BORDER}` }}>
          {/* Details grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <DetailItem label="名称" value={provider.name} />
            <DetailItem label="创建时间" value={formatDate(provider.createdAt)} />
            <DetailItem label="钱包地址" value={provider.walletAddress} mono />
            <DetailItem label="网站" value={provider.website || "未设置"} />
          </div>
          {provider.description && (
            <div style={{ marginBottom: 16 }}>
              <DetailItem label="描述" value={provider.description} />
            </div>
          )}

          {/* Provider ID */}
          <div style={{ marginBottom: 16 }}>
            <DetailItem label="Provider ID" value={provider.id} mono />
          </div>

          {/* Associated services */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              关联服务 ({services.length})
            </div>
            {services.length === 0 ? (
              <div style={{
                padding: "12px 16px", background: INPUT_BG, borderRadius: 8,
                border: `1px dashed ${CARD_BORDER}`, color: TEXT_MUTED, fontSize: 13,
              }}>暂无关联服务</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {services.map((svc) => (
                  <div key={svc.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                    background: INPUT_BG, borderRadius: 8, border: `1px solid ${CARD_BORDER}`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, flex: 1 }}>{svc.name}</span>
                    <code style={{ fontSize: 11, color: WARN, fontFamily: "monospace" }}>{svc.gatewayPath}</code>
                    <Badge
                      text={svc.network}
                      color={svc.network.includes("sepolia") ? "#a78bfa" : "#60a5fa"}
                      bg={svc.network.includes("sepolia") ? "#2e1065" : "#1e3a5f"}
                    />
                    <span style={{ fontSize: 11, color: TEXT_MUTED }}>{svc.priceAmount} {svc.priceCurrency}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{
            display: "flex", gap: 10, justifyContent: "flex-end",
            borderTop: `1px solid ${CARD_BORDER}`, paddingTop: 16,
          }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{
              ...btnBase, background: "transparent", border: `1px solid ${ACCENT}`, color: ACCENT,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = ACCENT; }}
            >✏️ 编辑</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{
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

function StatsBar({ providers }: { providers: ServiceProvider[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = providers.filter((p) => p.createdAt >= today.getTime()).length;
  const wallets = new Set(providers.map((p) => p.walletAddress.toLowerCase()));

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24,
    }}>
      {[
        { label: "服务商总数", value: providers.length, icon: "🏢" },
        { label: "独立钱包", value: wallets.size, icon: "💳" },
        { label: "今日新增", value: todayCount, icon: "⚡" },
      ].map((stat) => (
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
        placeholder="搜索名称、钱包地址或描述..."
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

/* ────────────────────── Empty State ────────────────────── */

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "80px 24px", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`,
      borderRadius: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>🏢</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>还没有注册任何服务商</div>
      <div style={{ fontSize: 14, color: TEXT_MUTED, marginBottom: 24, maxWidth: 400 }}>
        服务商是拥有多个 API 服务的实体，通过 ERC-8004 链上身份进行管理。创建服务商后可关联多个服务并统一管理收款地址。
      </div>
      <button
        type="button"
        onClick={onAdd}
        style={{ ...btnBase, padding: "12px 28px", fontSize: 15, background: ACCENT, color: "#fff" }}
      >+ 新建服务商</button>
    </div>
  );
}

/* ────────────────────── Main Component ────────────────────── */

export function Providers() {
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ServiceProvider | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<ServiceProvider | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = await listProviders();
      setProviders(ps);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = providers.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.walletAddress.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (data: ProviderFormData) => {
    setFormLoading(true);
    setFormError(null);
    try {
      await createProvider({
        name: data.name,
        walletAddress: data.walletAddress,
        description: data.description || undefined,
        website: data.website || undefined,
      });
      setShowForm(false);
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (data: ProviderFormData) => {
    if (!editingProvider) return;
    setFormLoading(true);
    setFormError(null);
    try {
      await updateProvider(editingProvider.id, {
        name: data.name,
        walletAddress: data.walletAddress,
        description: data.description,
        website: data.website,
      });
      setEditingProvider(null);
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingProvider) return;
    setDeleteError(null);
    try {
      await deleteProvider(deletingProvider.id);
      setDeletingProvider(null);
      load();
    } catch (err: any) {
      setDeleteError(err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60, color: TEXT_MUTED }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>服务商管理</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>管理 API 服务提供者，关联钱包地址与链上身份</p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); setFormError(null); }}
          style={{
            ...btnBase, padding: "10px 22px", fontSize: 14,
            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            color: "#fff", boxShadow: "0 4px 14px rgba(139,92,246,0.3)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(139,92,246,0.4)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(139,92,246,0.3)"; }}
        >+ 新建服务商</button>
      </div>

      {/* Stats */}
      <StatsBar providers={providers} />

      {/* Search */}
      {providers.length > 0 && <SearchBar value={search} onChange={setSearch} />}

      {/* Provider List */}
      {providers.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : filtered.length === 0 ? (
        <div style={{
          padding: "40px 24px", textAlign: "center", color: TEXT_MUTED, fontSize: 14,
          background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12,
        }}>
          没有找到匹配的服务商
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onEdit={() => { setEditingProvider(p); setFormError(null); }}
              onDelete={() => { setDeletingProvider(p); setDeleteError(null); }}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showForm && (
        <ProviderFormModal
          initial={EMPTY_FORM}
          isEdit={false}
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          loading={formLoading}
          error={formError}
        />
      )}

      {/* Edit Modal */}
      {editingProvider && (
        <ProviderFormModal
          initial={{
            name: editingProvider.name,
            walletAddress: editingProvider.walletAddress,
            description: editingProvider.description,
            website: editingProvider.website,
          }}
          isEdit
          onSubmit={handleUpdate}
          onCancel={() => setEditingProvider(null)}
          loading={formLoading}
          error={formError}
        />
      )}

      {/* Delete Confirm */}
      {deletingProvider && (
        <ConfirmDialog
          title="确认删除服务商"
          message={deleteError
            ? `❌ ${deleteError}`
            : `确定要删除「${deletingProvider.name}」(${shortAddr(deletingProvider.walletAddress)}) 吗？\n\n如果该服务商下仍有关联服务，将无法删除。`}
          onConfirm={deleteError ? () => setDeletingProvider(null) : handleDelete}
          onCancel={() => setDeletingProvider(null)}
          danger={!deleteError}
        />
      )}
    </div>
  );
}

export default Providers;
