import { useState, useEffect } from "react";
import { listServices } from "../api.js";
import { ServiceForm } from "../components/ServiceForm.js";
import type { Service } from "@x402-gateway/shared";

export function Services() {
  const [services, setServices] = useState<Service[]>([]);

  const load = () => listServices().then(setServices);
  useEffect(() => { load(); }, []);

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Services</h1>
      <ServiceForm onCreated={load} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {services.map((s) => (
          <div key={s.id} style={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
              <span style={{ fontSize: 12, color: "#60a5fa", background: "#1e3a5f", padding: "2px 10px", borderRadius: 6 }}>{s.network}</span>
            </div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>{s.backendUrl}</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{s.priceAmount} DMHKD / request · min reputation: {s.minReputation}</div>
          </div>
        ))}
        {services.length === 0 && <div style={{ color: "#475569", fontSize: 14 }}>No services registered yet.</div>}
      </div>
    </div>
  );
}
