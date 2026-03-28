import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { listAgents, lookupAgent } from "../api.js";
import type { AgentWithStats } from "../api.js";

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

function formatDate(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(ts: number): string {
  if (!ts) return "从未";
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

function CopyBtn({ text }: { text: string }) {
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
    >{copied ? "✓" : "复制"}</button>
  );
}

function MiniStat({ icon, label, value, accent }: { icon: string; label: string; value: string | number; accent: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
      background: "#0d1117", borderRadius: 8, border: `1px solid ${CARD_BORDER}`,
      minWidth: 0,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: accent }}>{value}</div>
        <div style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}

/* ────────────────────── Stats Bar ────────────────────── */

function StatsBar({ agents }: { agents: AgentWithStats[] }) {
  const total = agents.length;
  const registered = agents.filter((a) => a.isRegistered).length;
  const totalReqs = agents.reduce((s, a) => s + a.stats.totalRequests, 0);
  const totalSpent = agents.reduce((s, a) => s + parseFloat(a.stats.totalSpent || "0"), 0);

  const stats = [
    { label: "已知代理", value: total, icon: "🤖", accent: ACCENT },
    { label: "已注册", value: registered, icon: "✅", accent: SUCCESS },
    { label: "总请求数", value: totalReqs, icon: "📊", accent: "#a78bfa" },
    { label: "总消费", value: `${totalSpent.toFixed(4)}`, sub: "DMHKD", icon: "💰", accent: WARN },
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

/* ────────────────────── Agent Card ────────────────────── */

function AgentCard({ agent }: { agent: AgentWithStats }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { stats } = agent;
  const successRate = stats.totalRequests > 0
    ? ((stats.successRequests / stats.totalRequests) * 100).toFixed(0)
    : "0";

  return (
    <div
      style={{
        background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14,
        overflow: "hidden", transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#2d4a6f"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.boxShadow = "none"; }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", cursor: "pointer", gap: 12,
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          {/* Avatar */}
          <div style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            background: agent.isRegistered
              ? `linear-gradient(135deg, ${SUCCESS}40, ${ACCENT}40)`
              : `linear-gradient(135deg, ${DANGER}40, ${TEXT_MUTED}40)`,
            border: `2px solid ${agent.isRegistered ? SUCCESS : DANGER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>
            {agent.isRegistered ? "🤖" : "❌"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <code style={{ fontSize: 14, fontWeight: 700, color: TEXT_PRIMARY, fontFamily: "monospace" }}>
                {truncAddr(agent.address)}
              </code>
              <Badge
                text={agent.isRegistered ? "已注册" : "未注册"}
                color={agent.isRegistered ? SUCCESS : DANGER}
                bg={agent.isRegistered ? "#064e3b" : "#3b1111"}
              />
              {agent.reputation > 0 && (
                <Badge text={`信誉 ${agent.reputation}`} color="#a78bfa" bg="#2e1065" />
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3 }}>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>
                {stats.totalRequests} 次请求
              </span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
              <span style={{ fontSize: 11, color: TEXT_MUTED }}>
                {stats.settledPayments} 次支付
              </span>
              {parseFloat(stats.totalSpent) > 0 && (
                <>
                  <span style={{ fontSize: 11, color: TEXT_MUTED }}>·</span>
                  <span style={{ fontSize: 11, color: WARN }}>
                    {stats.totalSpent} DMHKD
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: TEXT_MUTED, whiteSpace: "nowrap" }}>
            {relativeTime(stats.lastSeen)}
          </span>
          <span style={{
            fontSize: 16, color: TEXT_MUTED, transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "none",
          }}>▾</span>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${CARD_BORDER}`, background: "#0c1018" }}>
          {/* Address & identity */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 0.8,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 3, height: 12, borderRadius: 2, background: "#60a5fa", display: "inline-block" }} />
              身份信息
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  钱包地址
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code style={{ fontSize: 13, color: TEXT_SECONDARY, fontFamily: "monospace", wordBreak: "break-all" }}>
                    {agent.address}
                  </code>
                  <CopyBtn text={agent.address} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>注册状态</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: agent.isRegistered ? SUCCESS : DANGER }}>
                  {agent.isRegistered ? "已注册 (ERC-8004)" : "未注册"}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>信誉分数</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#a78bfa" }}>{agent.reputation}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>缓存时间</div>
                <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{formatDate(agent.cachedAt)}</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>最后出现</div>
                <span style={{ fontSize: 13, color: TEXT_SECONDARY }}>{relativeTime(stats.lastSeen)}</span>
              </div>
            </div>
          </div>

          {/* Activity stats */}
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 0.8,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 3, height: 12, borderRadius: 2, background: "#60a5fa", display: "inline-block" }} />
              活动统计
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
              <MiniStat icon="📊" label="总请求" value={stats.totalRequests} accent={ACCENT} />
              <MiniStat icon="✅" label="成功" value={`${stats.successRequests} (${successRate}%)`} accent={SUCCESS} />
              <MiniStat icon="💳" label="结算" value={`${stats.settledPayments}/${stats.totalPayments}`} accent="#a78bfa" />
              <MiniStat icon="💰" label="总消费" value={`${stats.totalSpent}`} accent={WARN} />
            </div>

            {/* Progress bar for success rate */}
            {stats.totalRequests > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: TEXT_MUTED }}>请求成功率</span>
                  <span style={{ fontSize: 11, color: SUCCESS, fontWeight: 700 }}>{successRate}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3,
                    width: `${successRate}%`,
                    background: `linear-gradient(90deg, ${SUCCESS}, ${ACCENT})`,
                    transition: "width 0.6s ease",
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${CARD_BORDER}`, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/requests?search=${agent.address}`); }}
              style={{
                ...btnBase, padding: "6px 14px", fontSize: 12,
                background: "transparent", border: `1px solid ${CARD_BORDER}`, color: "#60a5fa",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = ACCENT + "10"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.background = "transparent"; }}
            >📡 查看请求</button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/payments?search=${agent.address}`); }}
              style={{
                ...btnBase, padding: "6px 14px", fontSize: 12,
                background: "transparent", border: `1px solid ${CARD_BORDER}`, color: "#a78bfa",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#a78bfa"; e.currentTarget.style.background = "#a78bfa10"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.background = "transparent"; }}
            >💳 查看支付</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────── Identity Lookup ────────────────────── */

function LookupPanel({ onFound }: { onFound: () => void }) {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("optimism-sepolia");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await lookupAgent(address, network);
      setResult(data);
      onFound(); // Refresh agent list since the lookup may add a new cache entry
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 14,
      padding: 20, marginBottom: 24,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 14,
        textTransform: "uppercase", letterSpacing: 0.8,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 3, height: 12, borderRadius: 2, background: "#60a5fa", display: "inline-block" }} />
        链上身份查询
      </div>
      <form onSubmit={lookup} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            style={inputStyle}
            placeholder="Agent 钱包地址 (0x...)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
          />
        </div>
        <div style={{ width: 180 }}>
          <select
            style={{ ...inputStyle, cursor: "pointer" }}
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
          >
            <option value="optimism-sepolia">Optimism Sepolia</option>
            <option value="sepolia">Ethereum Sepolia</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            ...btnBase, padding: "10px 20px",
            background: loading ? TEXT_MUTED : ACCENT,
            color: "#fff",
          }}
        >
          {loading ? "⏳ 查询中..." : "🔍 查询"}
        </button>
      </form>

      {error && (
        <div style={{
          marginTop: 12, padding: "10px 14px", background: "#3b1111",
          border: "1px solid #7f1d1d", borderRadius: 8, fontSize: 13, color: "#fca5a5",
        }}>{error}</div>
      )}

      {result && (
        <div style={{
          marginTop: 14, padding: 16, background: "#0d1117",
          border: `1px solid ${CARD_BORDER}`, borderRadius: 10,
          display: "flex", alignItems: "center", gap: 24,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: result.isRegistered
              ? `linear-gradient(135deg, ${SUCCESS}40, ${ACCENT}40)`
              : `linear-gradient(135deg, ${DANGER}40, ${TEXT_MUTED}40)`,
            border: `2px solid ${result.isRegistered ? SUCCESS : DANGER}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            {result.isRegistered ? "🤖" : "❌"}
          </div>
          <div style={{ flex: 1 }}>
            <code style={{ fontSize: 13, color: TEXT_PRIMARY, fontFamily: "monospace" }}>
              {result.address}
            </code>
            <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: "uppercase", marginBottom: 2 }}>注册状态</div>
                <span style={{ fontSize: 16, fontWeight: 800, color: result.isRegistered ? SUCCESS : DANGER }}>
                  {result.isRegistered ? "已注册" : "未注册"}
                </span>
              </div>
              <div>
                <div style={{ fontSize: 10, color: TEXT_MUTED, textTransform: "uppercase", marginBottom: 2 }}>信誉分数</div>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa" }}>{result.reputation}</span>
              </div>
            </div>
          </div>
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
      padding: "60px 24px", background: CARD_BG, border: `2px dashed ${CARD_BORDER}`,
      borderRadius: 16, textAlign: "center",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>🤖</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, marginBottom: 8 }}>暂无代理记录</div>
      <div style={{ fontSize: 14, color: TEXT_MUTED, maxWidth: 360, lineHeight: 1.6 }}>
        使用上方查询工具查找代理身份，或等待代理通过网关发送请求后自动出现
      </div>
    </div>
  );
}

/* ────────────────────── Main Component ────────────────────── */

export function Agents() {
  const [agents, setAgents] = useState<AgentWithStats[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showLookup, setShowLookup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAgents();
      setAgents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return agents;
    const q = search.toLowerCase();
    return agents.filter((a) =>
      a.address.toLowerCase().includes(q) ||
      (a.isRegistered ? "已注册 registered" : "未注册 unregistered").toLowerCase().includes(q)
    );
  }, [agents, search]);

  // Sort: registered first, then by totalRequests desc
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.isRegistered !== b.isRegistered) return a.isRegistered ? -1 : 1;
      return b.stats.totalRequests - a.stats.totalRequests;
    });
  }, [filtered]);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: TEXT_PRIMARY }}>代理管理</h1>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: "6px 0 0 0" }}>查看所有与网关交互过的代理及其活动统计</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowLookup((v) => !v)}
            style={{
              ...btnBase, fontSize: 13,
              background: showLookup ? ACCENT + "20" : "transparent",
              border: `1px solid ${showLookup ? ACCENT : CARD_BORDER}`,
              color: showLookup ? ACCENT : TEXT_SECONDARY,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.color = ACCENT; }}
            onMouseLeave={(e) => { if (!showLookup) { e.currentTarget.style.borderColor = CARD_BORDER; e.currentTarget.style.color = TEXT_SECONDARY; } }}
          >🔍 链上查询</button>
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
      </div>

      {/* Lookup panel (toggleable) */}
      {showLookup && <LookupPanel onFound={load} />}

      {/* Stats */}
      {agents.length > 0 && <StatsBar agents={agents} />}

      {/* Search */}
      {agents.length > 0 && (
        <div style={{ position: "relative", marginBottom: 20 }}>
          <span style={{
            position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: TEXT_MUTED, pointerEvents: "none",
          }}>🔍</span>
          <input
            type="text"
            placeholder="搜索代理地址..."
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
      ) : agents.length === 0 ? (
        <EmptyState />
      ) : sorted.length === 0 ? (
        <div style={{
          padding: "40px 24px", textAlign: "center", color: TEXT_MUTED, fontSize: 14,
          background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12,
        }}>
          没有找到匹配的代理
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((a) => (
            <AgentCard key={a.address} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}
