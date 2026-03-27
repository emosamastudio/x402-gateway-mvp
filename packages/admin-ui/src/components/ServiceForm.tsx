import { useState } from "react";
import { createService } from "../api.js";

const INPUT_STYLE = {
  width: "100%", padding: "8px 12px", background: "#1a2236",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0",
  fontSize: 14, marginBottom: 12,
};

export function ServiceForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "", backendUrl: "", priceAmount: "0.001",
    network: "base-sepolia", recipient: "", minReputation: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createService(form);
      onCreated();
      setForm({ name: "", backendUrl: "", priceAmount: "0.001", network: "base-sepolia", recipient: "", minReputation: 0 });
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
      <input style={INPUT_STYLE} placeholder="Price in USDC (e.g. 0.001)" value={form.priceAmount} onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} required />
      <select style={INPUT_STYLE} value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
        <option value="base-sepolia">Base Sepolia</option>
        <option value="polygon-amoy">Polygon Amoy</option>
      </select>
      <input style={INPUT_STYLE} placeholder="Recipient wallet (0x...)" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} required />
      <input style={INPUT_STYLE} type="number" placeholder="Min reputation (0 = no limit)" value={form.minReputation} onChange={(e) => setForm({ ...form, minReputation: Number(e.target.value) })} />
      <button type="submit" disabled={loading} style={{ padding: "10px 24px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
        {loading ? "Registering..." : "Register Service"}
      </button>
    </form>
  );
}
