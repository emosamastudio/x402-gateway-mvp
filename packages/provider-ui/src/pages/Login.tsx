// packages/provider-ui/src/pages/Login.tsx
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNonce, verifySignature } from "../api.js";
import { useAuth } from "../auth.js";

declare global { interface Window { ethereum?: any; } }

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "connecting" | "signing" | "error">("idle");
  const [error, setError] = useState("");
  const [address, setAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("请安装 MetaMask 或兼容钱包");
      return;
    }
    setStatus("connecting");
    setError("");
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("用户取消连接");
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setStatus("signing");
    setError("");
    try {
      const message = await fetchNonce(address);
      const signature: string = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
      const result = await verifySignature(address, signature);
      login(result.token, result.provider);
      navigate(result.needsProfile ? "/register" : "/");
    } catch (e: unknown) {
      setStatus("error");
      setError((e instanceof Error ? e.message : undefined) ?? "签名失败，请重试");
    }
  }, [address, login, navigate]);

  const CARD: React.CSSProperties = {
    background: "#111827", border: "1px solid #1e2d45", borderRadius: 16,
    padding: 40, width: 400, textAlign: "center",
  };
  const BTN: React.CSSProperties = {
    background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
    padding: "12px 24px", fontSize: 15, cursor: "pointer", width: "100%", marginTop: 16,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={CARD}>
        <h1 style={{ color: "#e2e8f0", fontSize: 24, marginBottom: 8 }}>x402 Provider Portal</h1>
        <p style={{ color: "#6b7280", marginBottom: 32 }}>使用钱包登录，管理你的服务</p>

        {!address ? (
          <button style={BTN} onClick={connect} disabled={status === "connecting"}>
            {status === "connecting" ? "连接中..." : "Connect Wallet"}
          </button>
        ) : (
          <>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 8 }}>已连接钱包</p>
            <p style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: 13, marginBottom: 16, wordBreak: "break-all" }}>
              {address}
            </p>
            <button style={BTN} onClick={signIn} disabled={status === "signing"}>
              {status === "signing" ? "签名中..." : "Sign In"}
            </button>
          </>
        )}

        {error && <p style={{ color: "#ef4444", marginTop: 16, fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
