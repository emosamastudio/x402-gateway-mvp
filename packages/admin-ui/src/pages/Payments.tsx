import { useState, useEffect } from "react";
import { listPayments } from "../api.js";
import type { Payment } from "@x402-gateway/shared";

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => { listPayments().then(setPayments); }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Payments</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ color: "#60a5fa" }}>
            {["Agent", "Service", "Amount", "Network", "Tx Hash", "Status"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #1e2d45" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td style={{ padding: "10px 12px", color: "#94a3b8", borderBottom: "1px solid #111827" }}>{p.agentAddress.slice(0, 10)}…</td>
              <td style={{ padding: "10px 12px", color: "#94a3b8", borderBottom: "1px solid #111827" }}>{p.serviceId.slice(0, 10)}…</td>
              <td style={{ padding: "10px 12px", color: "#e2e8f0", borderBottom: "1px solid #111827" }}>{p.amount} DMHKD</td>
              <td style={{ padding: "10px 12px", color: "#94a3b8", borderBottom: "1px solid #111827" }}>{p.network}</td>
              <td style={{ padding: "10px 12px", color: "#22d3ee", borderBottom: "1px solid #111827" }}>{p.txHash.slice(0, 14)}…</td>
              <td style={{ padding: "10px 12px", borderBottom: "1px solid #111827" }}>
                <span style={{ color: p.status === "settled" ? "#34d399" : "#f87171", fontWeight: 600 }}>{p.status}</span>
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={6} style={{ padding: "24px 12px", color: "#475569", textAlign: "center" }}>No payments yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
