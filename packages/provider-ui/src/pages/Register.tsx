// packages/provider-ui/src/pages/Register.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { updateMe } from "../api.js";
import { useAuth } from "../auth.js";
import { getStoredToken } from "../auth.js";

export function Register() {
  const { provider, updateProvider } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getStoredToken()) navigate("/login");
  }, [navigate]);

  const CARD: React.CSSProperties = {
    background: "#111827", border: "1px solid #1e2d45", borderRadius: 16,
    padding: 40, width: 480,
  };
  const INPUT: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#0d1117",
    border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14,
    outline: "none", marginTop: 6,
  };
  const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 13, display: "block", marginTop: 16 };

  const handleSubmit = async () => {
    if (!name.trim()) { setError("名称为必填项"); return; }
    setSaving(true);
    setError("");
    try {
      const updated = await updateMe({ name: name.trim(), description, website });
      updateProvider(updated);
      navigate("/");
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : undefined) ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={CARD}>
        <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 4 }}>完善 Provider 资料</h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
          钱包地址: <span style={{ fontFamily: "monospace", color: "#3b82f6" }}>{provider?.walletAddress}</span>
        </p>

        <label style={LABEL}>名称 *</label>
        <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="My API Service" />

        <label style={LABEL}>简介</label>
        <textarea
          style={{ ...INPUT, height: 80, resize: "vertical" }}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="提供优质 API 服务..."
        />

        <label style={LABEL}>网站</label>
        <input style={INPUT} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" />

        {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
            padding: "12px 24px", fontSize: 15, cursor: saving ? "not-allowed" : "pointer",
            width: "100%", marginTop: 24, opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "保存中..." : "完成注册"}
        </button>
      </div>
    </div>
  );
}
