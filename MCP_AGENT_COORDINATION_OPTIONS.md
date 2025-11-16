# MCP Agent Coordination - Architecture Options

**Current Issue**: MCP services deployed as stdio-based servers, but database schema designed for distributed agent coordination.

---

## Current State

### Agent Registry
```sql
SELECT agent_id, agent_type, hostname, capabilities, last_heartbeat_at
FROM mcp_agents;

-- Result: Only 1 system agent (mcp-orchestrator static registration)
-- Missing: itjsst-mcp and perplexity-mcp agents
```

### Process Status
- **mcp-orchestrator**: Running (stdio MCP server + systemd service)
- **itjsst-mcp**: Installed but not running (stdio only)
- **perplexity-mcp**: Installed but not running (stdio only)

---

## Option 1: Hybrid Mode (Recommended)

**Keep stdio mode + Add agent wrapper service**

### Architecture
```
┌─────────────────────────────────────────────┐
│  Claude Desktop (MCP Client)                 │
│  - Launches MCP servers via stdio            │
│  - Direct tool invocation                    │
└──────────┬──────────────────────────────────┘
           │
           │ stdio
           ▼
┌─────────────────────────────────────────────┐
│  MCP Server (itjsst-mcp/perplexity-mcp)     │
│  - Handles MCP protocol                      │
│  - Executes tools                            │
└──────────┬──────────────────────────────────┘
           │
           │ Reports to
           ▼
┌─────────────────────────────────────────────┐
│  Agent Wrapper Service (systemd)             │
│  - Auto-registers agent on startup           │
│  - Sends periodic heartbeats to Redis        │
│  - Updates agent status in PostgreSQL        │
│  - Polls command queue                       │
└──────────┬──────────────────────────────────┘
           │
           │ PostgreSQL + Redis
           ▼
┌─────────────────────────────────────────────┐
│  Agent Registry (mcp_ecosystem database)     │
│  - mcp_agents table                          │
│  - command_queue table                       │
│  - Redis heartbeat cache                     │
└─────────────────────────────────────────────┘
```

### Implementation

Create lightweight agent wrapper services:

**For itjsst-mcp**:
```bash
# /opt/mcp/services/itjsst-mcp/agent-wrapper.js
import { AutoDiscoveryService } from './dist/services/autoDiscovery.js';

const agent = new AutoDiscoveryService({
  agentType: 'it-mcp',
  hostname: require('os').hostname(),
  capabilities: ['local-shell', 'ssh-linux', 'system-diagnostics'],
  registryUrl: process.env.MCP_REGISTRY_URL || 'http://localhost:3000',
});

// Register and start heartbeat
await agent.register();
agent.startHeartbeat();

// Keep alive
process.on('SIGTERM', async () => {
  await agent.deregister();
  process.exit(0);
});
```

**Systemd service** (`/etc/systemd/system/itjsst-mcp-agent.service`):
```ini
[Unit]
Description=IT-MCP Agent Wrapper
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mcp/services/itjsst-mcp
ExecStart=/usr/bin/node /opt/mcp/services/itjsst-mcp/agent-wrapper.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=MCP_REGISTRY_URL=http://localhost:3000
Environment=DATABASE_URL=postgresql://mcp_admin:mcp_pass@localhost:5432/mcp_ecosystem
Environment=REDIS_URL=redis://localhost:6379

[Install]
WantedBy=multi-user.target
```

**Benefits**:
- ✅ MCP servers still work via stdio (Claude Desktop compatibility)
- ✅ Agent wrapper handles registration and heartbeat
- ✅ Distributed coordination enabled
- ✅ Command queue polling works
- ✅ No changes to existing MCP server code

---

## Option 2: HTTP API Mode

**Convert MCP servers to HTTP + stdio dual transport**

### Architecture
```
┌──────────────────────────┬────────────────────────┐
│  Claude Desktop          │  Agent Registry         │
│  (stdio client)          │  (HTTP client)          │
└──────────┬───────────────┴────────┬───────────────┘
           │                        │
           │ stdio                  │ HTTP
           ▼                        ▼
┌─────────────────────────────────────────────────┐
│  MCP Server (Dual Transport)                     │
│  - stdio transport (port: stdin/stdout)          │
│  - HTTP transport (port: 3001, 3002)             │
│  - Auto-registration on startup                  │
│  - Heartbeat sender (every 30s)                  │
│  - Command queue poller (every 10s)              │
└──────────────────┬──────────────────────────────┘
                   │
                   │ PostgreSQL + Redis
                   ▼
┌─────────────────────────────────────────────────┐
│  Agent Registry                                  │
└─────────────────────────────────────────────────┘
```

### Implementation

Modify MCP server index.ts to add HTTP transport:

```typescript
// src/index.ts
import express from 'express';
import { AutoDiscoveryService } from './services/autoDiscovery.js';

const app = express();
const port = process.env.PORT || 3001;

// MCP stdio transport (existing)
const stdioTransport = new StdioServerTransport();
server.connect(stdioTransport);

// HTTP API transport (new)
if (process.env.ENABLE_HTTP === 'true') {
  app.post('/mcp', async (req, res) => {
    const result = await server.handleRequest(req.body);
    res.json(result);
  });

  app.listen(port, async () => {
    // Register agent
    const agent = new AutoDiscoveryService({
      agentType: 'it-mcp',
      hostname: os.hostname(),
      capabilities: ['local-shell', 'system-diagnostics'],
    });

    await agent.register();
    agent.startHeartbeat();

    console.log(`MCP server listening on port ${port}`);
  });
}
```

**Benefits**:
- ✅ stdio mode for Claude Desktop
- ✅ HTTP mode for distributed coordination
- ✅ Built-in agent registration
- ✅ Single service, dual transport

**Drawbacks**:
- ❌ Requires code changes to MCP servers
- ❌ More complex architecture

---

## Option 3: Central Orchestrator Only

**Simplify to single agent (mcp-orchestrator) that dispatches to stdio servers**

### Architecture
```
┌─────────────────────────────────────────────┐
│  Claude Desktop / External Clients           │
└──────────┬──────────────────────────────────┘
           │
           │ MCP protocol
           ▼
┌─────────────────────────────────────────────┐
│  mcp-orchestrator (Central Agent)            │
│  - Registered in agent registry              │
│  - Sends heartbeats                          │
│  - Polls command queue                       │
│  - Dispatches to child MCP processes         │
└──────────┬──────────────────────────────────┘
           │
           │ Spawns child processes
           ▼
┌──────────────────────┬──────────────────────┐
│  itjsst-mcp (stdio)  │  perplexity-mcp      │
│  - No registration   │  - No registration    │
│  - Invoked on demand │  - Invoked on demand  │
└──────────────────────┴──────────────────────┘
```

### Implementation

**mcp-orchestrator** acts as proxy:

```typescript
// In mcp-orchestrator
server.registerTool('execute-it-tool', schema, async (params) => {
  // Spawn itjsst-mcp as child process
  const child = spawn('node', ['/opt/mcp/services/itjsst-mcp/dist/index.js']);

  // Send MCP request to child via stdio
  child.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: params.tool, arguments: params.args },
    id: 1,
  }));

  // Collect response
  const response = await readFromChild(child);
  return response;
});
```

**Benefits**:
- ✅ Simplest architecture
- ✅ Only one agent to manage
- ✅ No code changes to itjsst-mcp/perplexity-mcp

**Drawbacks**:
- ❌ Single point of failure
- ❌ mcp-orchestrator must know all child MCP tools
- ❌ No direct client access to specialized MCPs

---

## Recommendation: Option 1 (Hybrid Mode)

**Reason**: Best balance of simplicity, compatibility, and distributed coordination

### Deployment Steps

1. **Create agent wrapper scripts** for each MCP service
2. **Create systemd services** for agent wrappers
3. **Keep stdio mode** for Claude Desktop compatibility
4. **Enable distributed coordination** via agent registry

### Immediate Next Steps

Would you like me to:

A. **Implement Option 1 (Hybrid Mode)** - Create agent wrapper services
B. **Implement Option 2 (HTTP Mode)** - Add HTTP transport to MCP servers
C. **Keep current architecture** - Document as client-invoked only (no autonomous coordination)
D. **Design custom solution** - Describe your specific coordination requirements

---

**Current Recommendation**: Option A (Hybrid Mode)

This gives you:
- ✅ Full agent coordination (registration, heartbeats, command queue)
- ✅ Backward compatibility with stdio MCP clients
- ✅ Minimal code changes (just add wrapper scripts)
- ✅ All 3 MCPs visible in agent registry
- ✅ Distributed command dispatch enabled
