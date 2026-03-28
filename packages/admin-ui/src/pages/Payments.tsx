import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { listPayments, listServices } from "../api.js";
import type { Payment, Service } from "@x402-gateway-mvp/shared";

/* ────────────────────── Design Tokens ────────────────────── */

const CARD_BG = "#111827";
const CARD_BORDER = "#1e2d45";
const ACCENT = "#3b82f6";
const SUCCESS = "#10b981";
const DANGER = "#ef4444";
const WARN = "#f59e0b";
const TEXT_PRIMARY = "#e2e8f0";
const TEXT_SECONDARY = "#94a3b8";
const TEXT_MUTED = "#475569";
const INPUT_BG = "#0d1117";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", background: CARD_BG,
  border: `1px solid ${CARD_BORDER}`, borderRadius: 10, color: TEXT_PRIMARY,
  fontSize: 14, boxSizing: "border-box", outline: "none",
  transition: "border-color 0.2s",
};

const btnBase: React.CSSProperties = {
  border: "none", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600, padding: "8px 18px",
  transition: "background 0.2s, transform 0.1s",
  display: "inline-flex", alignItems: "center", gap: 6,
};

/* ────────────────────── Helpers ────────────────────── */

function truncAddr(addr: string) {
  if (!addr || addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function networkColor(network: string) {
  if (network === "optimism-sepolia") return { color: "#f87171", bg: "#3b1111" };
  if (network === "sepolia") return { color: "#a78bfa", bg: "#2e1065" };
  return { color: "#60a5fa", bg: "#1e3a5f" };
}

function statusStyle(status: string): { color: string; bg: string; label: string } {
  if (status === "settled") return { color: SUCCESS, bg: "#064e3b", label: "已结算" };
  return { color: DANGER, bg: "#3b1111", label: "失败" };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(ts);
}

function explorerTxUrl(txHash: string, network: string): string {
  if (network === "optimism-sepolia") return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
  if (network === "sepolia") return `https://sepolia.etherscan.io/tx/${txHash}`;
  return `https://etherscan.io/tx/${txHash}`;
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 10,
      textTransform: "uppercase", letterSpacing: 0.8,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        width: 3, height: 12, borderRadius: 2, background: "#60a5fa",
        display: "inline-block", flexShrink: 0,
      }} />
      {text}
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{
        ...btnBase, padding: "2px 8px", fontSize: 10, fontWeight: 500,
        background: copied ? "#065f46" : "transparent",
        border: `1px solid ${copied ? SUCCESS : CARD_BORDER}`,
        color: copied ? "#34d399" : "#60a5fa",
      }}
    >{copied ? "✓" : (label ?? "复制")}</button>
  );
}

function Badge({ text, color = "#60a5fa", bg = "#1e3a5f" }: { text: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: bg,
      padding: "3px 9px", borderRadius: 20, letterSpacing: 0.3,
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>{text}</span>
  );
}

/* ────────────────────── Stats Bar ────────────────────── */

function StatsBar({ payments }: { payments: Payment[] }) {
  const settled = payments.filter((p) => p.status === "settled");
  const failed = payments.filter((p) => p.status === "failed");
  const totalAmount = settled.reduce((s, p) => s + parseFloat(p.amount || "0"), 0);
  const uniqueAgents = new Set(payments.map((p) => p.agentAddress)).size;

  const stats = [
    { label: "总交易数", value: payments.length, icon: "📊", accent: ACCENT },
    { label: "结算金额", value: `${totalAmount.toFixed(4)}`, sub: "DMHKD", icon: "💰", accent: SUCCESS },
    { label: "成功/失败", value: `${settled.length} / ${failed.length}`, icon: "📈", accent: settled.length > 0 ? SUCCESS : TEXT_MUTED },
    { label: "独立代理", value: uniqueAgents, icon: "🤖", accent: "#a78bfa" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12,
          padding: "16px 18px", display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#1e293b",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
            flexShrink: 0,
          }}>{s.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: s.accent }}>{s.value}</span>
              {s.sub && <span style={{ fontSize: 11, color: TEXT_MUTED }}>{s.sub}</span>}
            </div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────── Filter Tabs ────────────────────── */

type StatusFilter = "all" | "settled" | "failed";

function FilterTabs({ active, counts, onChange }: {
  active: StatusFilter;
  counts: { all: number; settled: number; failed: number };
  onChange: (s: StatusFilter) => void;
}) {
  const tabs: { key: StatusFilter; label: string; color: string }[] = [
    { key: "all", label: "全部", color: ACCENT },
    { key: "settled", label: "已结算", color: SUCCESS },
    { key: "failed", label: "失败", color: DANGER },
  ];

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={{
            ...btnBase,
            padding: "6px 16px",
            fontSize: 12,
            background: active === t.key ? t.color + "20" : "transparent",
            border: `1px solid ${active === t.key ? t.color : CARD_BORDER}`,
            color: active === t.key ? t.color : TEXT_MUTED,
            borderRadius: 20,
          }}
        >
          {t.label}
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: active === t.key ? t.color + "30" : CARD_BORDER,
            color: active === t.key ? t.color : TEXT_SECONDARY,
            padding: "1px 7px", borderRadius: 10, marginLeft: 2,
          }}>
            {counts[t.key]}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ────────────────────── Payment Card ────────────────────── */

function PaymentCard({ payment, serviceName, highlight }: { payment: Payment; serviceName: string; highlight?: boolean }) {
  const [expanded, setExpanded] = useState(!!highlight);
  const cardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const nc = networkColor(payment.network);
  const ss = statusStyle(payment.status);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight]);

  return (
    <div
      ref={cardRef}
      style={{
        background: CARD_BG, border: `1px solid ${highlight ? ACCENT : CARD_BORDER}`, borderRadius: 14,
        overflow: "hidden", transition: "border-color 0.5s, box-shadow 0.5s",
        boxShadow: highlight ? `0 0 20px ${ACCENT}40` : "none",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = highlight ? ACCENT : "#2d4a6f"; e.currentTarget.style.boxShadow = `0 4px 20px rgba(0,0,0,0.3)`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = highlight ? ACCENT : CARD_BORDER; e.currentTarget.style.boxShadow = highlight ? `0 0 20px ${ACCENT}40` : "none"; }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", cursor: "pointer", gap: 12,
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Left: status dot + amount + service name */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: ss.color,
            boxShadow: `0 0 8px ${ss.color}50`,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: TEXT_PRIMARY }}>
                {payment.amount} <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MUTED }}>DMHKD</span>
              </span>
              <span style={{ fontSize: 13, color: TEXT_SECONDARY, fontWeight: 500 }}>→ {serviceName}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "monospace" }}>
                来自 {truncAddr(payment.agentAddress)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: badges + time + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Badge text={ss.label} color={ss.color} bg={ss.bg} />
          <Badge text={payment.network} color={nc.color} bg={nc.bg} />
          <span style={{ fontSize: 11, color: TEXT_MUTED, whiteSpace: "nowrap", minWidth: 70, textAlign: "right" }}>
            {relativeTime(payment.createdAt)}
          </span>
          <span style={{
            fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "none",
          }}>▾</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${CARD_BORDER}`,
          background: "#0c1018",
        }}>
          {/* ── Payment & Settlement ── */}
          <div style={{ padding: "16px 20px" }}>
            <SectionLabel text="支付详情" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <DetailRow label="Agent 地址" value={payment.agentAddress} mono copy />
              <DetailRow label="Service ID" value={payment.serviceId} mono copy />
              <DetailRow label="金额" value={`${payment.amount} DMHKD`} />
              <DetailRow label="结算状态" value={ss.label} color={ss.color} />
              <DetailRow label="网络" value={payment.network} />
              <DetailRow label="时间" value={formatDate(payment.createdAt)} />
            </div>
            {payment.settlementError && (
              <div style={{
                padding: "10px 14px", background: "#3b1111", border: "1px solid #7f1d1d",
                borderRadius: 8, marginBottom: 14,
              }}>
                <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  结算错误
                </div>
                <div style={{ fontSize: 12, color: "#fca5a5", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {payment.settlementError}
                </div>
              </div>
            )}
            {payment.txHash && payment.txHash !== "failed" && (
              <DetailRow label="交易哈希" value={payment.txHash} mono copy full
                link={explorerTxUrl(payment.txHash, payment.network)} />
            )}
          </div>

          {/* ── Linked Request ── */}
          {payment.requestId && (
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${CARD_BORDER}` }}>
              <SectionLabel text="关联请求" />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: TEXT_MUTED }}>Request ID:</span>
                <a
                  href={`/requests?highlight=${payment.requestId}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/requests?highlight=${payment.requestId}`); }}
                  style={{
                    fontSize: 12, color: "#22d3ee", fontFamily: "monospace",
                    textDecoration: "none", cursor: "pointer", transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#67e8f9"; e.currentTarget.style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#22d3ee"; e.currentTarget.style.textDecoration = "none"; }}
                >
                  {payment.requestId}
                  <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>→ 查看请求详情</span>
                </a>
                <CopyBtn text={payment.requestId} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, copy, color, full, link }: {
  label: string; value: string; mono?: boolean; copy?: boolean; color?: string; full?: boolean; link?: string;
}) {
  const textStyle: React.CSSProperties = {
    fontSize: 13, color: color ?? TEXT_SECONDARY, wordBreak: "break-all",
    fontFamily: mono ? "monospace" : "inherit", lineHeight: 1.5,
    fontWeight: color ? 700 : 400,
  };
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer"
            style={{ ...textStyle, color: "#22d3ee", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#67e8f9"; e.currentTarget.style.textDecoration = "underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#22d3ee"; e.currentTarget.style.textDecoration = "none"; }}
          >
            {value}
            <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>↗</span>
          </a>
        ) : (
          <span style={textStyle}>{value}</span>
        )}
        {copy && <CopyBtn text={value} />}
      </div>
    </div>
  );
}

/* ────────────────────── Empty State ────────────────────── */

function EmptyState() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "80px 24px", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`,
      borderRadius: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>💳</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>暂无支付记录</div>
      <div style={{ fontSize: 14, color: TEXT_MUTED, maxWidth: 360, lineHeight: 1.6 }}>
        当代理通过 x402 网关使用已注册服务时，支付记录将在此显示
      </div>
    </div>
  );
}

/* ────────────────────── Main Component ────────────────────── */

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight") ?? "";
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([listPayments(), listServices()]);
      setPayments(p);
      setServices(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Service ID → Name map
  const serviceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) m.set(s.id, s.name);
    return m;
  }, [services]);

  // Filtering
  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const svcName = serviceMap.get(p.serviceId) ?? "";
      return (
        p.agentAddress.toLowerCase().includes(q) ||
        p.serviceId.toLowerCase().includes(q) ||
        svcName.toLowerCase().includes(q) ||
        p.txHash.toLowerCase().includes(q) ||
        p.network.toLowerCase().includes(q) ||
        p.amount.includes(q)
      );
    });
  }, [payments, search, statusFilter, serviceMap]);

  const counts = useMemo(() => ({
    all: payments.length,
    settled: payments.filter((p) => p.status === "settled").length,
    failed: payments.filter((p) => p.status === "failed").length,
  }), [payments]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>支付记录</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>查看所有通过 x402 网关的交易记录</p>
        </div>
        <button
          type="button"
          onClick={load}
          style={{
            ...btnBase, fontSize: 13, background: "transparent",
            border: `1px solid ${CARD_BORDER}`, color: TEXT_SECONDARY,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.color = TEXT_SECONDARY; }}
        >↻ 刷新</button>
      </div>

      {/* Stats */}
      {payments.length > 0 && <StatsBar payments={payments} />}

      {/* Filter Tabs */}
      {payments.length > 0 && (
        <FilterTabs active={statusFilter} counts={counts} onChange={setStatusFilter} />
      )}

      {/* Search */}
      {payments.length > 0 && (
        <div style={{ position: "relative", marginBottom: 20 }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: TEXT_MUTED, pointerEvents: "none",
          }}>🔍</span>
          <input
            type="text"
            placeholder="搜索代理地址、服务名称、交易哈希..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 38 }}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{
          padding: "60px 24px", textAlign: "center", color: TEXT_MUTED,
          background: CARD_BG, borderRadius: 14, border: `1px solid ${CARD_BORDER}`,
        }}>
          <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}>⏳</div>
          加载中...
        </div>
      ) : payments.length === 0 ? (
        <EmptyState />
      ) : filtered.length === 0 ? (
        <div style={{
          padding: "40px 24px", textAlign: "center", color: TEXT_MUTED, fontSize: 14,
          background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12,
        }}>
          没有找到匹配的记录
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              serviceName={serviceMap.get(p.serviceId) ?? truncAddr(p.serviceId)}
              highlight={p.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
