// packages/provider-ui/src/pages/Payments.tsx
import { useState, useEffect, useCallback } from "react";
import { listPayments, listMyServices } from "../api.js";
import type { Payment, Service } from "@x402-gateway-mvp/shared";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";

const EXPLORERS: Record<string, string> = {
  "optimism-sepolia": "https://sepolia-optimism.etherscan.io/tx",
  "sepolia": "https://sepolia.etherscan.io/tx",
};

function shortAddr(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [filterService, setFilterService] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { listMyServices().then(setServices); }, []);

  const load = useCallback(() => {
    setLoading(true);
    listPayments(filterService || undefined).then(setPayments).finally(() => setLoading(false));
  }, [filterService]);

  useEffect(() => { load(); }, [load]);

  const SELECT: React.CSSProperties = {
    padding: "8px 12px", background: "#0d1117", border: `1px solid ${BORDER}`,
    borderRadius: 8, color: "#e2e8f0", fontSize: 13,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22 }}>收款记录</h1>
        <button
          onClick={load}
          style={{ background: "transparent", color: "#6b7280", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}
        >
          刷新
        </button>
      </div>

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
                {["时间", "服务名", "网络", "金额", "状态", "交易 Hash", "Agent 地址"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "12px 16px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const base = EXPLORERS[p.network];
                const explorerUrl = base && p.txHash && p.txHash !== "failed" ? `${base}/${p.txHash}` : null;
                const isSettled = p.status === "settled";
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {new Date(p.createdAt).toLocaleString("zh-CN")}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#e2e8f0" }}>
                      {services.find(s => s.id === p.serviceId)?.name ?? "—"}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#9ca3af", fontSize: 12 }}>
                      {p.network}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#10b981", fontWeight: 600 }}>
                      {p.amount} <span style={{ color: "#6b7280", fontWeight: 400 }}>DMHKD</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <div>
                        <span style={{ color: isSettled ? "#10b981" : "#ef4444", fontSize: 12, fontFamily: "monospace" }}>
                          {p.status}
                        </span>
                        {!isSettled && p.settlementError && (
                          <p style={{ color: "#ef4444", fontSize: 11, marginTop: 3, fontFamily: "monospace", maxWidth: 180 }} title={p.settlementError}>
                            {p.settlementError.length > 40 ? p.settlementError.slice(0, 40) + "…" : p.settlementError}
                          </p>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12 }}>
                      {explorerUrl ? (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>
                          {p.txHash.slice(0, 10)}...{p.txHash.slice(-6)}
                        </a>
                      ) : p.txHash ? (
                        <span style={{ color: "#6b7280" }}>{p.txHash.slice(0, 14)}…</span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 16px", color: "#9ca3af", fontFamily: "monospace" }} title={p.agentAddress || undefined}>
                      {shortAddr(p.agentAddress)}
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
