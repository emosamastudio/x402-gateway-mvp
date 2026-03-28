# 部署指南

本文档介绍如何将 x402-gateway-mvp 部署到生产环境。

---

## 部署架构

```
                    ┌─────────────────────┐
    Internet ──────>│   Nginx / Caddy     │
                    │   (TLS 终端)         │
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         :8402          :8403          :5173
    ┌──────────┐   ┌───────────┐   ┌──────────┐
    │  Gateway  │   │ Admin API │   │ Admin UI │
    │   Core    │   │           │   │ (static) │
    └──────────┘   └───────────┘   └──────────┘
         │
    ┌──────────┐
    │ gateway.db│  ← SQLite 文件
    └──────────┘
```

---

## 前置要求

- **Node.js** >= 20
- **pnpm** >= 9
- 一个 EVM 私钥（Facilitator 角色，用于链上结算）
- 区块链 RPC 端点（如 Alchemy / Infura）
- 域名 + TLS 证书（推荐）

---

## 构建

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# Admin UI 生产构建
cd packages/admin-ui && pnpm build
# 输出到 packages/admin-ui/dist/
```

---

## 环境配置

创建 `.env` 文件（从 `.env.example` 复制）：

```env
# === 必填 ===
FACILITATOR_PRIVATE_KEY=0x...   # 结算钱包私钥
ADMIN_API_KEY=<strong-random-key>         # 管理 API 认证密钥

# === 链 RPC（仅首次建库 seed，之后通过 Admin UI / API 管理）===
# OPTIMISM_SEPOLIA_RPC=https://opt-sepolia.g.alchemy.com/v2/YOUR_KEY
# SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# === 代币合约 ===
OPTIMISM_SEPOLIA_DMHKD=0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6
SEPOLIA_DMHKD=0x1aA90392c804343C7854DD700f50a48961B71c53

# === ERC-8004 身份 ===
OPTIMISM_SEPOLIA_ERC8004_IDENTITY=0x...
SEPOLIA_ERC8004_IDENTITY=0x...

# === 可选 ===
DB_PATH=./data/gateway.db       # 数据库路径
CORE_PORT=8402                  # 网关端口
ADMIN_PORT=8403                 # 管理 API 端口
ERC8004_MOCK=false              # 生产环境务必设为 false
```

---

## 启动方式

### 方式一：直接运行

```bash
# 启动所有服务
node start.js
# 或
npx tsx start.ts
```

`start.ts` 同时启动 core (:8402) 和 admin-api (:8403)。

### 方式二：PM2 进程管理

```bash
npm install -g pm2

# 启动
pm2 start start.js --name x402-gateway-mvp

# 查看状态
pm2 status

# 查看日志
pm2 logs x402-gateway-mvp

# 自动重启
pm2 startup
pm2 save
```

### 方式三：systemd

```ini
# /etc/systemd/system/x402-gateway-mvp.service
[Unit]
Description=x402 Gateway MVP
After=network.target

[Service]
Type=simple
User=x402
WorkingDirectory=/opt/x402-gateway-mvp
ExecStart=/usr/bin/node start.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/x402-gateway-mvp/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable x402-gateway-mvp
sudo systemctl start x402-gateway-mvp
```

---

## Nginx 反向代理

```nginx
# /etc/nginx/sites-available/x402-gateway-mvp

# Gateway Core — 面向 AI Agent
server {
    listen 443 ssl http2;
    server_name gateway.example.com;

    ssl_certificate     /etc/letsencrypt/live/gateway.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gateway.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8402;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }
}

# Admin API — 仅内部/授权访问
server {
    listen 443 ssl http2;
    server_name admin-api.example.com;

    ssl_certificate     /etc/letsencrypt/live/admin-api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin-api.example.com/privkey.pem;

    # 限制来源 IP
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:8403;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Admin UI — 静态文件
server {
    listen 443 ssl http2;
    server_name admin.example.com;

    ssl_certificate     /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    root /opt/x402-gateway-mvp/packages/admin-ui/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 安全建议

### 1. ADMIN_API_KEY
- 使用 64 字符以上的随机字符串
- 生成方式：`openssl rand -hex 32`
- **永远不要**使用默认值 `change-me-in-production`

### 2. FACILITATOR_PRIVATE_KEY
- 使用专用的结算钱包，不要与主钱包混用
- 仅在该钱包中保留用于 gas 费的少量 ETH
- 定期轮换私钥

### 3. Admin API 访问控制
- 限制 Admin API 仅允许内网访问
- 使用 Nginx IP 白名单或 VPN
- 不要将 Admin API 暴露到公网

### 4. 数据库安全
- 定期备份 `gateway.db`
- 限制文件权限：`chmod 600 gateway.db`
- 数据库包含敏感信息（API keys、Agent 地址）

### 5. ERC-8004 Mock
- 生产环境**必须**设 `ERC8004_MOCK=false`
- Mock 模式会跳过身份验证，任何人都可访问

### 6. HTTPS
- 所有面向外部的端点必须使用 HTTPS
- 使用 Let's Encrypt 免费证书
- 后端服务间通信可使用 HTTP（内网）

---

## 监控

### 健康检查端点

```bash
# Gateway Core
curl http://localhost:8402/health
# → {"status":"ok"}
```

### 日志监控

核心日志输出到 stdout，建议配合日志聚合工具：

```bash
# PM2 日志
pm2 logs x402-gateway-mvp --lines 100

# systemd 日志
journalctl -u x402-gateway-mvp -f
```

### 数据库监控

```bash
# 检查数据库大小
ls -lh gateway.db

# 查看请求统计
sqlite3 gateway.db "SELECT gateway_status, COUNT(*) FROM requests GROUP BY gateway_status"

# 查看 nonce 积累
sqlite3 gateway.db "SELECT COUNT(*) FROM used_nonces"
```

---

## 备份策略

```bash
# SQLite 在线备份
sqlite3 gateway.db ".backup /backups/gateway-$(date +%Y%m%d).db"

# 定时备份（crontab）
0 2 * * * sqlite3 /opt/x402-gateway-mvp/gateway.db ".backup /backups/gateway-$(date +\%Y\%m\%d).db"
```

---

## 性能调优

| 参数 | 默认值 | 建议 |
|------|--------|------|
| 代理超时 | 10s | 根据后端响应时间调整 |
| RPC 健康检查间隔 | 30s | 高流量可缩短到 10s |
| Agent 缓存 TTL | 5min | 低频场景可延长到 15min |
| Nonce 清理 | 启动时清理 24h+ | 可设置定时任务更频繁清理 |

---

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 502 Bad Gateway | 后端服务未启动 | 检查 backendUrl 是否可达 |
| 403 Agent not registered | ERC-8004 合约未部署 | 检查 erc8004Identity 配置 |
| Payment expired | Agent 签名构造延迟 | 增大 maxTimeoutSeconds |
| Settlement failed | Facilitator ETH 不足 | 向结算钱包充值 gas |
| DB locked | SQLite 并发写入 | 确保单进程运行 |
