import { Link, useLocation } from "react-router-dom";

interface NavItem { path: string; label: string; icon: string }
interface NavGroup { title: string; icon: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: "业务核心",
    icon: "🎯",
    items: [
      { path: "/providers", label: "服务商", icon: "🏢" },
      { path: "/", label: "服务管理", icon: "📡" },
    ],
  },
  {
    title: "链 & RPC",
    icon: "⛓",
    items: [
      { path: "/chains", label: "链管理", icon: "🔗" },
      { path: "/stats", label: "RPC 统计", icon: "📊" },
    ],
  },
  {
    title: "合约 & 身份",
    icon: "📜",
    items: [
      { path: "/tokens", label: "代币配置", icon: "🪙" },
      { path: "/agents", label: "Agent", icon: "🤖" },
    ],
  },
  {
    title: "监控",
    icon: "📋",
    items: [
      { path: "/requests", label: "请求记录", icon: "📨" },
      { path: "/payments", label: "支付记录", icon: "💳" },
    ],
  },
  {
    title: "工具",
    icon: "🔧",
    items: [
      { path: "/test", label: "支付测试", icon: "🧪" },
    ],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav style={{
        width: 210, background: "#111827", padding: "20px 12px",
        borderRight: "1px solid #1e2d45", display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{
          fontSize: 15, fontWeight: 800, color: "#60a5fa", marginBottom: 28,
          padding: "0 8px", letterSpacing: "0.02em",
        }}>
          ⚡ x402 Gateway MVP
        </div>

        {/* Groups */}
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.title} style={{ marginBottom: gi < NAV_GROUPS.length - 1 ? 18 : 0 }}>
            {/* Group header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 8px", marginBottom: 6,
            }}>
              <span style={{ fontSize: 12 }}>{group.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#475569",
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {group.title}
              </span>
            </div>

            {/* Items */}
            {group.items.map((item) => {
              const active = loc.pathname === item.path;
              return (
                <Link key={item.path} to={item.path} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 8, marginBottom: 2,
                  color: active ? "#93c5fd" : "#94a3b8",
                  background: active ? "rgba(59,130,246,0.12)" : "transparent",
                  textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
                  transition: "background 0.15s, color 0.15s",
                }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Bottom spacer */}
        <div style={{ flex: 1 }} />
        <div style={{ padding: "8px 10px", fontSize: 10, color: "#334155" }}>v0.1.0</div>
      </nav>
      <main style={{ flex: 1, padding: 32, minWidth: 0, overflowX: "auto" }}>{children}</main>
    </div>
  );
}
