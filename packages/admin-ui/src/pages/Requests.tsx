import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { listRequests, listServices } from "../api.js";
import type { GatewayRequest, GatewayStatus, Service } from "@x402-gateway-mvp/shared";

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
  if (!addr || addr.length <= 14) return addr || "—";
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function networkColor(network: string) {
  if (network === "optimism-sepolia") return { color: "#f87171", bg: "#3b1111" };
  if (network === "sepolia") return { color: "#a78bfa", bg: "#2e1065" };
  return { color: "#60a5fa", bg: "#1e3a5f" };
}

function gatewayStatusMeta(status: GatewayStatus): {
  color: string; bg: string; label: string; icon: string;
} {
  switch (status) {
    case "settled":            return { color: SUCCESS, bg: "#064e3b", label: "已结算", icon: "✓" };
    case "success":            return { color: SUCCESS, bg: "#064e3b", label: "成功", icon: "✓" };
    case "settling":           return { color: "#22d3ee", bg: "#164e63", label: "结算中", icon: "⏳" };
    case "settlement_failed":  return { color: "#fb923c", bg: "#431407", label: "结算失败", icon: "⚠️" };
    case "payment_required":   return { color: WARN, bg: "#422006", label: "待支付", icon: "💲" };
    case "payment_rejected":   return { color: "#f87171", bg: "#3b1111", label: "支付拒绝", icon: "✗" };
    case "verifying":          return { color: "#a78bfa", bg: "#2e1065", label: "验证中", icon: "🔍" };
    case "unauthorized":       return { color: DANGER, bg: "#3b1111", label: "未授权", icon: "🚫" };
    case "proxy_error":        return { color: "#f87171", bg: "#3b1111", label: "代理错误", icon: "⚡" };
    case "backend_error":      return { color: "#fb923c", bg: "#431407", label: "后端错误", icon: "⚠️" };
    default: return { color: TEXT_MUTED, bg: CARD_BG, label: status, icon: "?" };
  }
}

function methodBadgeColor(method: string): string {
  const m = method.toUpperCase();
  if (m === "GET") return "#22d3ee";
  if (m === "POST") return "#10b981";
  if (m === "PUT") return "#f59e0b";
  if (m === "DELETE") return "#ef4444";
  if (m === "PATCH") return "#a78bfa";
  return "#60a5fa";
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

function formatResponseBody(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

/* ────────────────────── Sub-components ────────────────────── */

function Badge({ text, color = "#60a5fa", bg = "#1e3a5f" }: { text: string; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: bg,
      padding: "3px 9px", borderRadius: 20, letterSpacing: 0.3,
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>{text}</span>
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

function DetailRow({ label, value, mono, copy, color, full }: {
  label: string; value: string; mono?: boolean; copy?: boolean; color?: string; full?: boolean;
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
        <span style={textStyle}>{value}</span>
        {copy && <CopyBtn text={value} />}
      </div>
    </div>
  );
}

/* ────────────────────── Stats Bar ────────────────────── */

function StatsBar({ requests }: { requests: GatewayRequest[] }) {
  const total = requests.length;
  const settled = requests.filter((r) => r.gatewayStatus === "settled" || r.gatewayStatus === "success").length;
  const pending = requests.filter((r) => r.gatewayStatus === "payment_required" || r.gatewayStatus === "verifying" || r.gatewayStatus === "settling").length;
  const failed = requests.filter((r) => ["unauthorized", "payment_rejected", "proxy_error", "backend_error", "settlement_failed"].includes(r.gatewayStatus)).length;
  const settledRate = total > 0 ? ((settled / total) * 100).toFixed(1) : "0";

  const stats = [
    { label: "总请求数", value: total, icon: "📊", accent: ACCENT },
    { label: "完成率", value: `${settledRate}%`, icon: "✅", accent: SUCCESS },
    { label: "进行中", value: pending, icon: "⏳", accent: WARN },
    { label: "失败", value: failed, icon: "🚫", accent: DANGER },
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
            <div style={{ fontSize: 20, fontWeight: 800, color: s.accent }}>{s.value}</div>
            <div style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600 }}>{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────── Filter Tabs ────────────────────── */

type StatusFilter = "all" | "completed" | "pending" | "failed";

function FilterTabs({ active, counts, onChange }: {
  active: StatusFilter;
  counts: Record<StatusFilter, number>;
  onChange: (s: StatusFilter) => void;
}) {
  const tabs: { key: StatusFilter; label: string; color: string }[] = [
    { key: "all", label: "全部", color: ACCENT },
    { key: "completed", label: "已完成", color: SUCCESS },
    { key: "pending", label: "进行中", color: WARN },
    { key: "failed", label: "失败", color: DANGER },
  ];

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={{
            ...btnBase, padding: "6px 16px", fontSize: 12,
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

/* ────────────────────── Lifecycle Timeline ────────────────────── */

const LIFECYCLE_PHASES = [
  { key: "challengeAt" as const, label: "质询", icon: "📋" },
  { key: "verifiedAt" as const, label: "验证", icon: "🔍" },
  { key: "proxyAt" as const, label: "代理", icon: "🔀" },
  { key: "settledAt" as const, label: "结算", icon: "💰" },
];

function LifecycleTimeline({ request }: { request: GatewayRequest }) {
  const phases = LIFECYCLE_PHASES.map((p, i) => {
    const ts = request[p.key] as number;
    const reached = ts > 0;
    const prevTs = i > 0 ? (request[LIFECYCLE_PHASES[i - 1].key] as number) : 0;
    const duration = reached && prevTs > 0 ? ts - prevTs : null;
    return { ...p, ts, reached, duration };
  });

  const lastReached = phases.filter((p) => p.reached).length;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
      {phases.map((p, i) => {
        const isLast = i === phases.length - 1;
        const reachedColor = i < lastReached ? SUCCESS : WARN;
        const nodeColor = p.reached ? reachedColor : CARD_BORDER;
        return (
          <div key={p.key} style={{ display: "flex", alignItems: "flex-start", flex: isLast ? "0 0 auto" : 1 }}>
            {/* Node */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 56 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: p.reached ? nodeColor + "25" : "transparent",
                border: `2px solid ${nodeColor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, transition: "all 0.3s",
              }}>
                {p.reached ? p.icon : <span style={{ color: TEXT_MUTED, fontSize: 12 }}>{i + 1}</span>}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: p.reached ? TEXT_SECONDARY : TEXT_MUTED, marginTop: 4 }}>
                {p.label}
              </div>
              {p.reached && (
                <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
                  {new Date(p.ts).toLocaleTimeString()}
                </div>
              )}
              {p.duration !== null && (
                <div style={{ fontSize: 10, color: ACCENT, marginTop: 1, fontWeight: 600 }}>
                  {p.duration < 1000 ? `${p.duration}ms` : `${(p.duration / 1000).toFixed(1)}s`}
                </div>
              )}
            </div>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                flex: 1, height: 2, marginTop: 15, minWidth: 20,
                background: i < lastReached - 1 ? SUCCESS + "60" : CARD_BORDER,
                borderRadius: 1, transition: "background 0.3s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────── Request Card ────────────────────── */

function RequestCard({ request, serviceName, highlight }: { request: GatewayRequest; serviceName: string; highlight?: boolean }) {
  const [expanded, setExpanded] = useState(!!highlight);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const nc = networkColor(request.network);
  const gs = gatewayStatusMeta(request.gatewayStatus);
  const methodColor = methodBadgeColor(request.method);
  const hasResponseBody = !!request.responseBody;

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
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = highlight ? ACCENT : "#2d4a6f"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
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
        {/* Left: status dot + method + path + service */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: gs.color,
            boxShadow: `0 0 8px ${gs.color}50`,
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {request.method && (
                <Badge text={request.method} color={methodColor} bg={methodColor + "18"} />
              )}
              <code style={{ fontSize: 13, color: "#fbbf24", fontFamily: "monospace" }}>
                {request.path || "—"}
              </code>
              <span style={{ fontSize: 13, color: TEXT_SECONDARY, fontWeight: 500 }}>→ {serviceName}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "monospace" }}>
                {truncAddr(request.agentAddress)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: http status + gateway status + network + time + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {request.httpStatus > 0 && (
            <Badge
              text={`${request.httpStatus}`}
              color={request.httpStatus < 400 ? SUCCESS : request.httpStatus < 500 ? WARN : DANGER}
              bg={request.httpStatus < 400 ? "#064e3b" : request.httpStatus < 500 ? "#422006" : "#3b1111"}
            />
          )}
          <Badge text={gs.label} color={gs.color} bg={gs.bg} />
          <Badge text={request.network} color={nc.color} bg={nc.bg} />
          <span style={{ fontSize: 11, color: TEXT_MUTED, whiteSpace: "nowrap", minWidth: 70, textAlign: "right" }}>
            {relativeTime(request.createdAt)}
          </span>
          <span style={{
            fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "none",
          }}>▾</span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${CARD_BORDER}`, background: "#0c1018" }}>
          {/* ── Lifecycle Timeline ── */}
          <div style={{ padding: "16px 20px" }}>
            <SectionLabel text="生命周期" />
            <LifecycleTimeline request={request} />
          </div>

          {/* ── Request Info ── */}
          <div style={{ padding: "16px 20px" }}>
            <SectionLabel text="请求信息" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <DetailRow label="请求方法" value={request.method || "—"} />
              <DetailRow label="请求路径" value={request.path || "—"} mono />
              <DetailRow label="Agent 地址" value={request.agentAddress || "—"} mono copy />
              <DetailRow label="时间" value={formatDate(request.createdAt)} />
              <DetailRow label="网关状态" value={gs.label} color={gs.color} />
              <DetailRow label="HTTP 状态码" value={request.httpStatus ? String(request.httpStatus) : "—"}
                color={request.httpStatus < 400 ? SUCCESS : request.httpStatus < 500 ? WARN : DANGER} />
              <DetailRow label="Service ID" value={request.serviceId} mono copy />
              <DetailRow label="网络" value={request.network} />
            </div>
          </div>

          {/* ── Error Reason ── */}
          {request.errorReason && (
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{
                padding: "10px 14px", background: "#3b1111", border: "1px solid #7f1d1d",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  错误原因
                </div>
                <div style={{ fontSize: 12, color: "#fca5a5", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {request.errorReason}
                </div>
              </div>
            </div>
          )}

          {/* ── Response Body ── */}
          {hasResponseBody && (
            <div style={{ padding: "0 20px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <SectionLabel text="响应内容" />
                <button
                  type="button"
                  onClick={() => setBodyExpanded((v) => !v)}
                  style={{
                    ...btnBase, padding: "3px 12px", fontSize: 11,
                    background: "transparent", border: `1px solid ${CARD_BORDER}`,
                    color: "#60a5fa",
                  }}
                >{bodyExpanded ? "收起" : "展开"}</button>
              </div>
              <pre style={{
                margin: 0, padding: 14, background: INPUT_BG, borderRadius: 8,
                fontSize: 12, color: TEXT_SECONDARY, overflowX: "auto",
                maxHeight: bodyExpanded ? "none" : 120, overflowY: bodyExpanded ? "visible" : "hidden",
                whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.6,
                border: `1px solid ${CARD_BORDER}`, position: "relative",
              }}>
                {formatResponseBody(request.responseBody)}
              </pre>
              {!bodyExpanded && request.responseBody.length > 200 && (
                <div style={{
                  textAlign: "center", marginTop: -20, position: "relative",
                  background: "linear-gradient(transparent, #0c1018 80%)",
                  paddingTop: 20, paddingBottom: 4,
                }}>
                  <button
                    type="button"
                    onClick={() => setBodyExpanded(true)}
                    style={{
                      ...btnBase, padding: "3px 16px", fontSize: 11,
                      background: "#1e2d45", border: "none", color: "#60a5fa",
                    }}
                  >查看完整响应</button>
                </div>
              )}
            </div>
          )}

          {/* ── Linked Payment ── */}
          {request.paymentId && (
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${CARD_BORDER}` }}>
              <SectionLabel text="关联支付" />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: TEXT_MUTED }}>Payment ID:</span>
                <a
                  href={`/payments?highlight=${request.paymentId}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/payments?highlight=${request.paymentId}`); }}
                  style={{
                    fontSize: 12, color: "#22d3ee", fontFamily: "monospace",
                    textDecoration: "none", cursor: "pointer", transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#67e8f9"; e.currentTarget.style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#22d3ee"; e.currentTarget.style.textDecoration = "none"; }}
                >
                  {request.paymentId}
                  <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>→ 查看支付详情</span>
                </a>
                <CopyBtn text={request.paymentId} />
              </div>
            </div>
          )}
        </div>
      )}
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
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📡</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>暂无请求记录</div>
      <div style={{ fontSize: 14, color: TEXT_MUTED, maxWidth: 360, lineHeight: 1.6 }}>
        当代理发送请求到已注册的网关服务时，请求记录将在此显示
      </div>
    </div>
  );
}

/* ────────────────────── Main Component ────────────────────── */

export function Requests() {
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight") ?? "";
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([listRequests(), listServices()]);
      setRequests(r);
      setServices(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const serviceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of services) m.set(s.id, s.name);
    return m;
  }, [services]);

  const completedStatuses = new Set(["settled", "success"]);
  const pendingStatuses = new Set(["payment_required", "verifying", "settling"]);
  const failedStatuses = new Set(["unauthorized", "payment_rejected", "proxy_error", "backend_error", "settlement_failed"]);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter === "completed" && !completedStatuses.has(r.gatewayStatus)) return false;
      if (statusFilter === "pending" && !pendingStatuses.has(r.gatewayStatus)) return false;
      if (statusFilter === "failed" && !failedStatuses.has(r.gatewayStatus)) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      const svcName = serviceMap.get(r.serviceId) ?? "";
      return (
        r.agentAddress.toLowerCase().includes(q) ||
        r.serviceId.toLowerCase().includes(q) ||
        svcName.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.network.toLowerCase().includes(q) ||
        r.errorReason.toLowerCase().includes(q) ||
        r.gatewayStatus.toLowerCase().includes(q)
      );
    });
  }, [requests, search, statusFilter, serviceMap]);

  const counts = useMemo(() => ({
    all: requests.length,
    completed: requests.filter((r) => completedStatuses.has(r.gatewayStatus)).length,
    pending: requests.filter((r) => pendingStatuses.has(r.gatewayStatus)).length,
    failed: requests.filter((r) => failedStatuses.has(r.gatewayStatus)).length,
  }), [requests]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>请求记录</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>查看所有通过 x402 网关的请求，包括被拦截的请求</p>
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
      {requests.length > 0 && <StatsBar requests={requests} />}

      {/* Filter Tabs */}
      {requests.length > 0 && (
        <FilterTabs active={statusFilter} counts={counts} onChange={setStatusFilter} />
      )}

      {/* Search */}
      {requests.length > 0 && (
        <div style={{ position: "relative", marginBottom: 20 }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: TEXT_MUTED, pointerEvents: "none",
          }}>🔍</span>
          <input
            type="text"
            placeholder="搜索代理地址、服务名称、请求路径、错误原因..."
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
      ) : requests.length === 0 ? (
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
          {filtered.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              serviceName={serviceMap.get(r.serviceId) ?? truncAddr(r.serviceId)}
              highlight={r.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
