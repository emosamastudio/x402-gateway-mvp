// packages/provider-ui/src/pages/Requests.tsx
import { useState, useEffect } from "react";
import { listRequests, listMyServices } from "../api.js";
import type { GatewayRequest, Service } from "@x402-gateway-mvp/shared";

const STATUS_COLOR: Record<string, string> = {
  settled: "#10b981", success: "#10b981",
  settling: "#f59e0b", verifying: "#f59e0b",
  payment_required: "#6b7280", unauthorized: "#6b7280",
  payment_rejected: "#ef4444", proxy_error: "#ef4444",
  backend_error: "#ef4444", settlement_failed: "#ef4444",
};

export function Requests() {
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filterService, setFilterService] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyServices().then(setServices); }, []);

  useEffect(() => {
    setLoading(true);
    listRequests(filterService || undefined, filterStatus || undefined)
      .then(setRequests).finally(() => setLoading(false));
  }, [filterService, filterStatus]);

  const CARD_BG = "#111827"; const BORDER = "#1e2d45";
  const SELECT: React.CSSProperties = { padding: "8px 12px", background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13 };

  return (
    <div>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>请求记录</h1>

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
                {["时间", "服务名", "路径", "Agent 地址", "状态", "HTTP"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "12px 16px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: "10px 16px", color: "#6b7280" }}>{new Date(r.createdAt).toLocaleString("zh-CN")}</td>
                  <td style={{ padding: "10px 16px", color: "#e2e8f0" }}>{services.find(s => s.id === r.serviceId)?.name ?? "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#3b82f6", fontFamily: "monospace" }}>{r.method} {r.path}</td>
                  <td style={{ padding: "10px 16px", color: "#9ca3af", fontFamily: "monospace", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.agentAddress || "—"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ color: STATUS_COLOR[r.gatewayStatus] ?? "#9ca3af", fontFamily: "monospace", fontSize: 12 }}>
                      {r.gatewayStatus}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#9ca3af" }}>{r.httpStatus || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
