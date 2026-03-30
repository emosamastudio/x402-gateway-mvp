// packages/provider-ui/src/pages/Account.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateMe } from "../api.js";
import { useAuth } from "../auth.js";

export function Account() {
  const { provider, updateProvider, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(provider?.name ?? "");
  const [description, setDescription] = useState(provider?.description ?? "");
  const [website, setWebsite] = useState(provider?.website ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const CARD_BG = "#111827"; const BORDER = "#1e2d45";
  const INPUT: React.CSSProperties = {
    width: "100%", padding: "10px 12px", background: "#0d1117",
    border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, outline: "none",
  };
  const LABEL: React.CSSProperties = { color: "#9ca3af", fontSize: 12, display: "block", marginBottom: 6, marginTop: 16 };

  const handleSave = async () => {
    if (!name.trim()) { setError("名称不能为空"); return; }
    setSaving(true); setError(""); setSaved(false);
    try {
      const updated = await updateMe({ name: name.trim(), description, website });
      updateProvider(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setError((e instanceof Error ? e.message : undefined) ?? "保存失败"); } finally { setSaving(false); }
  };

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div style={{ maxWidth: 520 }}>
      <h1 style={{ color: "#e2e8f0", fontSize: 22, marginBottom: 24 }}>账号设置</h1>

      <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 28 }}>
        <p style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>钱包地址（不可修改）</p>
        <p style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>
          {provider?.walletAddress}
        </p>

        <label style={LABEL}>名称 *</label>
        <input style={INPUT} value={name} onChange={e => setName(e.target.value)} />

        <label style={LABEL}>简介</label>
        <textarea
          style={{ ...INPUT, height: 80, resize: "vertical" }}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />

        <label style={LABEL}>网站</label>
        <input style={INPUT} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://" />

        {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>}
        {saved && <p style={{ color: "#10b981", fontSize: 13, marginTop: 12 }}>已保存</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", marginTop: 20, fontSize: 14 }}
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      <div style={{ background: CARD_BG, border: "1px solid #7f1d1d", borderRadius: 12, padding: 24, marginTop: 24 }}>
        <p style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: 8 }}>退出登录</p>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>清除本地 token，返回登录页。</p>
        <button
          onClick={handleLogout}
          style={{ background: "transparent", color: "#ef4444", border: "1px solid #ef4444", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 13 }}
        >
          断开连接
        </button>
      </div>
    </div>
  );
}
