// packages/provider-ui/src/pages/Dashboard.tsx
import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getSummaryStats, getTimeseries, listMyServices, listRequests, listPayments } from "../api.js";
import type { SummaryStats, TimeseriesDay } from "../api.js";
import type { Service, GatewayRequest, Payment } from "@x402-gateway-mvp/shared";

const CARD_BG = "#111827";
const BORDER = "#1e2d45";
const ACCENT = "#3b82f6";

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12,
      padding: "20px 24px", flex: 1, minWidth: 160,
    }}>
      <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>{label}</p>
      <p style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [series, setSeries] = useState<TimeseriesDay[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [requests, setRequests] = useState<GatewayRequest[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSummaryStats(), getTimeseries(7), listMyServices(), listRequests(), listPayments()])
      .then(([s, ts, svcs, reqs, pmts]) => {
        setStats(s); setSeries(ts); setServices(svcs); setRequests(reqs); setPayments(pmts);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: "#6b7280" }}>加载中...</p>;
  if (!stats) return <p style={{ color: "#ef4444" }}>加载失败</p>;

  return (
    <div>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>Dashboard</h1>

      {/* KPI Cards */}
      <div style={{ display: "flex", gap: 16, marginBottom: 32, flexWrap: "wrap" }}>
        <KpiCard label="总收入" value={`${parseFloat(stats.totalRevenue).toFixed(4)} DMHKD`} />
        <KpiCard label="本月收入" value={`${parseFloat(stats.monthRevenue).toFixed(4)} DMHKD`} />
        <KpiCard label="总请求数" value={String(stats.totalRequests)} />
        <KpiCard
          label="结算成功率"
          value={`${(stats.successRate * 100).toFixed(1)}%`}
          sub={`${stats.settledRequests} / ${stats.totalRequests} 次结算`}
        />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
          <p style={{ color: "#e2e8f0", marginBottom: 16, fontWeight: 600 }}>近 7 天请求量</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}` }} />
              <Legend />
              <Line type="monotone" dataKey="requests" stroke={ACCENT} name="总请求" dot={false} />
              <Line type="monotone" dataKey="settled" stroke="#10b981" name="已结算" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
          <p style={{ color: "#e2e8f0", marginBottom: 16, fontWeight: 600 }}>近 7 天收入（DMHKD）</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: CARD_BG, border: `1px solid ${BORDER}` }} />
              <Bar dataKey="revenue" fill={ACCENT} name="收入" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Service Summary Table */}
      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
        <p style={{ color: "#e2e8f0", marginBottom: 16, fontWeight: 600 }}>我的服务</p>
        {services.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 14 }}>还没有服务，去「我的服务」页面创建一个。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
                {["服务名", "路径", "网络", "价格", "请求数", "收入", "最后调用"].map(h => (
                  <th key={h} style={{ textAlign: "left", color: "#6b7280", padding: "8px 12px", fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.map(s => {
                const svcReqs = requests.filter(r => r.serviceId === s.id);
                const svcPmts = payments.filter(p => p.serviceId === s.id && p.status === "settled");
                const revenue = svcPmts.reduce((sum, p) => sum + parseFloat(p.amount), 0);
                const lastReq = svcReqs.reduce<number | null>((mx, r) => mx === null || r.createdAt > mx ? r.createdAt : mx, null);
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "10px 12px", color: "#e2e8f0" }}>{s.name}</td>
                    <td style={{ padding: "10px 12px", color: "#3b82f6", fontFamily: "monospace" }}>{s.gatewayPath}</td>
                    <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{s.network}</td>
                    <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{s.priceAmount} {s.priceCurrency}</td>
                    <td style={{ padding: "10px 12px", color: "#e2e8f0" }}>{svcReqs.length}</td>
                    <td style={{ padding: "10px 12px", color: "#10b981" }}>{revenue.toFixed(4)}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                      {lastReq ? new Date(lastReq).toLocaleString("zh-CN") : "—"}
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
