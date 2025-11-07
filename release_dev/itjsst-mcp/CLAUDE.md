# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IT-MCP is a **Model Context Protocol (MCP) server** that exposes macOS/Linux/Windows administration and diagnostic tools. The server runs over stdio and integrates with MCP clients like Claude Desktop.

### Hybrid Architecture

**Current State (Local Mode)**:
- Standalone TypeScript/Node.js application
- SQLite for local caching and offline resilience
- Direct stdio communication with MCP clients
- All tools run locally or via SSH/WinRM

**Future State (Distributed Mode - In Development)**:
- PostgreSQL for production structured thinking storage
- Redis for real-time command queue and agent heartbeats
- Keycloak for JWT-based authentication and RBAC
- Auto-discovery and registration with central agent registry
- Remote command dispatch to distributed IT-MCP instances

**Database Strategy**:
- **SQLite**: Fast local cache, offline queue, development/testing
- **PostgreSQL**: Production source of truth, distributed coordination, audit trails
- **Redis**: Real-time pub/sub for instant command dispatch, agent heartbeat cache
- **Sync Service**: Background worker syncing SQLite ↔ PostgreSQL

---

## Core Philosophy

IT-MCP emphasizes five key principles:

1. **Structured Thinking** - 5-stage cognitive framework with SQLite persistence
2. **Efficient Coding** - Service layer architecture with dependency injection
3. **Troubleshooting** - Diagnostic tools with graceful degradation
4. **Error Management** - Standardized error handling across all tools
5. **Project Management** - Task decomposition from structured thoughts

---

## Build & Development Commands

```bash
# Install dependencies (requires Node >= 18.18)
npm install

# Development mode with ts-node
npm run dev

# Compile TypeScript to dist/
npm run build

# Watch mode for development
npm run build:watch

# Run compiled server
npm start

# Lint code (must pass before commits)
npm run lint
```

---

## Architecture

### Service Layer (`src/services/`)

29 service classes handle domain-specific operations:
- **SystemInfoService** - macOS system information
- **StructuredThinkingService** - 5-stage cognitive framework
- **SQLitePlannerService** - SQLite persistence with FTS5 search
- **CommandRunner** - Shell command execution wrapper
- **MacDiagnosticsService** - macOS hardware/performance/security diagnostics
- **DatabaseDiagnosticsService** - Remote PostgreSQL/Redis/Keycloak diagnostics
- **NetworkDiagnosticsService** - Port scanning, firewall checks
- **UbuntuAdminService** - Ubuntu administration via SSH
- **DebianAdminService** - Debian administration via SSH
- **WindowsAdminService** - Windows administration via PowerShell remoting
- **And 19 more...**

Each service accepts dependencies via constructor injection:

```typescript
export class MyService {
  public constructor(private readonly runner: CommandRunner) {}

  public async execute(params: MyParams): Promise<MyResult> {
    const result = await this.runner.run("command", { requiresSudo: false });
    return this.parseResult(result);
  }
}
```

### Tool Registration (`src/tools/registerTools.ts`)

All MCP tools registered in `registerTools()` with:
- Zod schema for input validation
- Service method invocation
- Standardized error handling
- Both text and structuredContent in responses

### Database Layer

#### Local SQLite (`src/services/sqlitePlanner.ts`, `src/services/commandQueue.ts`)

**SQLite Databases** (local cache and offline resilience):

1. **mcp_plan.db** - Structured thinking cache:
```sql
-- Structured thinking storage
CREATE TABLE thoughts (
  id TEXT PRIMARY KEY,
  stage TEXT,
  thought TEXT,
  timestamp TEXT,
  ordering INTEGER,
  metadata TEXT
);

-- Workspace Markdown ingestion
CREATE TABLE markdown_resources (
  path TEXT PRIMARY KEY,
  title TEXT,
  sections TEXT,
  tags TEXT,
  latest_update TEXT,
  content TEXT
);

-- Full-text search
CREATE VIRTUAL TABLE markdown_resources_fts
USING fts5(path, title, content, tokenize='porter');
```

2. **mcp_command_queue.db** - Offline command persistence:
```sql
-- Command queue for offline resilience
CREATE TABLE command_queue (
  job_id TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  params TEXT NOT NULL,  -- JSON
  requested_capabilities TEXT NOT NULL,  -- JSON array
  target_agent_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued', 'picked', 'executing', 'completed', 'failed', 'timeout')),
  priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TEXT NOT NULL,
  picked_at TEXT,
  completed_at TEXT,
  result TEXT,  -- JSON
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);
```

**Features**:
- WAL (Write-Ahead Logging) mode for concurrency
- Auto-ingests workspace Markdown files on startup
- FTS5 full-text search for fast retrieval
- Offline command queue with retry logic
- Priority-based command ordering

#### Production PostgreSQL (In Development)

**Production database** (when connected):

```sql
-- Source of truth for structured thinking
CREATE TABLE thought_sessions (
  session_id UUID PRIMARY KEY,
  origin TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ
);

CREATE TABLE structured_thoughts (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES thought_sessions(session_id),
  stage TEXT,
  content JSONB NOT NULL,
  metadata JSONB,
  score NUMERIC,
  needs_follow_up BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent registry and coordination
CREATE TABLE mcp_agents (
  agent_id UUID PRIMARY KEY,
  mac_address TEXT UNIQUE,
  hostname TEXT,
  capabilities JSONB,
  last_seen_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT now()
);

-- Distributed command queue
CREATE TABLE command_queue (
  job_id UUID PRIMARY KEY,
  agent_id UUID REFERENCES mcp_agents(agent_id),
  requested_capabilities TEXT[],
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  picked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

**Sync Service** (`src/services/databaseSync.ts`):
- Background worker syncing local SQLite → production PostgreSQL
- Conflict resolution strategies (last-write-wins, manual, merge)
- Offline queue draining when connection restored

---

## Command Execution Pattern

### CommandRunner (`src/utils/commandRunner.ts`)

**CRITICAL**: All shell commands MUST use `CommandRunner`, never `child_process.exec` directly.

```typescript
// ✅ CORRECT
const result = await this.runner.run("df -h", {
  requiresSudo: false,
  timeoutMs: 10000,
  cwd: "/tmp"
});

// ❌ WRONG - Never do this
import { exec } from "node:child_process";
exec("df -h", callback);
```

**CommandRunner features**:
- Auto-sudo prefixing when `requiresSudo: true` (if `IT_MCP_ALLOW_SUDO !== "false"`)
- Timeout enforcement (configurable via `timeoutMs`, no default)
- MaxBuffer limit (10MB)
- Debug logging of all commands
- Throws `CommandExecutionError` with full context on failures

---

## Error Handling Standards

### CommandExecutionError

All command failures throw `CommandExecutionError` preserving full context:

```typescript
export class CommandExecutionError extends Error {
  public readonly result: CommandResult;

  public constructor(message: string, result: CommandResult) {
    super(message);
    this.name = "CommandExecutionError";
    this.result = result;  // Contains: command, stdout, stderr, exitCode
  }
}
```

### Tool Error Handling Pattern

Every tool uses the standardized `handleError` helper (registerTools.ts:96-132):

```typescript
server.registerTool("my-tool", schema, async (params) => {
  try {
    const result = await deps.myService.execute(params);
    return {
      content: [{ type: "text", text: formatResult(result) }],
      structuredContent: result
    };
  } catch (error) {
    return handleError(error);  // Standardized error response
  }
});
```

The `handleError` function returns consistent error format with both text and structured data.

---

## Structured Thinking

### 5-Stage Cognitive Framework

**Stages**:
1. `problem_definition` - Define problem, constraints, goals
2. `research` - Gather information, explore codebase
3. `analysis` - Break down problem, identify patterns
4. `synthesis` - Combine insights, design solution
5. `conclusion` - Finalize decisions, document rationale

### Usage

```typescript
const thinkingService = new StructuredThinkingService(planner);

// Get framework
const framework = thinkingService.getFramework({ includeExamples: true });

// Track thoughts
const result = thinkingService.trackThoughts([
  {
    stage: "problem_definition",
    thought: "Need to implement X feature",
    metadata: {
      importance: "high",
      tags: ["feature", "implementation"],
      devOpsCategory: "build"
    }
  },
  {
    stage: "research",
    thought: "Found existing Y service that can be extended",
    metadata: {
      importance: "medium",
      tags: ["architecture", "existing-code"],
      references: ["src/services/y.ts:42"]
    }
  }
], true);

// Export to JSON
const exported = thinkingService.exportThoughts(result, {
  format: "json",
  includeMetadata: true
});
```

### Auto-Bootstrap

On first run, `SQLitePlannerService` auto-ingests all `*.md` files from the workspace into a searchable FTS5 index.

---

## Service Development Guidelines

### Standard Service Pattern

```typescript
export class MyService {
  public constructor(private readonly runner: CommandRunner) {}

  public async myOperation(input: string): Promise<MyResult> {
    const result = await this.runner.run(`mycommand ${input}`, {
      requiresSudo: false,
      timeoutMs: 30000
    });
    return this.parseResult(result);
  }

  // Safe wrapper for graceful degradation
  private async safeCommand(cmd: string, requiresSudo: boolean): Promise<SafeResult> {
    try {
      const result = await this.runner.run(cmd, { requiresSudo });
      return {
        command: cmd,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
        success: true
      };
    } catch (error) {
      const execution = error instanceof CommandExecutionError ? error.result : undefined;
      return {
        command: cmd,
        stdout: execution?.stdout ?? "",
        stderr: execution?.stderr ?? (error instanceof Error ? error.message : String(error)),
        exitCode: execution?.code ?? null,
        success: false
      };
    }
  }
}
```

### Dependency Injection

Services are instantiated in `src/index.ts`:

```typescript
const runner = new CommandRunner(allowSudo);
const sshService = new SshService(runner);
const planner = new SQLitePlannerService();
const structuredThinking = new StructuredThinkingService(planner);

const services = {
  systemInfo: new SystemInfoService(runner),
  cleanup: new CleanupService(runner),
  structuredThinking,
  // ... 26 more services
};
```

---

## Remote Execution

### SSH-Based Execution

For remote Linux/macOS administration, use `SshService`:

```typescript
const result = await sshService.exec(
  "192.168.1.100",
  "admin",
  "df -h",
  {
    port: 22,
    identityFile: "~/.ssh/id_rsa"
  }
);
```

Services like `MacDiagnosticsService` and `DatabaseDiagnosticsService` support both local and remote modes.

### Windows PowerShell Remoting

`WindowsAdminService` uses PowerShell 7 (`pwsh`) with `Invoke-Command`:

```typescript
const result = await this.runner.run(
  `pwsh -Command "Invoke-Command -ComputerName ${host} -ScriptBlock { Get-Service }"`,
  { requiresSudo: false, timeoutMs: 60000 }
);
```

**Requirements**:
- PowerShell 7 (`pwsh`) installed locally
- WinRM enabled on target Windows host
- Credentials via `$env:WINDOWS_REMOTE_PASSWORD`

### Integration Services (In Development)

#### DatabaseSyncService (`src/services/databaseSync.ts`)

Manages synchronization between local SQLite cache and production PostgreSQL:

```typescript
const syncService = new DatabaseSyncService(planner, {
  postgresConnectionString: process.env.POSTGRES_URL,
  syncIntervalMs: 60000,  // 1 minute
  batchSize: 50,
  conflictResolution: "last-write-wins",
  enableAutoSync: true
});

// Start background sync worker
syncService.startAutoSync();

// Manual sync trigger
const status = await syncService.syncNow();
```

**Features**:
- Background worker pushing local changes to PostgreSQL
- Conflict resolution strategies
- Offline queue draining
- Health monitoring

#### CommandQueueService (`src/services/commandQueue.ts`)

Local command queue with priority ordering and retry logic:

```typescript
const queue = new CommandQueueService("./mcp_command_queue.db");

// Enqueue command
const command = queue.enqueue({
  jobId: randomUUID(),
  toolName: "system-overview",
  params: { topProcesses: 10 },
  requestedCapabilities: ["local-shell"],
  priority: "high",
  maxRetries: 3
});

// Dequeue for processing
const next = queue.dequeue();
if (next) {
  // Execute command
  queue.updateStatus(next.jobId, "executing");
  // ... execute ...
  queue.updateStatus(next.jobId, "completed", result);
}
```

#### AutoDiscoveryService (`src/services/autoDiscovery.ts`)

Auto-registration and heartbeat with central registry:

```typescript
const discovery = new AutoDiscoveryService(
  capabilities,  // ['local-shell', 'local-sudo', 'ssh-linux']
  tools,         // All registered tool names
  process.env.IT_MCP_REGISTRY_URL
);

// Register on startup
const registration = await discovery.register();

// Start heartbeat (every 30s)
discovery.startHeartbeat();

// Cleanup on shutdown
await discovery.deregister();
```

**OpenAPI Integration**: Awaiting server specs for full implementation.

#### KeycloakAuthService (`src/services/keycloakAuth.ts`)

JWT token management for API authentication:

```typescript
const authService = new KeycloakAuthService({
  serverUrl: "https://acdev.host:8080",
  realm: "mcp-agents",
  clientId: "it-mcp-server",
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET
});

// Authenticate (client credentials flow)
const tokenSet = await authService.authenticate();

// Get valid token (auto-refresh if expired)
const token = await authService.getAccessToken();

// Use in API calls
const response = await fetch(apiUrl, {
  headers: { Authorization: `Bearer ${token}` }
});
```

**Capability Mapping**: Keycloak roles → IT-MCP capabilities via JWT scopes.

### RemoteAgentService - STUB (Awaiting OpenAPI Specs)

**Current State**: Basic stub returning "not yet implemented"

**Planned Integration**:
```typescript
// Future: OpenAPI-generated client
const agentService = new RemoteAgentService(authService, queue);

const response = await agentService.dispatch({
  tool: "ubuntu-admin",
  payload: { action: "update-packages" },
  capability: "ssh-linux"
});
```

Will be implemented once server OpenAPI specifications are available.

---

## Code Style & TypeScript Conventions

- **Strict TypeScript**: `strict: true` in `tsconfig.json`
- **ES Modules**: `type: "module"` in `package.json`, use `.js` extensions in imports
- **Readonly by default**: All interface properties `readonly` unless mutation required
- **Two-space indentation**, trailing semicolons
- **PascalCase** for service classes, **camelCase** for helpers/methods
- **No floating promises**: Resolve or explicitly `void` promises

**Example**:

```typescript
export interface MyConfig {
  readonly hostname: string;
  readonly port: number;
  readonly capabilities: readonly string[];
}

export class MyService {
  private readonly config: MyConfig;

  public constructor(config: MyConfig) {
    this.config = config;
  }

  public async execute(): Promise<MyResult> {
    const result = await this.performOperation();
    return result;
  }
}
```

---

## Environment Variables

### Local Mode
| Variable | Default | Purpose |
|----------|---------|---------|
| `IT_MCP_ALLOW_SUDO` | `true` | Disable `sudo` auto-prefixing when `"false"` |
| `IT_MCP_CAPTURE_DIR` | `<cwd>/captures` | Directory for packet capture files |
| `IT_MCP_LOG_LEVEL` | `debug` (dev) | Winston log level |
| `WINDOWS_REMOTE_PASSWORD` | (none) | Password for PowerShell remoting |

### Distributed Mode (In Development)
| Variable | Default | Purpose |
|----------|---------|---------|
| `POSTGRES_URL` | (none) | PostgreSQL connection string |
| `IT_MCP_REGISTRY_URL` | (none) | Central registry endpoint (e.g., `https://acdev.host/api/v1`) |
| `IT_MCP_SERVER_ID` | auto-generated | Unique server identifier (persists across restarts) |
| `KEYCLOAK_SERVER_URL` | (none) | Keycloak server (e.g., `https://acdev.host:8080`) |
| `KEYCLOAK_REALM` | `mcp-agents` | Keycloak realm |
| `KEYCLOAK_CLIENT_ID` | (none) | OAuth2 client ID for IT-MCP |
| `KEYCLOAK_CLIENT_SECRET` | (none) | OAuth2 client secret |
| `REDIS_URL` | (none) | Redis connection for pub/sub (optional) |

---

## Adding New MCP Tools

1. **Create or extend service** in `src/services/`
   ```typescript
   export class MyService {
     public constructor(private readonly runner: CommandRunner) {}

     public async myOperation(params: MyParams): Promise<MyResult> {
       const result = await this.runner.run("mycommand", { requiresSudo: false });
       return this.parseResult(result);
     }
   }
   ```

2. **Wire service in src/index.ts**
   ```typescript
   const services = {
     // ... existing services
     myService: new MyService(runner),
   };
   ```

3. **Register tool in src/tools/registerTools.ts**
   ```typescript
   const myToolSchema = z.object({
     param1: z.string(),
     param2: z.number().optional(),
   });

   server.registerTool("my-tool", myToolSchema, async (params) => {
     try {
       const result = await deps.myService.myOperation(params);
       return {
         content: [{ type: "text", text: formatResult(result) }],
         structuredContent: result
       };
     } catch (error) {
       return handleError(error);
     }
   });
   ```

4. **Update README.md** - Add row to MCP Tools table

5. **Test**
   ```bash
   npm run build && npm run dev
   # Test via MCP client (Claude Desktop, etc.)
   ```

---

## Security Considerations

### Sudo Handling

Commands are prefixed with `sudo` when `requiresSudo: true` and `IT_MCP_ALLOW_SUDO !== "false"`.

**Disable sudo**: Set `IT_MCP_ALLOW_SUDO=false` before starting server.

### Dry-Run Mode

Destructive operations (like `cleanup-runbook`) default to `dryRun: true`:

```typescript
server.registerTool("cleanup-runbook", schema, async ({ dryRun = true, ...params }) => {
  if (dryRun) {
    return {
      content: [{ type: "text", text: `Would execute:\n${commands.join("\n")}` }],
      structuredContent: { dryRun: true, commands }
    };
  }

  // Actually execute
  const results = await Promise.all(commands.map(cmd => this.runner.run(cmd)));
  return { content: [...], structuredContent: { dryRun: false, results } };
});
```

### Remote Credentials

- **SSH**: Uses local SSH config and keys (`~/.ssh/id_rsa`)
- **Windows**: Requires `$env:WINDOWS_REMOTE_PASSWORD` for PowerShell remoting
- **Never commit secrets or credentials**

---

## Platform-Specific Notes

- **macOS tools**: `system-overview`, `list-launch-daemons`, `wireless-diagnostics`, `mac-diagnostics`, `packet-capture` require macOS (may need sudo)
- **Linux administration**: `ubuntu-admin`, `debian-admin` execute commands via SSH
- **Windows administration**: `windows-admin` requires PowerShell 7 (`pwsh`) and WinRM
- **Microsoft 365**: `m365-intune-summary` requires `m365` CLI installed and authenticated
- **Security scanning**: `scan_security_vulnerabilities` can auto-install CodeQL/OpenVAS

---

## Testing

No automated test suite currently exists. To add tests:

1. Create `*.test.ts` files alongside features (e.g., `src/services/__tests__/networkDiagnostics.test.ts`)
2. Add `npm test` script using Node's `--test` runner
3. Include manual smoke-test steps in PR descriptions

**Test examples provided**:
- `test-database.ts` - SQLite schema and FTS5 functionality
- `test-structured-thinking.ts` - StructuredThinkingService integration

---

## Key Dependencies

- **@modelcontextprotocol/sdk** - MCP server protocol (stdio transport, tool registration)
- **better-sqlite3** - SQLite backend for structured thinking
- **zod** - Runtime schema validation
- **winston** - Structured logging
- **fs-extra** - Filesystem utilities

---

## Related Documentation

### Production Infrastructure Docs (MD REF)

The `/Users/alex/Downloads/MD REF/` directory contains documentation for the **production infrastructure being built** that IT-MCP will integrate with:

- **agents.md** - Agent coordination architecture (PostgreSQL, Redis, Keycloak, NGINX)
- **retry - provide one single md.md** - Server build & ops baseline at `server.acdev.host` (Ubuntu 24.04)

**Key Infrastructure Components** (being deployed):
- **PostgreSQL 16**: Database at `server.acdev.host` for `mcp-st-db` (structured thoughts, agent registry, command queue)
- **Keycloak**: Authentication server at `https://acdev.host:8080` for JWT tokens and RBAC
- **Redis**: Cache and pub/sub for real-time agent heartbeats and command dispatch
- **NGINX**: Reverse proxy with TLS termination for API gateway
- **Agent Registry**: Central coordination service for distributed IT-MCP instances

**Integration Status**:
- ✅ **DatabaseSyncService**: Ready to connect when PostgreSQL available
- ✅ **CommandQueueService**: Local SQLite queue operational, ready for remote sync
- ✅ **AutoDiscoveryService**: Awaiting OpenAPI specs for registration endpoint
- ✅ **KeycloakAuthService**: Awaiting Keycloak realm configuration
- ⏳ **RemoteAgentService**: Stub awaiting server API specification

### Next Integration Steps

1. **Server Team Provides**:
   - OpenAPI specification for agent registration API (`/api/v1/servers/register`, `/api/v1/servers/{id}/heartbeat`)
   - PostgreSQL connection string and schema setup scripts
   - Keycloak realm configuration (client credentials, roles, scopes)
   - Redis pub/sub channel specifications

2. **IT-MCP Implements**:
   - HTTP client generation from OpenAPI specs
   - PostgreSQL connector in DatabaseSyncService
   - Keycloak authentication flow activation
   - Command queue sync to PostgreSQL
   - Redis pub/sub integration for real-time dispatch

3. **Testing & Integration**:
   - Offline → online transition testing
   - Multi-instance coordination testing
   - Load testing with distributed command queue
   - Failover and recovery scenarios

---

**End of Guide**
