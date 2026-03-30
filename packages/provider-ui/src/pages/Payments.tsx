// packages/provider-ui/src/pages/Payments.tsx
import { useState, useEffect } from "react";
import { listPayments, listMyServices } from "../api.js";
import type { Payment, Service } from "@x402-gateway-mvp/shared";

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filterService, setFilterService] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyServices().then(setServices); }, []);

  useEffect(() => {
    setLoading(true);
    listPayments(filterService || undefined).then(setPayments).finally(() => setLoading(false));
  }, [filterService]);

  const CARD_BG = "#111827"; const BORDER = "#1e2d45";
  const SELECT: React.CSSProperties = { padding: "8px 12px", background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, color: "#e2e8f0", fontSize: 13 };

  // Find explorer URL for a payment's network
  const getExplorerUrl = (p: Payment) => {
    const EXPLORERS: Record<string, string> = {
      "optimism-sepolia": "https://sepolia-optimism.etherscan.io/tx",
      "sepolia": "https://sepolia.etherscan.io/tx",
    };
    const base = EXPLORERS[p.network];
    return base && p.txHash !== "failed" ? `${base}/${p.txHash}` : null;
  };

  return (
    <div>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>收款记录</h1>

      <div style={{ marginBottom: 20 }}>
        <select style={SELECT} value={filterService} onChange={e => setFilterService(e.target.value)}>
          <option value="">所有服务</option>
          {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#6b7280", padding: 24 }}>加载中...</p>
        ) : payments.length === 0 ? (
          <p style={{ color: "#6b7280", padding: 24 }}>暂无收款记录</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["时间", "服务名", "金额", "状态", "交易 Hash", "Agent 地址"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "12px 16px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const explorerUrl = getExplorerUrl(p);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 16px", color: "#6b7280" }}>{new Date(p.createdAt).toLocaleString("zh-CN")}</td>
                    <td style={{ padding: "10px 16px", color: "#e2e8f0" }}>{services.find(s => s.id === p.serviceId)?.name ?? "—"}</td>
                    <td style={{ padding: "10px 16px", color: "#10b981", fontWeight: 600 }}>{p.amount} {p.network.includes("sepolia") ? "DMHKD" : ""}</td>
                    <td style={{ padding: "10px 16px" }}>
                      <span style={{ color: p.status === "settled" ? "#10b981" : "#ef4444", fontSize: 12, fontFamily: "monospace" }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12 }}>
                      {explorerUrl ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>
                          {p.txHash.slice(0, 10)}...{p.txHash.slice(-6)}
                        </a>
                      ) : (
                        <span style={{ color: "#6b7280" }}>{p.txHash.slice(0, 16)}...</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#9ca3af", fontFamily: "monospace", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.agentAddress || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
