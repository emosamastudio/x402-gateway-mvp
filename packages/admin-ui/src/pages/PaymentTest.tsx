import { useState } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, encodeAbiParameters, parseAbiParameters, concat } from "viem";

// keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
  )
);

type StepStatus = "idle" | "running" | "success" | "error";

interface Step {
  label: string;
  status: StepStatus;
  detail?: unknown;
  error?: string;
}

function makeSteps(): Step[] {
  return [
    { label: "Step 1 · 发送未授权请求，获取 402 支付要求", status: "idle" },
    { label: "Step 2 · 构建 EIP-712 签名 (TransferWithAuthorization)", status: "idle" },
    { label: "Step 3 · 携带支付凭证重发请求", status: "idle" },
    { label: "Step 4 · 解析链上结算结果", status: "idle" },
  ];
}

function StatusDot({ status }: { status: StepStatus }) {
  const colors: Record<StepStatus, string> = {
    idle: "#475569",
    running: "#fbbf24",
    success: "#34d399",
    error: "#f87171",
  };
  const labels: Record<StepStatus, string> = {
    idle: "等待",
    running: "执行中",
    success: "成功",
    error: "失败",
  };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: colors[status], display: "inline-block",
        boxShadow: status === "running" ? `0 0 8px ${colors[status]}` : "none",
        animation: status === "running" ? "pulse 1s infinite" : "none",
      }} />
      <span style={{ fontSize: 11, color: colors[status], fontWeight: 600 }}>{labels[status]}</span>
    </span>
  );
}

function JsonViewer({ data }: { data: unknown }) {
  return (
    <pre style={{
      margin: 0, padding: 12, background: "#0d1117", borderRadius: 8,
      fontSize: 12, color: "#94a3b8", overflowX: "auto",
      maxHeight: 220, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
      lineHeight: 1.6,
    }}>
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", background: "#0d1117",
  border: "1px solid #1e2d45", borderRadius: 8, color: "#e2e8f0",
  fontSize: 14, boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "#60a5fa", display: "block", marginBottom: 6,
};

function stepBorderColor(status: StepStatus): string {
  if (status === "success") return "#065f46";
  if (status === "error") return "#7f1d1d";
  if (status === "running") return "#78350f";
  return "#1e2d45";
}

function stepBubbleBg(status: StepStatus): string {
  if (status === "success") return "#065f46";
  if (status === "error") return "#7f1d1d";
  return "#1e2d45";
}

function stepBubbleColor(status: StepStatus): string {
  if (status === "success") return "#34d399";
  if (status === "error") return "#f87171";
  return "#60a5fa";
}

export function PaymentTest() {
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiPath, setApiPath] = useState("/get");
  const [method, setMethod] = useState("GET");
  const [requestBody, setRequestBody] = useState("");
  const [steps, setSteps] = useState<Step[]>(makeSteps());
  const [running, setRunning] = useState(false);
  const [apiResult, setApiResult] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setDone(false);
    setApiResult(null);
    setSteps(makeSteps());

    const pk = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
    let account: ReturnType<typeof privateKeyToAccount>;
    try {
      account = privateKeyToAccount(pk);
    } catch {
      alert("私钥格式错误，请检查后重试");
      setRunning(false);
      return;
    }

    const extraHeaders: Record<string, string> = {
      "X-Agent-Address": account.address,
      ...(method !== "GET" && requestBody ? { "Content-Type": "application/json" } : {}),
    };

    function makeFetchInit(paymentSig?: string): RequestInit {
      return {
        method,
        headers: { ...extraHeaders, ...(paymentSig ? { "PAYMENT-SIGNATURE": paymentSig } : {}) },
        ...(method !== "GET" && requestBody ? { body: requestBody } : {}),
      };
    }

    try {
      // ── Step 1: Unauthenticated request ──────────────────────────────
      updateStep(0, { status: "running" });
      const res1 = await fetch(`/gateway${apiPath}`, makeFetchInit());
      const body1 = await res1.json();

      if (res1.status !== 402) {
        updateStep(0, {
          status: "error",
          error: `期望 402，实际收到 ${res1.status}（路径可能未注册）`,
          detail: body1,
        });
        setRunning(false);
        return;
      }

      const req = body1.requirement;
      updateStep(0, {
        status: "success",
        detail: {
          httpStatus: 402,
          network: req.network,
          maxAmountRequired: req.maxAmountRequired,
          payTo: req.payTo,
          asset: req.asset,
          maxTimeoutSeconds: req.maxTimeoutSeconds,
        },
      });

      // ── Step 2: Build EIP-712 signature ──────────────────────────────
      updateStep(1, { status: "running" });

      const network = req.network as string;
      const domainSeparator = req.domainSeparator as `0x${string}`;
      if (!domainSeparator) {
        updateStep(1, { status: "error", error: `402 响应未包含 domainSeparator（网关版本过旧）` });
        setRunning(false);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const nonce = `0x${Array.from(nonceBytes).map(b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
      const value = BigInt(req.maxAmountRequired);
      const validAfter = 0n;
      const validBefore = BigInt(now + (req.maxTimeoutSeconds ?? 300));

      // Compute structHash
      const structHash = keccak256(encodeAbiParameters(
        parseAbiParameters("bytes32, address, address, uint256, uint256, uint256, bytes32"),
        [
          TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
          account.address,
          req.payTo as `0x${string}`,
          value,
          validAfter,
          validBefore,
          nonce,
        ]
      ));

      // Compute final digest using the actual contract domainSeparator (from 402 response)
      const digest = keccak256(concat(["0x1901", domainSeparator, structHash]));

      // Sign the raw digest (not signTypedData, which would compute a different DS)
      const signature = await account.sign({ hash: digest });

      const authorization = {
        from: account.address,
        to: req.payTo,
        value: value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      };

      updateStep(1, {
        status: "success",
        detail: {
          domainSeparator,
          note: domainSeparator === "0x" + "0".repeat(64)
            ? "⚠ DS=0x0：合约 initializeV2 未调用，使用实际存储值"
            : "DS 已从合约 DOMAIN_SEPARATOR() 读取",
          authorization,
          digest: `${digest.slice(0, 14)}...${digest.slice(-10)}`,
          signature: `${signature.slice(0, 22)}...${signature.slice(-10)}`,
        },
      });

      // ── Step 3: Send payment request ──────────────────────────────────
      updateStep(2, { status: "running" });

      const payload = {
        x402Version: 1,
        scheme: "exact",
        network,
        payload: { signature, authorization },
      };
      const paymentHeader = btoa(JSON.stringify(payload));

      const res2 = await fetch(`/gateway${apiPath}`, makeFetchInit(paymentHeader));

      // Read body once before any other operations
      const ct = res2.headers.get("content-type") ?? "";
      const apiBody = ct.includes("json") ? await res2.json().catch(() => null) : await res2.text();
      const settlementHeader = res2.headers.get("PAYMENT-RESPONSE");
      const settlement = settlementHeader ? JSON.parse(atob(settlementHeader)) : null;

      if (!res2.ok) {
        updateStep(2, { status: "error", error: `HTTP ${res2.status}`, detail: apiBody });
        setRunning(false);
        return;
      }

      updateStep(2, {
        status: "success",
        detail: { httpStatus: res2.status, settlement },
      });

      // ── Step 4: Settlement result ──────────────────────────────────────
      updateStep(3, { status: "running" });
      if (!settlement) {
        // No PAYMENT-RESPONSE header at all (unexpected — old gateway version?)
        updateStep(3, { status: "success", detail: { status: "无结算响应（旧版网关）" } });
      } else if (settlement.settlementError) {
        // Settlement was attempted but failed (signature error, balance error, etc.)
        updateStep(3, {
          status: "error",
          error: settlement.settlementError,
          detail: {
            note: "链上结算失败。交易未广播（viem 模拟阶段即失败，不消耗 gas）",
            reason: settlement.settlementError,
          },
        });
      } else {
        // Settlement succeeded
        updateStep(3, {
          status: "success",
          detail: { txHash: settlement.txHash, status: "链上结算已广播" },
        });
        // Only show API result when payment is fully settled
        setApiResult(apiBody);
        setDone(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSteps(prev => {
        const idx = prev.findIndex(s => s.status === "running");
        if (idx < 0) return prev;
        return prev.map((s, i) => i === idx ? { ...s, status: "error", error: msg } : s);
      });
    } finally {
      setRunning(false);
    }
  }

  const hasStarted = steps.some(s => s.status !== "idle");

  return (
    <div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Payment Flow Test</h1>
      <p style={{ color: "#475569", fontSize: 13, marginBottom: 28 }}>
        可视化执行完整 x402 支付流程 &nbsp;·&nbsp; 私钥仅在浏览器本地使用，不会传输至任何服务器
      </p>

      {/* ── Form ── */}
      <form onSubmit={run} style={{ background: "#111827", border: "1px solid #1e2d45", borderRadius: 12, padding: 24, marginBottom: 24 }}>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Agent 私钥</label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={privateKey}
              onChange={e => setPrivateKey(e.target.value)}
              placeholder="0x..."
              required
              style={{ ...inputStyle, paddingRight: 56 }}
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "#60a5fa", cursor: "pointer",
                fontSize: 12, fontWeight: 600, padding: "4px 6px",
              }}
            >{showKey ? "隐藏" : "显示"}</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>API 路径</label>
            <input
              value={apiPath}
              onChange={e => setApiPath(e.target.value)}
              placeholder="/get"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>HTTP 方法</label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </div>
        </div>

        {method !== "GET" && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>请求体 (JSON)</label>
            <textarea
              value={requestBody}
              onChange={e => setRequestBody(e.target.value)}
              rows={3}
              placeholder='{"key": "value"}'
              style={{ ...inputStyle, fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
            />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="submit"
            disabled={running}
            style={{
              padding: "10px 32px",
              background: running ? "#1e2d45" : "#1d4ed8",
              color: running ? "#475569" : "#fff",
              border: "none", borderRadius: 8,
              cursor: running ? "not-allowed" : "pointer",
              fontSize: 14, fontWeight: 700,
              transition: "background 0.2s",
            }}
          >
            {running ? "⏳ 执行中..." : "▶ 执行完整支付流程"}
          </button>
          <span style={{ fontSize: 12, color: "#334155" }}>
            私钥不离开浏览器
          </span>
        </div>
      </form>

      {/* ── Step cards ── */}
      {hasStarted && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {steps.map((step, idx) => (
            <div key={idx} style={{
              background: "#111827",
              border: `1px solid ${stepBorderColor(step.status)}`,
              borderRadius: 12, overflow: "hidden",
              transition: "border-color 0.3s",
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "14px 18px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: stepBubbleBg(step.status),
                    color: stepBubbleColor(step.status),
                    flexShrink: 0,
                  }}>{idx + 1}</div>
                  <span style={{
                    fontSize: 13, fontWeight: 600,
                    color: step.status === "idle" ? "#475569" : "#e2e8f0",
                  }}>{step.label}</span>
                </div>
                <StatusDot status={step.status} />
              </div>

              {step.error && (
                <div style={{ padding: "0 18px 14px", color: "#f87171", fontSize: 12 }}>
                  ⚠ {step.error}
                </div>
              )}

              {step.detail !== undefined && (
                <div style={{ padding: "0 18px 14px" }}>
                  <JsonViewer data={step.detail} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Final API result ── */}
      {done && apiResult !== null && (
        <div style={{
          background: "#111827",
          border: "1px solid #065f46",
          borderRadius: 12, padding: 24,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399", marginBottom: 14 }}>
            ✅ API 响应内容
          </div>
          <JsonViewer data={apiResult} />
        </div>
      )}
    </div>
  );
}
