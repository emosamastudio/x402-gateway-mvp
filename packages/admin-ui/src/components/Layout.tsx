import { Link, useLocation } from "react-router-dom";

const NAV = [
  { path: "/", label: "Services" },
  { path: "/payments", label: "Payments" },
  { path: "/agents", label: "Agents" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav style={{ width: 200, background: "#111827", padding: "24px 16px", borderRight: "1px solid #1e2d45" }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#60a5fa", marginBottom: 32 }}>
          x402 Gateway
        </div>
        {NAV.map((n) => (
          <Link key={n.path} to={n.path} style={{
            display: "block", padding: "10px 12px", borderRadius: 8, marginBottom: 4,
            color: loc.pathname === n.path ? "#60a5fa" : "#94a3b8",
            background: loc.pathname === n.path ? "#1e3a5f" : "transparent",
            textDecoration: "none", fontSize: 14, fontWeight: 500,
          }}>
            {n.label}
          </Link>
        ))}
      </nav>
      <main style={{ flex: 1, padding: 32 }}>{children}</main>
    </div>
  );
}
