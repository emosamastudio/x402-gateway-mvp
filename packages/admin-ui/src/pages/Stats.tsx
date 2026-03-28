import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, LineChart, Line, ComposedChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart,
} from "recharts";
import {
  listChains, listRpcEndpoints, listRpcStatsHistory, listRpcChainSummary,
} from "../api";
import type { RpcStatsSnapshot, RpcChainSummary } from "../api";
import type { ChainConfig, RpcEndpoint } from "@x402-gateway-mvp/shared";

const PALETTE = ["#6366f1","#22d3ee","#a3e635","#f59e0b","#f43f5e","#8b5cf6","#10b981","#fb923c"];
const HEALTH_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
  unknown: "#6b7280",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "20px 24px",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#888",
  marginBottom: 14,
};

const TOOLTIP_STYLE = {
  background: "#1e1e2e",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e4e4e4",
};

function formatShortTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}`;
}

/** Build delta-based time-series rows for recharts */
function buildTimeSeries(snapshots: RpcStatsSnapshot[], endpoints: RpcEndpoint[]) {
  const epMap = new Map<string, { label: string; color: string }>();
  endpoints.forEach((ep, i) => {
    epMap.set(ep.id, {
      label: ep.label || ep.url.replace(/^https?:\/\//, "").slice(0, 28),
      color: PALETTE[i % PALETTE.length],
    });
  });

  const byEp = new Map<string, RpcStatsSnapshot[]>();
  for (const snap of snapshots) {
    if (!byEp.has(snap.endpointId)) byEp.set(snap.endpointId, []);
    byEp.get(snap.endpointId)!.push(snap);
  }
  for (const list of byEp.values()) list.sort((a, b) => a.timestamp - b.timestamp);

  const allTimes = [...new Set(snapshots.map(s => s.timestamp))].sort((a, b) => a - b);

  const prevReq = new Map<string, number>();
  const prevErr = new Map<string, number>();

  const rows = allTimes.map((ts) => {
    const row: Record<string, any> = { timestamp: ts, label: formatShortTime(ts) };
    for (const [epId] of epMap) {
      const snapAtTime = (byEp.get(epId) || []).find(s => s.timestamp === ts);
      if (snapAtTime) {
        const prev = prevReq.get(epId);
        const prevE = prevErr.get(epId);
        const deltaReq = prev !== undefined ? Math.max(0, snapAtTime.totalRequests - prev) : 0;
        const deltaErr = prevE !== undefined ? Math.max(0, snapAtTime.totalErrors - prevE) : 0;
        row[`req_${epId}`] = deltaReq;
        row[`rate_${epId}`] = deltaReq > 0 ? Math.round((1 - deltaErr / deltaReq) * 100) : null;
        row[`latency_${epId}`] = snapAtTime.latency >= 0 ? snapAtTime.latency : null;
        prevReq.set(epId, snapAtTime.totalRequests);
        prevErr.set(epId, snapAtTime.totalErrors);
      }
    }
    return row;
  });

  return { rows, epMap };
}

export default function Stats() {
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [selectedChain, setSelectedChain] = useState<string>("");
  const [hours, setHours] = useState<number>(1);
  const [endpoints, setEndpoints] = useState<RpcEndpoint[]>([]);
  const [snapshots, setSnapshots] = useState<RpcStatsSnapshot[]>([]);
  const [chainSummaries, setChainSummaries] = useState<RpcChainSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listChains().then(cs => {
      setChains(cs);
      if (cs.length > 0) setSelectedChain(cs[0].id);
    });
    listRpcChainSummary().then(setChainSummaries).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!selectedChain) return;
    setLoading(true);
    try {
      const [eps, snaps, summaries] = await Promise.all([
        listRpcEndpoints(selectedChain),
        listRpcStatsHistory(selectedChain, hours),
        listRpcChainSummary(),
      ]);
      setEndpoints(eps);
      setSnapshots(snaps);
      setChainSummaries(summaries);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [selectedChain, hours]);

  useEffect(() => { loadData(); }, [loadData]);

  const { rows, epMap } = useMemo(() => buildTimeSeries(snapshots, endpoints), [snapshots, endpoints]);
  const epEntries = useMemo(() => [...epMap.entries()], [epMap]);

  const currentSummary = chainSummaries.find(s => s.chainSlug === selectedChain);

  const comparisonData = endpoints.map((ep, i) => ({
    label: ep.label || `EP${i + 1}`,
    requests: ep.totalRequests,
    errorRate: ep.totalRequests > 0 ? Number(((ep.totalErrors / ep.totalRequests) * 100).toFixed(1)) : 0,
  }));

  const pieData = currentSummary ? [
    { name: "健康", value: currentSummary.healthyCount, color: HEALTH_COLORS.healthy },
    { name: "降级", value: currentSummary.degradedCount, color: HEALTH_COLORS.degraded },
    { name: "故障", value: currentSummary.downCount, color: HEALTH_COLORS.down },
    {
      name: "未知",
      value: Math.max(0, currentSummary.endpointCount - currentSummary.healthyCount - currentSummary.degradedCount - currentSummary.downCount),
      color: HEALTH_COLORS.unknown,
    },
  ].filter(d => d.value > 0) : [];

  const CHART_H = 200;

  return (
    <div style={{ color: "#e4e4e4" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>RPC 统计</h1>
          <Link to="/chains" style={{
            fontSize: 12, color: "#818cf8", textDecoration: "none",
            border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6,
            padding: "4px 10px", display: "inline-flex", alignItems: "center", gap: 4,
          }}>🔗 链管理</Link>
        </div>
        <button
          onClick={loadData}
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8, padding: "6px 16px",
            color: "#e4e4e4", cursor: "pointer", fontSize: 13,
          }}
        >
          刷新
        </button>
      </div>

      {/* Chain tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {chains.map(c => (
          <button
            key={c.id}
            onClick={() => setSelectedChain(c.id)}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer",
              background: selectedChain === c.id ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)",
              border: selectedChain === c.id ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.1)",
              color: selectedChain === c.id ? "#818cf8" : "#aaa",
              fontWeight: selectedChain === c.id ? 600 : 400,
            }}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Time range selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
        <span style={{ fontSize: 12, color: "#666", marginRight: 4 }}>时间范围:</span>
        {[1, 6, 24].map(h => (
          <button
            key={h}
            onClick={() => setHours(h)}
            style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              background: hours === h ? "rgba(99,102,241,0.2)" : "transparent",
              border: hours === h ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.1)",
              color: hours === h ? "#818cf8" : "#888",
            }}
          >
            {h}h
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {currentSummary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 28 }}>
          {[
            { label: "端点数", value: currentSummary.endpointCount, color: "#6366f1" },
            { label: "健康端点", value: currentSummary.healthyCount, color: "#22c55e" },
            { label: "总请求", value: currentSummary.totalRequests.toLocaleString(), color: "#22d3ee" },
            { label: "总错误", value: currentSummary.totalErrors.toLocaleString(), color: "#f43f5e" },
            {
              label: "错误率",
              value: currentSummary.totalRequests > 0
                ? `${((currentSummary.totalErrors / currentSummary.totalRequests) * 100).toFixed(1)}%`
                : "—",
              color: "#f59e0b",
            },
            { label: "平均延迟", value: currentSummary.avgLatency >= 0 ? `${currentSummary.avgLatency}ms` : "—", color: "#a3e635" },
          ].map(card => (
            <div key={card.label} style={{ ...cardStyle, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", color: "#888", padding: "48px 0", fontSize: 14 }}>
          加载中...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 0", color: "#555" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 14, marginBottom: 6, color: "#888" }}>暂无历史数据</div>
          <div style={{ fontSize: 12 }}>数据每 30 秒采集一次，运行一段时间后图表将自动填充</div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Row 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* 1. Volume area chart */}
            <div style={cardStyle}>
              <div style={sectionTitle}>请求量趋势</div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <AreaChart data={rows} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <defs>
                    {epEntries.map(([epId, info]) => (
                      <linearGradient key={epId} id={`grad_${epId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="10%" stopColor={info.color} stopOpacity={0.35}/>
                        <stop offset="95%" stopColor={info.color} stopOpacity={0.03}/>
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} interval="preserveStartEnd"/>
                  <YAxis tick={{ fontSize: 10, fill: "#555" }}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE}/>
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                  {epEntries.map(([epId, info]) => (
                    <Area
                      key={epId}
                      type="monotone"
                      dataKey={`req_${epId}`}
                      name={info.label}
                      stroke={info.color}
                      fill={`url(#grad_${epId})`}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 2. Success rate line chart */}
            <div style={cardStyle}>
              <div style={sectionTitle}>成功率趋势 (%)</div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart data={rows} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} interval="preserveStartEnd"/>
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#555" }}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => v !== null && v !== undefined ? `${v}%` : "—"}/>
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                  {epEntries.map(([epId, info]) => (
                    <Line
                      key={epId}
                      type="monotone"
                      dataKey={`rate_${epId}`}
                      name={info.label}
                      stroke={info.color}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* 3. Latency line chart */}
            <div style={cardStyle}>
              <div style={sectionTitle}>延迟趋势 (ms)</div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <LineChart data={rows} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }} interval="preserveStartEnd"/>
                  <YAxis tick={{ fontSize: 10, fill: "#555" }}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => v !== null && v !== undefined ? `${v}ms` : "—"}/>
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                  {epEntries.map(([epId, info]) => (
                    <Line
                      key={epId}
                      type="monotone"
                      dataKey={`latency_${epId}`}
                      name={info.label}
                      stroke={info.color}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 4. Endpoint comparison bar+line */}
            <div style={cardStyle}>
              <div style={sectionTitle}>端点对比 (请求量 / 错误率)</div>
              <ResponsiveContainer width="100%" height={CHART_H}>
                <ComposedChart data={comparisonData} margin={{ top: 4, right: 40, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#555" }}/>
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#555" }}/>
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: "#555" }} width={32}/>
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, name: string) => name === "错误率%" ? `${v}%` : v.toLocaleString()}/>
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }}/>
                  <Bar yAxisId="left" dataKey="requests" name="请求总量" fill="#6366f1" opacity={0.75} radius={[4, 4, 0, 0]}/>
                  <Line yAxisId="right" type="monotone" dataKey="errorRate" name="错误率%" stroke="#f43f5e" strokeWidth={2} dot={{ r: 4, fill: "#f43f5e" }}/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 3 */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>

            {/* 5. Health pie */}
            <div style={cardStyle}>
              <div style={sectionTitle}>健康状态分布</div>
              {pieData.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={4} dataKey="value">
                        {pieData.map((entry) => <Cell key={entry.name} fill={entry.color}/>)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                    {pieData.map(d => (
                      <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
                        <span style={{ color: "#aaa", flex: 1 }}>{d.name}</span>
                        <span style={{ fontWeight: 700, color: d.color }}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ color: "#555", fontSize: 13 }}>暂无数据</div>
              )}
            </div>

            {/* Endpoint status table */}
            <div style={cardStyle}>
              <div style={sectionTitle}>端点状态明细</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["标签", "URL", "状态", "延迟", "总请求", "总错误", "错误率"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#555", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.map(ep => {
                      const errRate = ep.totalRequests > 0
                        ? `${((ep.totalErrors / ep.totalRequests) * 100).toFixed(1)}%`
                        : "—";
                      const isHighErr = ep.totalRequests > 0 && ep.totalErrors / ep.totalRequests > 0.1;
                      return (
                        <tr key={ep.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "8px 10px", color: "#d4d4d8" }}>{ep.label || "—"}</td>
                          <td style={{ padding: "8px 10px", color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ep.url}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ color: HEALTH_COLORS[ep.healthStatus] ?? "#888", fontWeight: 600 }}>
                              {ep.healthStatus}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px", color: "#aaa" }}>
                            {ep.lastLatency >= 0 ? `${ep.lastLatency}ms` : "—"}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#aaa" }}>{ep.totalRequests.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", color: "#aaa" }}>{ep.totalErrors.toLocaleString()}</td>
                          <td style={{ padding: "8px 10px", color: isHighErr ? "#ef4444" : "#aaa" }}>{errRate}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
