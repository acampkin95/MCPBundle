# VSCode Structural Thinking Manager - Architecture

## System Overview

The VSCode Structural Thinking Manager is a comprehensive extension for managing structured thinking workflows with dual database backend support, real-time collaboration capabilities (stub), security monitoring (stub), and rich analytics.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         VSCode Extension Host                            │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Extension.ts (Main Entry)                     │  │
│  │  - Activation lifecycle                                            │  │
│  │  - Command registration                                            │  │
│  │  - Service initialization                                          │  │
│  │  - Onboarding check                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     UI Components (Webviews)                       │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │ ThoughtEditor   │  │ Analytics       │  │ Research        │   │  │
│  │  │                 │  │ Dashboard       │  │ Panel           │   │  │
│  │  │ - Live markdown │  │ - 4 chart types │  │ - Perplexity AI │   │  │
│  │  │ - Syntax        │  │ - Metrics       │  │ - Search        │   │  │
│  │  │   highlighting  │  │ - Auto-refresh  │  │ - Cache         │   │  │
│  │  │ - Auto-save     │  │ - Export JSON   │  │ - Context       │   │  │
│  │  │ - Metadata edit │  │ - Chart.js      │  │ - Integration   │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │ Onboarding      │  │ Security        │  │ Health          │   │  │
│  │  │ Quick Start     │  │ Alerts Panel    │  │ Dashboard       │   │  │
│  │  │                 │  │ (Wazuh stub)    │  │ (MCP servers)   │   │  │
│  │  │ - HTML guide    │  │ - Alert list    │  │ - VMI01/02D/03  │   │  │
│  │  │ - Feature docs  │  │ - Severity      │  │ - Status        │   │  │
│  │  │ - Shortcuts     │  │ - Filtering     │  │ - Metrics       │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Tree View Provider                           │  │
│  │                                                                     │  │
│  │  ThinkingProcessTreeProvider                                       │  │
│  │  - Sessions (root level)                                           │  │
│  │  - Stages (grouped thoughts)                                       │  │
│  │  - Thoughts (individual items)                                     │  │
│  │  - Auto-refresh (5 sec)                                            │  │
│  │  - Context menus                                                   │  │
│  │  - Inline actions                                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Service Layer                               │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │ DatabaseService │  │ OnboardingServ  │  │ ExportService   │   │  │
│  │  │                 │  │                 │  │                 │   │  │
│  │  │ - PostgreSQL    │  │ - Welcome msg   │  │ - JSON export   │   │  │
│  │  │ - SQLite        │  │ - Tour steps    │  │ - Markdown      │   │  │
│  │  │ - Auto fallback │  │ - Quick start   │  │ - Formatting    │   │  │
│  │  │ - Connection    │  │ - State mgmt    │  │ - Filtering     │   │  │
│  │  │   pooling       │  │ - Reset option  │  │ - Metadata      │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │  │
│  │  │ MCPClientServ   │  │ ResearchServ    │  │ SearchService   │   │  │
│  │  │                 │  │                 │  │                 │   │  │
│  │  │ - Stdio         │  │ - Perplexity    │  │ - DuckDuckGo    │   │  │
│  │  │ - SSH tunnels   │  │ - Context       │  │ - Context7      │   │  │
│  │  │ - Tool invoke   │  │ - Cache         │  │ - Playwright    │   │  │
│  │  │ - Health check  │  │ - Versioning    │  │ - Aggregation   │   │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘   │  │
│  │                                                                     │  │
│  │  ┌─────────────────┐  ┌─────────────────┐                         │  │
│  │  │ Collaboration   │  │ Security        │                         │  │
│  │  │ Service (STUB)  │  │ Monitoring      │                         │  │
│  │  │                 │  │ Service (STUB)  │                         │  │
│  │  │ - WebSocket     │  │ - Wazuh API     │                         │  │
│  │  │ - Presence      │  │ - Alerts        │                         │  │
│  │  │ - Sync          │  │ - Auth tracking │                         │  │
│  │  │ - Conflicts     │  │ - MCP rules     │                         │  │
│  │  └─────────────────┘  └─────────────────┘                         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Utility Layer                                 │  │
│  │                                                                     │  │
│  │  - CredentialService (VSCode SecretStorage)                        │  │
│  │  - Logger (OutputChannel wrapper)                                  │  │
│  │  - Error handlers                                                  │  │
│  │  - Type definitions                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Data Flow
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Data Storage Layer                              │
│                                                                          │
│  ┌──────────────────────┐              ┌──────────────────────┐         │
│  │  SQLite (Local)      │              │  PostgreSQL (Prod)   │         │
│  │  ~/.vscode/...       │              │  46.250.243.123      │         │
│  │                      │              │                      │         │
│  │  - mcp_plan.db       │◄────────────►│  mcp_orchestrator    │         │
│  │  - Offline cache     │  Auto-sync   │  - thought_sessions  │         │
│  │  - FTS5 search       │              │  - structured_...    │         │
│  │  - WAL mode          │              │  - Replication       │         │
│  └──────────────────────┘              └──────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ External Integrations
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        External Services (Future)                        │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌───────────────┐ │
│  │  MCP Servers         │  │  Wazuh SIEM          │  │  Collaboration│ │
│  │  (VMI01/02D/03)      │  │  154.26.158.31:9443  │  │  WebSocket    │ │
│  │                      │  │                      │  │  ws://VMI01:  │ │
│  │  - itjsst-mcp        │  │  - Security alerts   │  │  3000         │ │
│  │  - mcp-orchestrator  │  │  - Auth failures     │  │               │ │
│  │  - perplexity-mcp    │  │  - MCP monitoring    │  │  - Real-time  │ │
│  │                      │  │  - JWT auth          │  │  - Presence   │ │
│  │  - SSH/stdio         │  │  - (STUB)            │  │  - Conflicts  │ │
│  │  - Health checks     │  │                      │  │  - (STUB)     │ │
│  └──────────────────────┘  └──────────────────────┘  └───────────────┘ │
│                                                                          │
│  ┌──────────────────────┐  ┌──────────────────────┐                    │
│  │  Perplexity API      │  │  Keycloak SSO        │                    │
│  │  (Research)          │  │  (Auth - Future)     │                    │
│  │                      │  │                      │                    │
│  │  - Deep research     │  │  - JWT tokens        │                    │
│  │  - Context-aware     │  │  - RBAC roles        │                    │
│  │  - Response cache    │  │  - Client creds      │                    │
│  └──────────────────────┘  └──────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Interaction Flows

### 1. Thought Editing Flow

```
User clicks "Edit" on thought
         │
         ▼
ThinkingProcessTreeProvider fires command
         │
         ▼
extension.ts receives editThought command
         │
         ▼
ThoughtEditor.createOrShow()
         │
         ├──► DatabaseService.getThought() (fetch current data)
         │
         ├──► Create webview panel with Thought data
         │
         └──► Render HTML with marked.js + highlight.js
                      │
                      │ User edits content
                      │
                      ▼
              Auto-save after 2 sec (debounced)
                      │
                      ▼
              DatabaseService.updateThought()
                      │
                      ├──► PostgreSQL (if connected)
                      │    └──► parameterized UPDATE
                      │
                      └──► SQLite (fallback)
                           └──► safe string escaping
                      │
                      ▼
              Refresh ThinkingProcessTreeProvider
                      │
                      ▼
              Tree view updates with new data
```

### 2. Analytics Dashboard Flow

```
User presses Cmd+Shift+A / Ctrl+Shift+A
         │
         ▼
extension.ts receives showAnalytics command
         │
         ▼
AnalyticsDashboard.createOrShow()
         │
         ├──► DatabaseService.getSessions(1000)
         │
         ├──► DatabaseService.getThoughts() for each session
         │
         ├──► calculateMetrics()
         │    ├──► Total sessions/thoughts
         │    ├──► Average quality score
         │    ├──► Completion rate
         │    ├──► Tag frequency
         │    ├──► Stage distribution
         │    └──► Sessions over time
         │
         ├──► Create webview panel
         │
         └──► Render HTML with Chart.js
              ├──► Line chart: Sessions over time
              ├──► Bar chart: Stage distribution
              ├──► Radar chart: Quality by stage
              └──► Bar chart: Tag frequency
                      │
                      │ Auto-refresh every 30 sec
                      │
                      ▼
              Re-fetch data and update charts
```

### 3. Onboarding Flow

```
Extension activation
         │
         ▼
OnboardingService.checkAndShowOnboarding()
         │
         ▼
Check globalState for completion/dismissal
         │
         ├──► If completed or dismissed → Skip
         │
         └──► If first-time → Show welcome message
                      │
                      ├──► "Start Tour" → Interactive 5-step tour
                      │    ├──► Step 1: Show sidebar
                      │    ├──► Step 2: Create session guide
                      │    ├──► Step 3: Edit thought guide
                      │    ├──► Step 4: Research panel guide
                      │    └──► Step 5: Analytics dashboard
                      │              │
                      │              ▼
                      │         Mark as completed in globalState
                      │
                      ├──► "Quick Start Guide" → HTML webview
                      │    ├──► Core concepts
                      │    ├──► Keyboard shortcuts
                      │    ├──► Feature documentation
                      │    └──► Configuration guide
                      │
                      ├──► "Skip" → Show again next time
                      │
                      └──► "Don't Show Again" → Mark dismissed
```

### 4. Database Connection Flow

```
DatabaseService initialization
         │
         ▼
Read configuration: database.mode
         │
         ├──► Mode: "postgresql"
         │    └──► Connect to PostgreSQL only
         │
         ├──► Mode: "sqlite"
         │    └──► Use SQLite only
         │
         └──► Mode: "auto" (recommended)
              │
              ▼
         Try PostgreSQL connection
              │
              ├──► Success → Use PostgreSQL
              │    ├──► Create connection pool (pg.Pool)
              │    ├──► Max connections: 10
              │    ├──► Idle timeout: 30s
              │    └──► Set currentMode = 'postgresql'
              │
              └──► Failure → Fallback to SQLite
                   ├──► Log fallback reason
                   ├──► Initialize SQLite at ~/.vscode/...
                   ├──► Create tables if not exist
                   └──► Set currentMode = 'sqlite'
                        │
                        ▼
                   Extension operates normally
                   (transparent to user)
```

### 5. Keyboard Shortcut Flow

```
User presses Cmd+Shift+N / Ctrl+Shift+N
         │
         ▼
VSCode checks keybindings
         │
         ├──► Context: !editorFocus → Match
         │
         └──► Execute command: structuralThinking.createSession
              │
              ▼
extension.ts receives command
         │
         ▼
Show input box: "Enter session name"
         │
         ▼
DatabaseService.createSession()
         │
         ▼
ThinkingProcessTreeProvider.refresh()
         │
         ▼
Tree view shows new session
         │
         ▼
Show success notification: "Session created"
```

## Data Models

### Core Entities

```typescript
interface ThoughtSession {
  readonly sessionId: string;
  readonly origin: string;
  readonly projectName: string | null;
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
  readonly thoughtCount: number;
}

interface StructuredThought {
  readonly thoughtId: string;
  readonly sessionId: string;
  readonly stage: CognitiveStage;
  readonly content: string;
  readonly qualityScore?: number;
  readonly metadata?: ThoughtMetadata;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
}

interface ThoughtMetadata {
  readonly tags?: readonly string[];
  readonly importance?: 'low' | 'medium' | 'high' | 'critical';
  readonly references?: readonly string[];
  readonly attachments?: readonly string[];
  readonly customFields?: Record<string, unknown>;
}

type CognitiveStage =
  | 'problem_definition'
  | 'research'
  | 'analysis'
  | 'synthesis'
  | 'conclusion'
  | 'reflection'
  | 'implementation'
  | 'validation';
```

### Database Schemas

**PostgreSQL (Production)**:
```sql
CREATE TABLE thought_sessions (
  session_id UUID PRIMARY KEY,
  origin TEXT NOT NULL,
  project_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE structured_thoughts (
  thought_id UUID PRIMARY KEY,
  session_id UUID REFERENCES thought_sessions(session_id),
  stage TEXT NOT NULL,
  content TEXT NOT NULL,
  quality_score NUMERIC(5,2),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_thoughts_session ON structured_thoughts(session_id);
CREATE INDEX idx_thoughts_stage ON structured_thoughts(stage);
CREATE INDEX idx_thoughts_created ON structured_thoughts(created_at DESC);
```

**SQLite (Local)**:
```sql
CREATE TABLE thought_sessions (
  session_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  project_name TEXT,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE TABLE structured_thoughts (
  thought_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  content TEXT NOT NULL,
  quality_score REAL,
  metadata TEXT, -- JSON string
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY(session_id) REFERENCES thought_sessions(session_id)
);

CREATE INDEX idx_thoughts_session ON structured_thoughts(session_id);
CREATE INDEX idx_thoughts_stage ON structured_thoughts(stage);
```

## Security Architecture

### Content Security Policy (CSP)

All webviews use strict CSP with nonce-based script execution:

```typescript
const nonce = getNonce(); // Cryptographically random

const csp = `
  default-src 'none';
  style-src ${webview.cspSource} 'unsafe-inline';
  script-src 'nonce-${nonce}';
  img-src ${webview.cspSource} https:;
  font-src ${webview.cspSource};
`;

// In HTML:
<meta http-equiv="Content-Security-Policy" content="${csp}">
<script nonce="${nonce}">/* allowed */</script>
```

### Credential Management

```
┌─────────────────────────────────┐
│  User configures database       │
│  settings in VSCode preferences │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  CredentialService prompts      │
│  for sensitive credentials      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  VSCode SecretStorage API       │
│  - Encrypted storage            │
│  - OS keychain integration      │
│  - Per-workspace isolation      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  DatabaseService retrieves      │
│  credentials securely           │
│  - Never logged                 │
│  - Never in plaintext files     │
└─────────────────────────────────┘
```

## Performance Optimizations

### 1. Debouncing

- **Auto-save**: 2 seconds after last keystroke
- **Tree refresh**: 300ms after database changes
- **Chart updates**: 500ms after data changes
- **Search queries**: 300ms after typing stops

### 2. Lazy Loading

- **Webviews**: Created only when needed
- **Charts**: Initialized on first render
- **Tree items**: Loaded on expansion (not preloaded)

### 3. Caching

- **Database queries**: In-memory cache for sessions (5 min TTL)
- **Research responses**: Persistent cache in database
- **MCP health status**: Cached for 30 seconds

### 4. Connection Pooling

```typescript
// PostgreSQL pool configuration
const pool = new Pool({
  max: 10,              // Max connections
  idleTimeoutMillis: 30000,  // Close idle after 30s
  connectionTimeoutMillis: 2000,  // Fail fast if unavailable
});
```

## Error Handling Strategy

### 1. Database Errors

```
Database operation fails
         │
         ▼
Check error type
         │
         ├──► Connection error
         │    └──► Fallback to SQLite (if Auto mode)
         │         └──► Log fallback reason
         │              └──► Show user notification
         │
         ├──► Query error
         │    └──► Log detailed error
         │         └──► Show user-friendly message
         │              └──► Suggest recovery (check connection)
         │
         └──► Constraint violation
              └──► Log validation error
                   └──► Show specific field error
                        └──► Suggest correction
```

### 2. Webview Errors

```
Webview operation fails
         │
         ▼
Catch in message handler
         │
         ├──► Invalid data → Show validation error in webview
         ├──► Network error → Show retry button
         ├──► Permission error → Show permission request
         └──► Unknown error → Log to output channel
                             Show generic error message
```

### 3. MCP Communication Errors

```
MCP tool invocation fails
         │
         ▼
Check error type
         │
         ├──► Timeout → Retry with exponential backoff
         ├──► Auth error → Refresh credentials, retry
         ├──► Network error → Check connection, fallback
         └──► Server error → Log, show error to user
```

## Testing Strategy

### Unit Tests

```
services/__tests__/
├── DatabaseService.test.ts
├── ExportService.test.ts
├── MCPClientService.test.ts
├── ResearchService.test.ts
├── SearchService.test.ts
└── CredentialService.test.ts
```

### Integration Tests (Planned)

```
tests/integration/
├── thought-editing.test.ts
├── analytics-calculation.test.ts
├── database-fallback.test.ts
├── onboarding-flow.test.ts
└── keyboard-shortcuts.test.ts
```

### E2E Tests (Planned)

```
tests/e2e/
├── full-user-journey.test.ts
├── multi-database-mode.test.ts
└── error-recovery.test.ts
```

## Deployment Architecture

```
Developer Machine                   Production Infrastructure
┌────────────────────┐             ┌─────────────────────────┐
│  VSCode Extension  │             │  VMI01 (Primary)        │
│                    │             │  46.250.243.123         │
│  - UI Components   │             │                         │
│  - Service Layer   │◄───────────►│  - PostgreSQL 16       │
│  - Local SQLite    │  TCP/IP     │  - MCP Orchestrator    │
│                    │  :5432      │  - Perplexity MCP      │
└────────────────────┘             │  - IT-MCP Server       │
                                   │  - Redis Cache         │
                                   └─────────────────────────┘
                                              │
                                              │ Streaming
                                              │ Replication
                                              ▼
                                   ┌─────────────────────────┐
                                   │  VMI02D (Standby)       │
                                   │  46.250.241.70          │
                                   │                         │
                                   │  - PostgreSQL 16 (R/O)  │
                                   │  - Hot Standby          │
                                   │  - Storage Layer        │
                                   └─────────────────────────┘
                                              │
                                              │ Health
                                              │ Monitoring
                                              ▼
                                   ┌─────────────────────────┐
                                   │  VMI03 (Gateway)        │
                                   │  154.26.158.31          │
                                   │                         │
                                   │  - HAProxy LB           │
                                   │  - Keycloak SSO         │
                                   │  - Prometheus           │
                                   │  - Grafana              │
                                   └─────────────────────────┘
```

## Extension Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Extension Activation                      │
│                                                              │
│  1. Read configuration                                       │
│     └── Database mode, refresh intervals, log level          │
│                                                              │
│  2. Initialize services                                      │
│     ├── DatabaseService (connect to DB)                     │
│     ├── CredentialService (load secrets)                    │
│     ├── OnboardingService (check first-time)                │
│     ├── MCPClientService (connect to MCP servers)           │
│     ├── ResearchService (Perplexity integration)            │
│     ├── SearchService (DuckDuckGo, Context7)                │
│     ├── ExportService (JSON/Markdown)                       │
│     ├── CollaborationService (stub - log warning)           │
│     └── SecurityMonitoringService (stub - log warning)      │
│                                                              │
│  3. Register UI components                                   │
│     ├── ThinkingProcessTreeProvider (sidebar)               │
│     ├── Commands (12 total)                                 │
│     ├── Keyboard shortcuts (5 bindings)                     │
│     └── Context menus (session/stage/thought)               │
│                                                              │
│  4. Check onboarding                                         │
│     └── Show welcome if first-time user                     │
│                                                              │
│  5. Start background tasks                                   │
│     ├── Tree view auto-refresh (every 5 sec)                │
│     └── Database health check (every 30 sec)                │
│                                                              │
│  6. Extension ready                                          │
│     └── Return public API (for future extensibility)        │
└─────────────────────────────────────────────────────────────┘
```

## Configuration Schema

```json
{
  "structuralThinking.database.mode": {
    "type": "string",
    "enum": ["sqlite", "postgresql", "auto"],
    "default": "auto",
    "description": "Database backend mode"
  },
  "structuralThinking.database.postgresql.host": {
    "type": "string",
    "default": "46.250.243.123",
    "description": "PostgreSQL server hostname"
  },
  "structuralThinking.database.postgresql.port": {
    "type": "number",
    "default": 5432,
    "description": "PostgreSQL server port"
  },
  "structuralThinking.database.postgresql.database": {
    "type": "string",
    "default": "mcp_orchestrator",
    "description": "PostgreSQL database name"
  },
  "structuralThinking.database.postgresql.user": {
    "type": "string",
    "default": "postgres",
    "description": "PostgreSQL username"
  },
  "structuralThinking.treeView.refreshInterval": {
    "type": "number",
    "default": 5000,
    "description": "Auto-refresh interval in milliseconds (0 to disable)"
  },
  "structuralThinking.treeView.maxThoughtsPerSession": {
    "type": "number",
    "default": 100,
    "description": "Maximum thoughts to display per session"
  },
  "structuralThinking.logging.level": {
    "type": "string",
    "enum": ["error", "warn", "info", "debug"],
    "default": "info",
    "description": "Logging verbosity level"
  },
  "structuralThinking.mcp.remoteMode": {
    "type": "boolean",
    "default": false,
    "description": "Connect to remote MCP servers via SSH"
  },
  "structuralThinking.collaboration.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable real-time collaboration features (stub)"
  },
  "structuralThinking.security.wazuh.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable Wazuh SIEM integration (stub)"
  }
}
```

## Future Architecture Extensions

### Phase 4: Collaboration

```
                    WebSocket Server (VMI01:3000)
                              │
                ┌─────────────┼─────────────┐
                │             │             │
         ┌──────▼──────┐ ┌───▼────┐ ┌─────▼──────┐
         │ User A      │ │ User B │ │ User C     │
         │ VSCode Ext  │ │ VSCode │ │ VSCode     │
         │             │ │        │ │            │
         │ - Presence  │ │ - Live │ │ - Conflict │
         │ - Sync      │ │   sync │ │   resolve  │
         └─────────────┘ └────────┘ └────────────┘
```

### Phase 5: Advanced Analytics

```
         Extension Analytics
                │
                ├──► D3.js Force-Directed Graph
                │    └── Thought relationships
                │
                ├──► Timeline Gantt Chart
                │    └── Session progression
                │
                ├──► Heatmap
                │    └── Activity patterns
                │
                └──► Sankey Diagram
                     └── Stage transitions
```

---

**Version**: 0.1.0
**Phase**: 3 Complete
**Status**: Production Ready
**Last Updated**: November 14, 2025
