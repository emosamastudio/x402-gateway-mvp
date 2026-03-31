// packages/provider-ui/src/pages/Login.tsx
import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNonce, verifySignature } from "../api.js";
import { useAuth } from "../auth.js";

// EIP-6963: Multi-wallet discovery standard
interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string; // data URI
  rdns: string; // e.g. "io.metamask"
}
interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

declare global { interface Window { ethereum?: any; } }

function useWalletProviders() {
  const [wallets, setWallets] = useState<EIP6963ProviderDetail[]>([]);

  useEffect(() => {
    const found: EIP6963ProviderDetail[] = [];

    const onAnnounce = (e: Event) => {
      const detail = (e as CustomEvent).detail as EIP6963ProviderDetail;
      // Deduplicate by uuid
      if (!found.some(w => w.info.uuid === detail.info.uuid)) {
        found.push(detail);
        setWallets([...found]);
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    // Request all installed wallets to announce themselves
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  // Fallback: if no EIP-6963 wallets but window.ethereum exists, expose it
  const fallback = wallets.length === 0 && window.ethereum ? [{
    info: { uuid: "legacy", name: "Browser Wallet", icon: "", rdns: "legacy" },
    provider: window.ethereum,
  }] : wallets;

  return fallback;
}

const CARD: React.CSSProperties = {
  background: "#111827", border: "1px solid #1e2d45", borderRadius: 16,
  padding: 40, width: 400, textAlign: "center",
};
const BTN: React.CSSProperties = {
  background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
  padding: "12px 24px", fontSize: 15, cursor: "pointer", width: "100%", marginTop: 16,
};

function WalletPicker({
  wallets, onSelect, onClose,
}: {
  wallets: EIP6963ProviderDetail[];
  onSelect: (w: EIP6963ProviderDetail) => void;
  onClose: () => void;
}) {
  const OVERLAY: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  };
  const MODAL: React.CSSProperties = {
    background: "#111827", border: "1px solid #1e2d45", borderRadius: 16,
    padding: 32, width: 340, maxHeight: "80vh", overflowY: "auto",
  };
  const WALLET_BTN: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 16,
    background: "#0d1117", border: "1px solid #1e2d45", borderRadius: 10,
    padding: "14px 16px", cursor: "pointer", width: "100%", marginBottom: 10,
    color: "#e2e8f0", fontSize: 15, textAlign: "left",
  };

  return (
    <div style={OVERLAY} onClick={onClose}>
      <div style={MODAL} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ color: "#e2e8f0", fontSize: 18, margin: 0 }}>选择钱包</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer", padding: 4 }}
          >
            ✕
          </button>
        </div>

        {wallets.length === 0 ? (
          <div>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
              未检测到钱包插件
            </p>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#3b82f6", fontSize: 14 }}
            >
              安装 MetaMask →
            </a>
          </div>
        ) : (
          wallets.map(w => (
            <button key={w.info.uuid} style={WALLET_BTN} onClick={() => onSelect(w)}>
              {w.info.icon ? (
                <img src={w.info.icon} alt={w.info.name} style={{ width: 36, height: 36, borderRadius: 8 }} />
              ) : (
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: "#1e2d45", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#6b7280", fontSize: 18,
                }}>
                  ◈
                </div>
              )}
              <span>{w.info.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const wallets = useWalletProviders();
  const [showPicker, setShowPicker] = useState(false);
  const [status, setStatus] = useState<"idle" | "connecting" | "signing" | "error">("idle");
  const [error, setError] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<any>(null);

  const selectWallet = useCallback(async (w: EIP6963ProviderDetail) => {
    setShowPicker(false);
    setStatus("connecting");
    setError("");
    try {
      const accounts: string[] = await w.provider.request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
      setActiveProvider(w.provider);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("用户取消连接");
    }
  }, []);

  const signIn = useCallback(async () => {
    if (!address || !activeProvider) return;
    setStatus("signing");
    setError("");
    try {
      const message = await fetchNonce(address);
      const signature: string = await activeProvider.request({
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
  }, [address, activeProvider, login, navigate]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {showPicker && (
        <WalletPicker
          wallets={wallets}
          onSelect={selectWallet}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div style={CARD}>
        <h1 style={{ color: "#e2e8f0", fontSize: 24, marginBottom: 8 }}>x402 Provider Portal</h1>
        <p style={{ color: "#6b7280", marginBottom: 32 }}>使用钱包登录，管理你的服务</p>

        {!address ? (
          <button style={BTN} onClick={() => setShowPicker(true)} disabled={status === "connecting"}>
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
            <button
              onClick={() => { setAddress(null); setActiveProvider(null); }}
              style={{ ...BTN, background: "transparent", border: "1px solid #1e2d45", color: "#6b7280", marginTop: 8 }}
            >
              切换钱包
            </button>
          </>
        )}

        {error && <p style={{ color: "#ef4444", marginTop: 16, fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
