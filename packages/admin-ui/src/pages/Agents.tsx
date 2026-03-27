import { useState } from "react";
import { lookupAgent } from "../api.js";

export function Agents() {
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Agent Identity Lookup</h1>
      <form onSubmit={lookup} style={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <input
          style={{ width: "100%", padding: "8px 12px", background: "#1a2236", border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, marginBottom: 12 }}
          placeholder="Agent wallet address (0x...)" value={address}
          onChange={(e) => setAddress(e.target.value)} required
        />
        <select style={{ width: "100%", padding: "8px 12px", background: "#1a2236", border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0", fontSize: 14, marginBottom: 12 }} value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="optimism-sepolia">Optimism Sepolia</option>
          <option value="sepolia">Ethereum Sepolia</option>
        </select>
        <button type="submit" disabled={loading} style={{ padding: "10px 24px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
          {loading ? "Looking up..." : "Lookup"}
        </button>
      </form>
      {error && <div style={{ color: "#f87171", marginBottom: 12 }}>{error}</div>}
      {result && (
        <div style={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", marginBottom: 4 }}>Registered</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: result.isRegistered ? "#34d399" : "#f87171" }}>
                {result.isRegistered ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#475569", textTransform: "uppercase", marginBottom: 4 }}>Reputation</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#60a5fa" }}>{result.reputation}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 12 }}>{result.address}</div>
        </div>
      )}
    </div>
  );
}
