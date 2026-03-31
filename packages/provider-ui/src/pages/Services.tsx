// packages/provider-ui/src/pages/Services.tsx
import { useState, useEffect, useCallback } from "react";
import {
  listMyServices, createService, updateService, deleteService,
  listSchemes, createScheme, updateScheme, deleteScheme,
  listAvailableTokens, listAvailableChains,
} from "../api.js";
import type { Service, ServicePaymentScheme, TokenConfig, ChainConfig } from "@x402-gateway-mvp/shared";
import { slugify } from "@x402-gateway-mvp/shared";
import { useAuth } from "../auth.js";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#0d1117",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none",
};
const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6, marginTop: 14 };

interface ServiceFormData { name: string; backendUrl: string; minReputation: number; }
const EMPTY_SERVICE: ServiceFormData = { name: "", backendUrl: "", minReputation: 0 };

interface SchemeFormData { network: string; tokenId: string; priceAmount: string; recipient: string; }
const EMPTY_SCHEME: SchemeFormData = { network: "", tokenId: "", priceAmount: "0.001", recipient: "" };

export function Services() {
  const { provider } = useAuth();

  // Service state
  const [services, setServices] = useState<Service[]>([]);
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceFormData>(EMPTY_SERVICE);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceError, setServiceError] = useState("");

  // Scheme state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [schemesMap, setSchemesMap] = useState<Record<string, ServicePaymentScheme[]>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editingScheme, setEditingScheme] = useState<{ serviceId: string; scheme: ServicePaymentScheme } | null>(null);
  const [schemeForm, setSchemeForm] = useState<SchemeFormData>(EMPTY_SCHEME);
  const [schemeSaving, setSchemeSaving] = useState(false);
  const [schemeError, setSchemeError] = useState("");

  const load = useCallback(async () => {
    const [svcs, toks, chs] = await Promise.all([listMyServices(), listAvailableTokens(), listAvailableChains()]);
    setServices(svcs); setTokens(toks); setChains(chs);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Service form ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingServiceId(null); setServiceForm(EMPTY_SERVICE); setServiceError(""); setShowServiceForm(true);
  };
  const openEdit = (s: Service) => {
    setEditingServiceId(s.id);
    setServiceForm({ name: s.name, backendUrl: s.backendUrl, minReputation: s.minReputation });
    setServiceError(""); setShowServiceForm(true);
  };
  const closeServiceForm = () => {
    setShowServiceForm(false); setEditingServiceId(null); setServiceForm(EMPTY_SERVICE); setServiceError("");
  };

  const handleServiceSubmit = async () => {
    if (!serviceForm.name || !serviceForm.backendUrl) { setServiceError("请填写服务名称和后端地址"); return; }
    setServiceSaving(true); setServiceError("");
    try {
      if (editingServiceId) {
        await updateService(editingServiceId, serviceForm);
      } else {
        await createService(serviceForm);
      }
      closeServiceForm();
      await load();
    } catch (e: unknown) {
      setServiceError((e instanceof Error ? e.message : undefined) ?? (editingServiceId ? "更新失败" : "创建失败"));
    } finally { setServiceSaving(false); }
  };

  const handleDeleteService = async (id: string, name: string) => {
    if (!confirm(`确认删除服务「${name}」？`)) return;
    await deleteService(id);
    setSchemesMap(prev => { const n = { ...prev }; delete n[id]; return n; });
    setExpanded(prev => { const n = new Set(prev); n.delete(id); return n; });
    await load();
  };

  // ── Scheme expand ───────────────────────────────────────────────────────────
  const reloadSchemes = async (serviceId: string) => {
    const sch = await listSchemes(serviceId);
    setSchemesMap(prev => ({ ...prev, [serviceId]: sch }));
  };

  const toggleExpand = async (serviceId: string) => {
    if (expanded.has(serviceId)) {
      setExpanded(prev => { const n = new Set(prev); n.delete(serviceId); return n; });
    } else {
      setExpanded(prev => { const n = new Set(prev); n.add(serviceId); return n; });
      if (!schemesMap[serviceId]) await reloadSchemes(serviceId);
    }
  };

  // ── Scheme form ─────────────────────────────────────────────────────────────
  const openAddScheme = (serviceId: string) => {
    setAddingFor(serviceId); setEditingScheme(null); setSchemeForm(EMPTY_SCHEME); setSchemeError("");
  };
  const openEditScheme = (serviceId: string, scheme: ServicePaymentScheme) => {
    setEditingScheme({ serviceId, scheme }); setAddingFor(null);
    setSchemeForm({ network: scheme.network, tokenId: scheme.tokenId, priceAmount: scheme.priceAmount, recipient: scheme.recipient });
    setSchemeError("");
  };
  const cancelSchemeForm = () => {
    setAddingFor(null); setEditingScheme(null); setSchemeForm(EMPTY_SCHEME); setSchemeError("");
  };

  const handleSchemeSubmit = async () => {
    const serviceId = editingScheme?.serviceId ?? addingFor;
    if (!serviceId) return;
    if (!schemeForm.priceAmount) { setSchemeError("请填写价格"); return; }
    if (!editingScheme && (!schemeForm.network || !schemeForm.tokenId)) { setSchemeError("请选择网络和 Token"); return; }
    setSchemeSaving(true); setSchemeError("");
    try {
      if (editingScheme) {
        await updateScheme(serviceId, editingScheme.scheme.id, {
          priceAmount: schemeForm.priceAmount,
          recipient: schemeForm.recipient || undefined,
        });
      } else {
        await createScheme(serviceId, {
          network: schemeForm.network, tokenId: schemeForm.tokenId,
          priceAmount: schemeForm.priceAmount,
          recipient: schemeForm.recipient || undefined,
        });
      }
      cancelSchemeForm();
      await reloadSchemes(serviceId);
    } catch (e: unknown) {
      setSchemeError((e instanceof Error ? e.message : undefined) ?? "操作失败");
    } finally { setSchemeSaving(false); }
  };

  const handleDeleteScheme = async (serviceId: string, schemeId: string) => {
    if (!confirm("确认删除此支付方案？")) return;
    await deleteScheme(serviceId, schemeId);
    await reloadSchemes(serviceId);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const schemeTokens = (network: string) => network ? tokens.filter(t => t.chainSlug === network) : tokens;

  const computeGatewayPath = (svc: Service, sch: ServicePaymentScheme) => {
    const pSlug = slugify(provider?.name ?? "");
    const sSlug = slugify(svc.name);
    const tok = tokens.find(t => t.id === sch.tokenId);
    const tSlug = slugify(tok?.symbol ?? sch.tokenId);
    return `/${pSlug}/${sSlug}/${sch.network}/${tSlug}`;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22 }}>我的服务</h1>
        <button
          onClick={openCreate}
          style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer" }}
        >
          + 新建服务
        </button>
      </div>

      {/* ── Service Create/Edit Modal ────────────────────────────────────────── */}
      {showServiceForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 32, width: 420, maxHeight: "90vh", overflowY: "auto" }}>
            <h2 style={{ color: "#e2e8f0", marginBottom: 16 }}>{editingServiceId ? "编辑服务" : "新建服务"}</h2>

            <label style={LABEL}>服务名称 *</label>
            <input style={INPUT} value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} placeholder="My API" />

            <label style={LABEL}>后端地址 *</label>
            <input style={INPUT} value={serviceForm.backendUrl} onChange={e => setServiceForm(f => ({ ...f, backendUrl: e.target.value }))} placeholder="https://api.example.com" />

            <label style={LABEL}>最低信誉分 (0 = 不限)</label>
            <input style={INPUT} type="number" min="0" max="100" value={serviceForm.minReputation} onChange={e => setServiceForm(f => ({ ...f, minReputation: parseInt(e.target.value) || 0 }))} />

            {serviceError && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{serviceError}</p>}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={handleServiceSubmit} disabled={serviceSaving}
                style={{ flex: 1, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>
                {serviceSaving ? (editingServiceId ? "保存中..." : "创建中...") : (editingServiceId ? "保存" : "创建")}
              </button>
              <button onClick={closeServiceForm}
                style={{ flex: 1, background: "transparent", color: "#9ca3af", border: "1px solid #1e2d45", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Services List ────────────────────────────────────────────────────── */}
      {services.length === 0 ? (
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#6b7280" }}>还没有服务，点击「新建服务」开始</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {services.map(svc => {
            const isExpanded = expanded.has(svc.id);
            const schemes = schemesMap[svc.id] ?? [];
            const isAddingScheme = addingFor === svc.id;

            return (
              <div key={svc.id} style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                {/* Service header */}
                <div style={{ padding: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 2 }}>{svc.name}</p>
                    <p style={{ color: "#374151", fontSize: 11, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}
                      title={svc.backendUrl}>→ {svc.backendUrl}</p>
                    {svc.minReputation > 0 && (
                      <p style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>最低信誉 {svc.minReputation}</p>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginLeft: 16, flexShrink: 0 }}>
                    <button
                      onClick={() => toggleExpand(svc.id)}
                      style={{ background: isExpanded ? "#1e3a5f" : "transparent", color: "#60a5fa", border: "1px solid #1e3a5f", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}
                    >
                      {isExpanded ? "收起" : "支付方案"}
                    </button>
                    <button onClick={() => openEdit(svc)}
                      style={{ background: "transparent", color: "#9ca3af", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
                      编辑
                    </button>
                    <button onClick={() => handleDeleteService(svc.id, svc.name)}
                      style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>
                      删除
                    </button>
                  </div>
                </div>

                {/* Scheme sub-section */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${BORDER}`, background: "#0d1117", padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ color: "#6b7280", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>支付方案</span>
                      {!isAddingScheme && !editingScheme && (
                        <button
                          onClick={() => openAddScheme(svc.id)}
                          style={{ background: "#1a2d1a", color: "#4ade80", border: "1px solid #166534", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 12 }}
                        >
                          + 添加方案
                        </button>
                      )}
                    </div>

                    {schemes.length === 0 && !isAddingScheme && (
                      <p style={{ color: "#374151", fontSize: 12, fontStyle: "italic", marginBottom: 8 }}>暂无支付方案 — 点击「添加方案」</p>
                    )}

                    {schemes.map(sch => {
                      const isEditingThis = editingScheme?.serviceId === svc.id && editingScheme?.scheme.id === sch.id;
                      const tok = tokens.find(t => t.id === sch.tokenId);
                      const gatewayPath = computeGatewayPath(svc, sch);

                      if (isEditingThis) {
                        return (
                          <SchemeInlineForm
                            key={sch.id}
                            form={schemeForm}
                            setForm={setSchemeForm}
                            chains={chains}
                            filteredTokens={schemeTokens(schemeForm.network)}
                            isEdit
                            saving={schemeSaving}
                            error={schemeError}
                            onSubmit={handleSchemeSubmit}
                            onCancel={cancelSchemeForm}
                          />
                        );
                      }

                      return (
                        <div key={sch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid #0f1929", flexWrap: "wrap" }}>
                          <span style={{ background: "#1e3a5f", color: "#60a5fa", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                            {sch.network}
                          </span>
                          <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 500, minWidth: 50 }}>
                            {tok?.symbol ?? sch.tokenId}
                          </span>
                          <span style={{ color: "#4ade80", fontSize: 13, minWidth: 70 }}>
                            {sch.priceAmount}
                          </span>
                          <span style={{ color: "#6b7280", fontSize: 11, fontFamily: "monospace", minWidth: 90 }} title={sch.recipient}>
                            {sch.recipient.slice(0, 8)}…{sch.recipient.slice(-4)}
                          </span>
                          <span
                            style={{ color: "#3b82f6", fontSize: 11, fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 120 }}
                            title={gatewayPath}
                          >
                            {gatewayPath}
                          </span>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => openEditScheme(svc.id, sch)}
                              style={{ background: "transparent", color: "#9ca3af", border: "1px solid #1e2d45", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
                              编辑
                            </button>
                            <button onClick={() => handleDeleteScheme(svc.id, sch.id)}
                              style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {isAddingScheme && (
                      <SchemeInlineForm
                        form={schemeForm}
                        setForm={setSchemeForm}
                        chains={chains}
                        filteredTokens={schemeTokens(schemeForm.network)}
                        isEdit={false}
                        saving={schemeSaving}
                        error={schemeError}
                        onSubmit={handleSchemeSubmit}
                        onCancel={cancelSchemeForm}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Scheme inline form ────────────────────────────────────────────────────────
interface SchemeInlineFormProps {
  form: SchemeFormData;
  setForm: React.Dispatch<React.SetStateAction<SchemeFormData>>;
  chains: ChainConfig[];
  filteredTokens: TokenConfig[];
  isEdit: boolean;
  saving: boolean;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
}

function SchemeInlineForm({ form, setForm, chains, filteredTokens, isEdit, saving, error, onSubmit, onCancel }: SchemeInlineFormProps) {
  const SI: React.CSSProperties = {
    padding: "7px 10px", background: "#111827", border: "1px solid #1e2d45",
    borderRadius: 6, color: "#e2e8f0", fontSize: 13, outline: "none",
  };
  return (
    <div style={{ background: "#0f1929", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, marginTop: 8 }}>
      <p style={{ color: "#60a5fa", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>{isEdit ? "编辑方案" : "添加支付方案"}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {!isEdit && (
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>网络 *</label>
            <select style={{ ...SI, minWidth: 140, cursor: "pointer" }}
              value={form.network}
              onChange={e => setForm(f => ({ ...f, network: e.target.value, tokenId: "" }))}>
              <option value="">-- 选择网络 --</option>
              {chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {!isEdit && (
          <div>
            <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>Token *</label>
            <select style={{ ...SI, minWidth: 140, cursor: "pointer" }}
              value={form.tokenId}
              onChange={e => setForm(f => ({ ...f, tokenId: e.target.value }))}
              disabled={!form.network}>
              <option value="">-- 选择 Token --</option>
              {filteredTokens.map(t => <option key={t.id} value={t.id}>{t.symbol}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>价格 *</label>
          <input style={{ ...SI, width: 100 }} type="number" step="0.001" min="0"
            value={form.priceAmount}
            onChange={e => setForm(f => ({ ...f, priceAmount: e.target.value }))} />
        </div>
        <div>
          <label style={{ color: "#6b7280", fontSize: 11, display: "block", marginBottom: 4 }}>收款地址 (可选)</label>
          <input style={{ ...SI, width: 190 }}
            value={form.recipient}
            onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))}
            placeholder="0x… 留空使用钱包地址" />
        </div>
        <button onClick={onSubmit} disabled={saving}
          style={{ background: "#166534", color: "#4ade80", border: "1px solid #166534", borderRadius: 6, padding: "7px 16px", cursor: "pointer", fontSize: 13 }}>
          {saving ? "保存中..." : "保存"}
        </button>
        <button onClick={onCancel}
          style={{ background: "transparent", color: "#9ca3af", border: "1px solid #1e2d45", borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontSize: 13 }}>
          取消
        </button>
      </div>
      {error && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  );
}
