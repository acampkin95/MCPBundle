# MCP Services - HTTPS API Mode for LAN/WAN Access

**Use Case**: Access MCP services from Claude Desktop, ChatGPT, or other AI clients over LAN/WAN using HTTPS

---

## Current Limitation

**stdio mode** = Only works on same machine via stdin/stdout pipes
- ✅ Good for: Claude Desktop on local machine
- ❌ Can't: Connect from another device on LAN
- ❌ Can't: Access from web browsers
- ❌ Can't: Integrate with ChatGPT, remote Claude instances

---

## HTTPS API Mode Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Client Devices (LAN/WAN)                                 │
│  ┌──────────────┬──────────────┬─────────────────┐       │
│  │ Claude       │ ChatGPT      │ Custom Web App  │       │
│  │ Desktop      │ (via plugin) │ (React/Vue)     │       │
│  └──────────────┴──────────────┴─────────────────┘       │
└───────────────────────┬──────────────────────────────────┘
                        │
                        │ HTTPS (wss:// for streaming)
                        │ https://acdev-vmi01.lan:8443
                        ▼
┌──────────────────────────────────────────────────────────┐
│  NGINX Reverse Proxy (VMI01)                              │
│  - SSL/TLS termination (Let's Encrypt or self-signed)     │
│  - Load balancing across MCP services                     │
│  - Rate limiting, CORS, authentication                    │
│  - WebSocket support for streaming                        │
└───────────────────────┬──────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
         ▼              ▼              ▼
┌───────────────┬───────────────┬───────────────┐
│ mcp-          │ itjsst-mcp    │ perplexity-   │
│ orchestrator  │ HTTP Server   │ mcp           │
│ Port 3000     │ Port 3002     │ HTTP Server   │
│               │               │ Port 3001     │
└───────────────┴───────────────┴───────────────┘
         │              │              │
         └──────────────┼──────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Backend Services (Shared)                                │
│  - PostgreSQL (agent registry, structured thoughts)       │
│  - Redis (pub/sub, caching)                               │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Options

### Option A: MCP-over-HTTP (RESTful API)

**Add HTTP server to each MCP service**

#### Architecture

```typescript
// src/index.ts (for each MCP service)
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const app = express();
const mcpServer = new McpServer(/* config */);

// HTTP API endpoints
app.post('/api/mcp/initialize', async (req, res) => {
  const result = await mcpServer.handleRequest({
    jsonrpc: '2.0',
    method: 'initialize',
    params: req.body,
    id: req.body.id,
  });
  res.json(result);
});

app.post('/api/mcp/tools/list', async (req, res) => {
  const result = await mcpServer.handleRequest({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: req.body.id,
  });
  res.json(result);
});

app.post('/api/mcp/tools/call', async (req, res) => {
  const result = await mcpServer.handleRequest({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: req.body,
    id: req.body.id,
  });
  res.json(result);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'itjsst-mcp' });
});

app.listen(3002, () => {
  console.log('MCP HTTP server listening on port 3002');
});
```

#### NGINX Configuration

```nginx
# /etc/nginx/sites-available/mcp-services

# Upstream definitions
upstream mcp_orchestrator {
    server localhost:3000;
}

upstream itjsst_mcp {
    server localhost:3002;
}

upstream perplexity_mcp {
    server localhost:3001;
}

# HTTPS server
server {
    listen 8443 ssl http2;
    server_name acdev-vmi01.lan acdev-vmi01.local 46.250.243.123;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/acdev-vmi01.lan/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/acdev-vmi01.lan/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # CORS headers
    add_header 'Access-Control-Allow-Origin' '*';
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS';
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type';

    # Rate limiting
    limit_req zone=mcp_limit burst=20 nodelay;

    # mcp-orchestrator
    location /api/orchestrator/ {
        proxy_pass http://mcp_orchestrator/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # itjsst-mcp
    location /api/itjsst/ {
        proxy_pass http://itjsst_mcp/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # perplexity-mcp
    location /api/perplexity/ {
        proxy_pass http://perplexity_mcp/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "MCP Services OK\n";
        add_header Content-Type text/plain;
    }
}

# HTTP redirect to HTTPS
server {
    listen 8080;
    server_name acdev-vmi01.lan acdev-vmi01.local;
    return 301 https://$host:8443$request_uri;
}
```

#### Rate Limiting Configuration

```nginx
# /etc/nginx/nginx.conf (http block)

http {
    # Rate limit zone (10 requests per second)
    limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;

    # Other config...
}
```

---

### Option B: MCP-over-WebSocket (Streaming Support)

**For real-time streaming responses (like LLM generation)**

#### Implementation

```typescript
// src/index.ts
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    const request = JSON.parse(message.toString());

    // Handle MCP protocol request
    const result = await mcpServer.handleRequest(request);

    // Send response
    ws.send(JSON.stringify(result));
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(3002, () => {
  console.log('MCP WebSocket server listening on port 3002');
});
```

#### NGINX WebSocket Configuration

```nginx
location /ws/itjsst/ {
    proxy_pass http://itjsst_mcp;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 86400;  # 24 hours
}
```

---

### Option C: Full HTTP + stdio Dual Transport

**Best of both worlds**

```typescript
// src/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import express from 'express';

const server = new McpServer(/* config */);

// stdio transport (for local Claude Desktop)
if (process.stdin.isTTY === false) {
  const stdioTransport = new StdioServerTransport();
  server.connect(stdioTransport);
  console.error('MCP server started (stdio mode)');
}

// HTTP transport (for network access)
if (process.env.ENABLE_HTTP === 'true') {
  const app = express();
  app.use(express.json());

  // MCP JSON-RPC endpoint
  app.post('/api/mcp', async (req, res) => {
    const result = await server.handleRequest(req.body);
    res.json(result);
  });

  const port = process.env.PORT || 3002;
  app.listen(port, () => {
    console.error(`MCP HTTP server listening on port ${port}`);
  });
}
```

---

## Authentication & Security

### Option 1: JWT Authentication (Keycloak)

```typescript
// Middleware for JWT validation
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://acdev.host:8080/realms/mcp-agents/protocol/openid-connect/certs',
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

app.use('/api/mcp', (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.user = decoded;
    next();
  });
});
```

### Option 2: API Key Authentication

```typescript
// Simple API key middleware
const VALID_API_KEYS = new Set([
  process.env.MCP_API_KEY_1,
  process.env.MCP_API_KEY_2,
]);

app.use('/api/mcp', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || !VALID_API_KEYS.has(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  next();
});
```

### Option 3: Mutual TLS (mTLS)

```nginx
# NGINX client certificate authentication
server {
    listen 8443 ssl;

    # Server certificate
    ssl_certificate /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;

    # Client certificate verification
    ssl_client_certificate /etc/nginx/ssl/ca.crt;
    ssl_verify_client on;

    location /api/ {
        # Only pass requests with valid client cert
        proxy_pass http://backend;
    }
}
```

---

## Client Integration Examples

### Claude Desktop (HTTPS Mode)

**Configure Claude Desktop to use HTTPS MCP server**:

```json
{
  "mcpServers": {
    "itjsst-remote": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/client-http",
        "https://acdev-vmi01.lan:8443/api/itjsst/mcp"
      ],
      "env": {
        "MCP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### ChatGPT Plugin (OpenAPI Spec)

```yaml
# openapi.yaml
openapi: 3.0.0
info:
  title: IT-MCP Tools API
  version: 1.0.0
servers:
  - url: https://acdev-vmi01.lan:8443/api/itjsst

paths:
  /tools/list:
    get:
      summary: List available tools
      responses:
        '200':
          description: List of tools
          content:
            application/json:
              schema:
                type: object

  /tools/call:
    post:
      summary: Execute a tool
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                arguments:
                  type: object
      responses:
        '200':
          description: Tool execution result
```

### Custom Web Client (JavaScript)

```javascript
// MCP client library
class McpHttpClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async listTools() {
    const response = await fetch(`${this.baseUrl}/tools/list`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });
    return response.json();
  }

  async callTool(name, args) {
    const response = await fetch(`${this.baseUrl}/tools/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name, arguments: args },
        id: 2,
      }),
    });
    return response.json();
  }
}

// Usage
const client = new McpHttpClient(
  'https://acdev-vmi01.lan:8443/api/itjsst',
  'your-api-key'
);

const tools = await client.listTools();
const result = await client.callTool('system-overview', { topProcesses: 10 });
```

---

## SSL Certificate Options

### Option 1: Let's Encrypt (Free, Auto-Renewal)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (requires domain name)
sudo certbot --nginx -d acdev-vmi01.yourdomain.com

# Auto-renewal (already configured)
sudo systemctl status certbot.timer
```

### Option 2: Self-Signed Certificate (LAN Only)

```bash
# Generate self-signed certificate
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/mcp-selfsigned.key \
  -out /etc/ssl/certs/mcp-selfsigned.crt \
  -subj "/C=US/ST=State/L=City/O=Org/CN=acdev-vmi01.lan"

# Update NGINX config
ssl_certificate /etc/ssl/certs/mcp-selfsigned.crt;
ssl_certificate_key /etc/ssl/private/mcp-selfsigned.key;
```

**Client trust** (for self-signed):
```bash
# macOS
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /path/to/mcp-selfsigned.crt

# Linux
sudo cp /path/to/mcp-selfsigned.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates

# Windows
certutil -addstore -f "ROOT" mcp-selfsigned.crt
```

### Option 3: Internal CA (Best for LAN)

```bash
# Create CA
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt

# Create server certificate
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key -set_serial 01 -out server.crt

# Distribute ca.crt to all client devices
```

---

## Deployment Steps

### 1. Modify MCP Services for HTTP

```bash
# Edit each MCP service
cd /opt/mcp/services/itjsst-mcp
nano src/index.ts
# Add HTTP server code (Option C - Dual Transport)

# Rebuild
npm run build
```

### 2. Configure NGINX

```bash
# Install NGINX (if not already)
sudo apt install nginx

# Create MCP services configuration
sudo nano /etc/nginx/sites-available/mcp-services
# Paste NGINX config from above

# Enable site
sudo ln -s /etc/nginx/sites-available/mcp-services /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Open Firewall

```bash
# Allow HTTPS traffic
sudo ufw allow 8443/tcp comment 'MCP HTTPS API'
sudo ufw reload
```

### 4. Update Systemd Services

```bash
# Edit itjsst-mcp service
sudo nano /etc/systemd/system/itjsst-mcp-http.service
```

```ini
[Unit]
Description=IT-MCP HTTP Service
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mcp/services/itjsst-mcp
ExecStart=/usr/bin/node /opt/mcp/services/itjsst-mcp/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=ENABLE_HTTP=true
Environment=PORT=3002
Environment=DATABASE_URL=postgresql://mcp_admin:mcp_pass@localhost:5432/mcp_ecosystem
Environment=REDIS_URL=redis://localhost:6379
Environment=MCP_API_KEY_1=generate-secure-key-here

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable itjsst-mcp-http
sudo systemctl start itjsst-mcp-http
```

### 5. Test Connection

```bash
# Test health endpoint
curl -k https://acdev-vmi01.lan:8443/health

# Test MCP tools list
curl -k -X POST https://acdev-vmi01.lan:8443/api/itjsst/tools/list \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## Security Checklist

- [ ] SSL/TLS certificates configured
- [ ] Authentication enabled (JWT or API key)
- [ ] Rate limiting configured in NGINX
- [ ] CORS headers set appropriately
- [ ] Firewall rules configured (only allow specific IPs)
- [ ] API keys stored securely (not in git)
- [ ] Logging enabled for audit trail
- [ ] Regular security updates scheduled

---

## Performance Considerations

### Connection Pooling

```typescript
// Reuse PostgreSQL connections
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Redis Caching

```typescript
// Cache expensive operations
const cacheKey = `tools:list:${version}`;
const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

const result = await expensiveOperation();
await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 min cache
```

---

## Monitoring

```bash
# NGINX access logs
tail -f /var/log/nginx/access.log | grep '/api/'

# MCP service logs
journalctl -u itjsst-mcp-http -f

# Prometheus metrics (optional)
```

---

## Summary

**HTTPS API Mode gives you**:
- ✅ Network access (LAN/WAN)
- ✅ Claude Desktop over network
- ✅ ChatGPT integration
- ✅ Web browser clients
- ✅ Mobile app clients
- ✅ Proper authentication
- ✅ SSL/TLS encryption

**Implementation: Option C (Dual Transport)**
- Keep stdio for local use
- Add HTTP for network access
- Best flexibility

---

**Ready to implement?** Let me know and I'll create the HTTP server code for all three MCP services!
