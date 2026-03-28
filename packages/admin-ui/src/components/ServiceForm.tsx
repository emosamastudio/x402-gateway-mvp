import { useState, useEffect } from "react";
import { createService, listChains, listTokens } from "../api.js";
import type { ChainConfig, TokenConfig } from "@x402-gateway-mvp/shared";

const INPUT_STYLE = {
  width: "100%", padding: "8px 12px", background: "#1a2236",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0",
  fontSize: 14, marginBottom: 12,
};

export function ServiceForm({ onCreated }: { onCreated: () => void }) {
  const [chains, setChains] = useState<ChainConfig[]>([]);
  const [tokens, setTokens] = useState<TokenConfig[]>([]);
  const [form, setForm] = useState({
    name: "", backendUrl: "", priceAmount: "0.001",
    network: "", tokenId: "", recipient: "", minReputation: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([listChains(), listTokens()]).then(([c, t]) => {
      setChains(c);
      setTokens(t.filter((tk) => tk.isActive));
      // Auto-select first chain if available
      if (c.length > 0) {
        const firstChain = c[0].id;
        const firstToken = t.filter((tk) => tk.isActive && tk.chainSlug === firstChain)[0];
        setForm((f) => ({ ...f, network: firstChain, tokenId: firstToken?.id || "" }));
      }
    });
  }, []);

  const filteredTokens = tokens.filter((t) => t.chainSlug === form.network);

  const handleNetworkChange = (network: string) => {
    const firstToken = tokens.filter((t) => t.chainSlug === network)[0];
    setForm({ ...form, network, tokenId: firstToken?.id || "" });
  };

  const selectedToken = tokens.find((t) => t.id === form.tokenId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.tokenId) { setError("请选择支付代币"); return; }
    setLoading(true);
    try {
      await createService(form);
      onCreated();
      const firstChain = chains[0]?.id || "";
      const firstToken = tokens.filter((t) => t.chainSlug === firstChain)[0];
      setForm({ name: "", backendUrl: "", priceAmount: "0.001", network: firstChain, tokenId: firstToken?.id || "", recipient: "", minReputation: 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 12, padding: 24, marginBottom: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Register New Service</div>
      {error && <div style={{ color: "#f87171", marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <input style={INPUT_STYLE} placeholder="Service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <input style={INPUT_STYLE} placeholder="Backend URL (e.g. http://localhost:3001)" value={form.backendUrl} onChange={(e) => setForm({ ...form, backendUrl: e.target.value })} required />
      <input style={INPUT_STYLE} placeholder={`Price in ${selectedToken?.symbol || "token"} (e.g. 0.001)`} value={form.priceAmount} onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} required />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, display: "block", marginBottom: 4 }}>链</label>
          <select style={{ ...INPUT_STYLE, marginBottom: 0 }} value={form.network} onChange={(e) => handleNetworkChange(e.target.value)} required>
            <option value="">选择链...</option>
            {chains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#475569", fontWeight: 600, display: "block", marginBottom: 4 }}>支付代币</label>
          <select style={{ ...INPUT_STYLE, marginBottom: 0 }} value={form.tokenId} onChange={(e) => setForm({ ...form, tokenId: e.target.value })} required disabled={!form.network}>
            <option value="">选择代币...</option>
            {filteredTokens.map((t) => <option key={t.id} value={t.id}>{t.symbol} — {t.name || t.id}</option>)}
          </select>
        </div>
      </div>
      <input style={INPUT_STYLE} placeholder="Recipient wallet (0x...)" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} required />
      <input style={INPUT_STYLE} type="number" placeholder="Min reputation (0 = no limit)" value={form.minReputation} onChange={(e) => setForm({ ...form, minReputation: Number(e.target.value) })} />
      <button type="submit" disabled={loading} style={{ padding: "10px 24px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        {loading ? "Registering..." : "Register Service"}
      </button>
    </form>
  );
}
