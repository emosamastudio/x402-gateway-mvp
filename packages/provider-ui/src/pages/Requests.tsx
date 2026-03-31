// packages/provider-ui/src/pages/Requests.tsx
import { useState, useEffect, useCallback } from "react";
import { listRequests, listMyServices } from "../api.js";
import type { GatewayRequest, Service } from "@x402-gateway-mvp/shared";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";

const STATUS_COLOR: Record<string, string> = {
  settled: "#10b981", success: "#10b981",
  settling: "#f59e0b", verifying: "#f59e0b",
  payment_required: "#6b7280", unauthorized: "#6b7280",
  payment_rejected: "#ef4444", proxy_error: "#ef4444",
  backend_error: "#ef4444", settlement_failed: "#ef4444",
};

function ts(v: number) {
  if (!v) return "—";
  return new Date(v).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortAddr(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

function ExpandedRow({ r }: { r: GatewayRequest }) {
  const hasTimestamps = r.challengeAt || r.verifiedAt || r.proxyAt || r.settledAt;
  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, background: "#0d1117" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${BORDER}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Left: error + response */}
          <div>
            {r.errorReason && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>失败原因</p>
                <p style={{ color: "#ef4444", fontSize: 13, fontFamily: "monospace", wordBreak: "break-word" }}>{r.errorReason}</p>
              </div>
            )}
            {r.responseBody && (
              <div>
                <p style={{ color: "#6b7280", fontSize: 11, marginBottom: 4 }}>后端响应 (truncated to 4KB)</p>
                <pre style={{
                  color: "#9ca3af", fontSize: 11, fontFamily: "monospace",
                  background: "#111827", border: `1px solid ${BORDER}`, borderRadius: 6,
                  padding: "8px 10px", maxHeight: 120, overflowY: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                }}>{r.responseBody}</pre>
              </div>
            )}
            {!r.errorReason && !r.responseBody && (
              <p style={{ color: "#374151", fontSize: 12 }}>无附加详情</p>
            )}
            {r.paymentId && (
              <div style={{ marginTop: 10 }}>
                <p style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>关联支付 ID</p>
                <p style={{ color: "#9ca3af", fontSize: 11, fontFamily: "monospace" }}>{r.paymentId}</p>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <p style={{ color: "#6b7280", fontSize: 11, marginBottom: 2 }}>Agent 地址</p>
              <p style={{ color: "#9ca3af", fontSize: 11, fontFamily: "monospace", wordBreak: "break-all" }}>{r.agentAddress || "—"}</p>
            </div>
          </div>

          {/* Right: lifecycle timestamps */}
          {hasTimestamps && (
            <div>
              <p style={{ color: "#6b7280", fontSize: 11, marginBottom: 8 }}>生命周期</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "收到请求", val: r.createdAt },
                  { label: "发出 402 挑战", val: r.challengeAt },
                  { label: "支付验证完成", val: r.verifiedAt },
                  { label: "后端响应返回", val: r.proxyAt },
                  { label: "链上结算完成", val: r.settledAt },
                ].map(({ label, val }) => val ? (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>{label}</span>
                    <span style={{ color: "#9ca3af", fontFamily: "monospace" }}>{ts(val)}</span>
                  </div>
                ) : null)}
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

export function Requests() {
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyServices().then(setServices); }, []);

  const load = useCallback(() => {
    setLoading(true);
    listRequests(filterService || undefined, filterStatus || undefined)
      .then(setRequests).finally(() => setLoading(false));
  }, [filterService, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const SELECT: React.CSSProperties = {
    padding: "8px 12px", background: "#0d1117", border: `1px solid ${BORDER}`,
    borderRadius: 8, color: "#e2e8f0", fontSize: 13,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22 }}>请求记录</h1>
        <button
          onClick={load}
          style={{ background: "transparent", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}
        >
          刷新
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <select style={SELECT} value={filterService} onChange={e => setFilterService(e.target.value)}>
          <option value="">所有服务</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select style={SELECT} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">所有状态</option>
          {["settled", "settlement_failed", "payment_required", "payment_rejected", "proxy_error", "backend_error"].map(st => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#6b7280", padding: 24 }}>加载中...</p>
        ) : requests.length === 0 ? (
          <p style={{ color: "#6b7280", padding: 24 }}>暂无数据</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["", "时间", "服务名", "方法 / 路径", "Agent 地址", "状态", "HTTP"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", color: "#6b7280", padding: "12px 16px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const isExpanded = expandedId === r.id;
                const hasDetail = !!(r.errorReason || r.responseBody || r.challengeAt || r.paymentId);
                return (
                  <>
                    <tr
                      key={r.id}
                      onClick={() => hasDetail && setExpandedId(isExpanded ? null : r.id)}
                      style={{
                        borderBottom: `1px solid ${BORDER}`,
                        cursor: hasDetail ? "pointer" : "default",
                        background: isExpanded ? "#0d1117" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 8px 10px 16px", color: "#374151", fontSize: 10 }}>
                        {hasDetail ? (isExpanded ? "▼" : "▶") : ""}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {new Date(r.createdAt).toLocaleString("zh-CN")}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#e2e8f0" }}>
                        {services.find(s => s.id === r.serviceId)?.name ?? "—"}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#3b82f6", fontFamily: "monospace" }}>
                        <span style={{ color: "#9ca3af", marginRight: 6 }}>{r.method}</span>{r.path}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#9ca3af", fontFamily: "monospace" }} title={r.agentAddress || undefined}>
                        {shortAddr(r.agentAddress)}
                      </td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ color: STATUS_COLOR[r.gatewayStatus] ?? "#9ca3af", fontFamily: "monospace", fontSize: 12 }}>
                          {r.gatewayStatus}
                        </span>
                        {r.errorReason && (
                          <span style={{ color: "#ef4444", marginLeft: 6, fontSize: 10 }} title={r.errorReason}>⚠</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#9ca3af" }}>{r.httpStatus || "—"}</td>
                    </tr>
                    {isExpanded && <ExpandedRow key={`${r.id}-detail`} r={r} />}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p style={{ color: "#374151", fontSize: 12, marginTop: 8 }}>点击行可展开详情</p>
    </div>
  );
}
