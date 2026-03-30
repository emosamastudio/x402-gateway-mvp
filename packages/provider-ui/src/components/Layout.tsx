// packages/provider-ui/src/components/Layout.tsx
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.js";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: ">" },
  { to: "/services", label: "我的服务", icon: "~" },
  { to: "/requests", label: "请求记录", icon: "=" },
  { to: "/payments", label: "收款记录", icon: "$" },
  { to: "/account", label: "账号设置", icon: "@" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { provider, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  const SIDEBAR: React.CSSProperties = {
    width: 220, background: "#0d1117", borderRight: "1px solid #1e2d45",
    display: "flex", flexDirection: "column", minHeight: "100vh", flexShrink: 0,
  };
  const HEADER: React.CSSProperties = {
    padding: "24px 16px 16px", borderBottom: "1px solid #1e2d45",
  };
  const NAV_LINK_STYLE: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
    color: "#9ca3af", textDecoration: "none", fontSize: 14, borderRadius: 8,
    margin: "2px 8px",
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={SIDEBAR}>
        <div style={HEADER}>
          <p style={{ color: "#3b82f6", fontWeight: 700, fontSize: 16 }}>x402 Provider</p>
          <p style={{ color: "#6b7280", fontSize: 12, marginTop: 4, wordBreak: "break-all", fontFamily: "monospace" }}>
            {provider?.name || (provider?.walletAddress ? provider.walletAddress.slice(0, 16) + "..." : "")}
          </p>
        </div>
        <nav style={{ flex: 1, padding: "12px 0" }}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                ...NAV_LINK_STYLE,
                background: isActive ? "#1e2d45" : "transparent",
                color: isActive ? "#e2e8f0" : "#9ca3af",
              })}
            >
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: "1px solid #1e2d45" }}>
          <button
            onClick={handleLogout}
            style={{
              width: "100%", padding: "8px 12px", background: "transparent",
              border: "1px solid #1e2d45", borderRadius: 8, color: "#9ca3af",
              cursor: "pointer", fontSize: 13,
            }}
          >
            断开连接
          </button>
        </div>
      </div>
      <main style={{ flex: 1, background: "#0d1117", padding: 32, overflow: "auto" }}>
        {children}
      </main>
    </div>
  );
}
