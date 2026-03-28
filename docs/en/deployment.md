# Deployment Guide

This document covers deploying x402-gateway-mvp to a production environment.

---

## Deployment Architecture

```
                    ┌─────────────────────┐
    Internet ──────>│   Nginx / Caddy     │
                    │   (TLS termination) │
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
    │ gateway.db│  ← SQLite file
    └──────────┘
```

---

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- An EVM private key (Facilitator role, for on-chain settlement)
- Blockchain RPC endpoints (e.g., Alchemy / Infura)
- Domain name + TLS certificate (recommended)

---

## Build

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Admin UI production build
cd packages/admin-ui && pnpm build
# Output to packages/admin-ui/dist/
```

---

## Environment Configuration

Create `.env` file (copy from `.env.example`):

```env
# === Required ===
FACILITATOR_PRIVATE_KEY=0x...   # Settlement wallet private key
ADMIN_API_KEY=<strong-random-key>         # Admin API auth key

# === Chain RPC (seed defaults for first DB init only; manage via Admin UI / API afterwards) ===
# OPTIMISM_SEPOLIA_RPC=https://opt-sepolia.g.alchemy.com/v2/YOUR_KEY
# SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY

# === Token Contracts ===
OPTIMISM_SEPOLIA_DMHKD=0x35348A0439Cd0198F10fbd6ACEc66D2506656DF6
SEPOLIA_DMHKD=0x1aA90392c804343C7854DD700f50a48961B71c53

# === ERC-8004 Identity ===
OPTIMISM_SEPOLIA_ERC8004_IDENTITY=0x...
SEPOLIA_ERC8004_IDENTITY=0x...

# === Optional ===
DB_PATH=./data/gateway.db       # Database path
CORE_PORT=8402                  # Gateway port
ADMIN_PORT=8403                 # Admin API port
ERC8004_MOCK=false              # Must be false in production
```

---

## Startup Methods

### Method 1: Direct Execution

```bash
# Start all services
node start.js
# or
npx tsx start.ts
```

`start.ts` starts both core (:8402) and admin-api (:8403).

### Method 2: PM2 Process Manager

```bash
npm install -g pm2

# Start
pm2 start start.js --name x402-gateway-mvp

# Check status
pm2 status

# View logs
pm2 logs x402-gateway-mvp

# Auto-restart on boot
pm2 startup
pm2 save
```

### Method 3: systemd

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

## Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/x402-gateway-mvp

# Gateway Core — public-facing for AI Agents
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

# Admin API — internal/authorized access only
server {
    listen 443 ssl http2;
    server_name admin-api.example.com;

    ssl_certificate     /etc/letsencrypt/live/admin-api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin-api.example.com/privkey.pem;

    # Restrict source IPs
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;

    location / {
        proxy_pass http://127.0.0.1:8403;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Admin UI — static files
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

## Security Recommendations

### 1. ADMIN_API_KEY
- Use a random string of 64+ characters
- Generate: `openssl rand -hex 32`
- **Never** use the default `change-me-in-production`

### 2. FACILITATOR_PRIVATE_KEY
- Use a dedicated settlement wallet, separate from main wallet
- Keep only minimal ETH for gas fees in this wallet
- Rotate private keys periodically

### 3. Admin API Access Control
- Restrict Admin API to internal network only
- Use Nginx IP whitelist or VPN
- Never expose Admin API to the public internet

### 4. Database Security
- Regularly backup `gateway.db`
- Restrict file permissions: `chmod 600 gateway.db`
- Database contains sensitive data (API keys, Agent addresses)

### 5. ERC-8004 Mock
- Production **must** set `ERC8004_MOCK=false`
- Mock mode skips identity verification, allowing anyone to access

### 6. HTTPS
- All external-facing endpoints must use HTTPS
- Use Let's Encrypt for free certificates
- Internal service communication can use HTTP

---

## Monitoring

### Health Check Endpoint

```bash
# Gateway Core
curl http://localhost:8402/health
# → {"status":"ok"}
```

### Log Monitoring

Core logs to stdout. Recommended to use log aggregation:

```bash
# PM2 logs
pm2 logs x402-gateway-mvp --lines 100

# systemd logs
journalctl -u x402-gateway-mvp -f
```

### Database Monitoring

```bash
# Check database size
ls -lh gateway.db

# View request statistics
sqlite3 gateway.db "SELECT gateway_status, COUNT(*) FROM requests GROUP BY gateway_status"

# Check nonce accumulation
sqlite3 gateway.db "SELECT COUNT(*) FROM used_nonces"
```

---

## Backup Strategy

```bash
# SQLite online backup
sqlite3 gateway.db ".backup /backups/gateway-$(date +%Y%m%d).db"

# Scheduled backup (crontab)
0 2 * * * sqlite3 /opt/x402-gateway-mvp/gateway.db ".backup /backups/gateway-$(date +\%Y\%m\%d).db"
```

---

## Performance Tuning

| Parameter | Default | Recommendation |
|-----------|---------|---------------|
| Proxy timeout | 10s | Adjust based on backend response time |
| RPC health check interval | 30s | Reduce to 10s for high traffic |
| Agent cache TTL | 5min | Extend to 15min for low-frequency scenarios |
| Nonce cleanup | 24h+ on startup | Schedule more frequent cleanup |

---

## Troubleshooting

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| 502 Bad Gateway | Backend service not running | Verify backendUrl is reachable |
| 403 Agent not registered | ERC-8004 contract not deployed | Check erc8004Identity config |
| Payment expired | Agent signature construction delay | Increase maxTimeoutSeconds |
| Settlement failed | Facilitator insufficient ETH | Fund settlement wallet with gas |
| DB locked | SQLite concurrent writes | Ensure single process |
