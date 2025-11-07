# Getting Started with SERVER-MCP

This guide will help you set up the SERVER-MCP development environment and begin Phase 2 implementation.

---

## Prerequisites

- **Node.js 18.18+** installed
- **PostgreSQL 16+** running locally (for testing)
- **Redis 7+** running locally (for testing)
- **TypeScript** knowledge
- **Git** for version control

---

## Initial Setup

### 1. Install Dependencies

```bash
cd /Users/alex/Projects/SERVER-MCP
npm install
```

This will install:
- `pg` (PostgreSQL client)
- `ioredis` (Redis client)
- `@keycloak/keycloak-admin-client` (Keycloak Admin API)
- `@modelcontextprotocol/sdk` (MCP protocol)
- `winston` (logging)
- `zod` (schema validation)
- `better-sqlite3` (SQLite for local cache)
- And development dependencies (TypeScript, ESLint, etc.)

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Minimum configuration for local testing**:

```bash
# PostgreSQL (local)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_local_password
POSTGRES_DB=postgres

# Redis (local)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server-MCP
SERVER_MCP_ALLOW_SUDO=true
SERVER_MCP_LOG_LEVEL=debug
```

**Note**: Keycloak and IT-MCP integration can be configured later.

### 3. Verify TypeScript Compilation

```bash
npm run build
```

Expected output:
```
> server-mcp@1.0.0 build
> tsc

(No errors - compiles successfully)
```

If you see errors, check:
- All `.ts` files have correct import paths with `.js` extensions
- `tsconfig.json` is configured correctly
- Dependencies are installed

---

## Testing Core Services

### Test PostgresManagerService

Create a test file `test-postgres.ts`:

```typescript
import { PostgresManagerService } from "./src/services/postgresManager.js";
import { CommandRunner } from "./src/utils/commandRunner.js";

const runner = new CommandRunner(true);
const postgresManager = new PostgresManagerService(runner);

async function test() {
  try {
    console.log("Testing PostgreSQL connection...");

    const connections = await postgresManager.getActiveConnections();
    console.log("Active connections:", connections);

    const replication = await postgresManager.getReplicationLag();
    console.log("Replication:", replication);

    await postgresManager.close();
    console.log("Test completed!");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

test();
```

Run test:
```bash
node --loader ts-node/esm test-postgres.ts
```

### Test RedisManagerService

Create a test file `test-redis.ts`:

```typescript
import { RedisManagerService } from "./src/services/redisManager.js";

const redisManager = new RedisManagerService();

async function test() {
  try {
    console.log("Testing Redis connection...");

    const pong = await redisManager.ping();
    console.log("Ping:", pong);

    const info = await redisManager.getInfo();
    console.log("Redis info:", info);

    const memory = await redisManager.getMemoryStats();
    console.log("Memory stats:", memory);

    await redisManager.close();
    console.log("Test completed!");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

test();
```

Run test:
```bash
node --loader ts-node/esm test-redis.ts
```

---

## Phase 2: Next Steps

### Task 1: Migrate ServerAdminService

**Goal**: Adapt IT-MCP's `UbuntuAdminService` for on-server use (remove SSH layer)

**Steps**:

1. **Copy source file**:
   ```bash
   cp /Users/alex/Projects/IT-MCP/src/services/ubuntuAdmin.ts \
      /Users/alex/Projects/SERVER-MCP/src/services/serverAdmin.ts
   ```

2. **Remove SSH execution wrapper**:
   - Find all instances of `SshService` dependency
   - Replace SSH command execution with direct `CommandRunner` calls
   - Remove `host`, `username`, `port` parameters from methods
   - Update class name: `UbuntuAdminService` → `ServerAdminService`

3. **Add error recovery**:
   - Implement `autoRestartService()` method for failed services
   - Add `healthCheck()` method for continuous monitoring

4. **Test**:
   ```bash
   npm run build
   # Create test file for ServerAdminService
   ```

**Example transformation**:

```typescript
// BEFORE (IT-MCP with SSH)
public async getServiceStatus(
  host: string,
  username: string,
  serviceName: string
): Promise<ServiceStatus> {
  const command = `systemctl status ${serviceName}`;
  const result = await this.ssh.exec(host, username, command);
  return this.parseServiceStatus(result);
}

// AFTER (SERVER-MCP local)
public async getServiceStatus(
  serviceName: string
): Promise<ServiceStatus> {
  const result = await this.runner.run(`systemctl status ${serviceName}`, {
    requiresSudo: false,
    timeoutMs: 10000
  });
  return this.parseServiceStatus(result);
}
```

### Task 2: Simplify DatabaseDiagnosticsService

**Goal**: Remove remote mode, keep only local diagnostics

**Steps**:

1. **Copy source file**:
   ```bash
   cp /Users/alex/Projects/IT-MCP/src/services/databaseDiagnostics.ts \
      /Users/alex/Projects/SERVER-MCP/src/services/databaseDiagnostics.ts
   ```

2. **Remove remote mode**:
   - Delete `runRemote()` method
   - Remove `SshService` dependency from constructor
   - Remove `mode`, `host`, `username` parameters
   - Keep all 6 diagnostic suites unchanged

3. **Update imports**:
   - Remove `import { SshService }` line
   - Keep `CommandRunner` import

4. **Test**:
   ```bash
   npm run build
   ```

### Task 3: Create KeycloakManagerService

**Goal**: Implement Keycloak Admin API client

**Steps**:

1. **Create new file**: `src/services/keycloakManager.ts`

2. **Implement**:
   ```typescript
   import KcAdminClient from "@keycloak/keycloak-admin-client";

   export class KeycloakManagerService {
     private readonly kcAdmin: KcAdminClient;

     public constructor() {
       this.kcAdmin = new KcAdminClient({
         baseUrl: process.env.KEYCLOAK_BASE_URL,
         realmName: process.env.KEYCLOAK_REALM ?? "mcp-agents"
       });
     }

     public async authenticate(): Promise<void> {
       await this.kcAdmin.auth({
         grantType: "client_credentials",
         clientId: process.env.KEYCLOAK_CLIENT_ID!,
         clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!
       });
     }

     public async getRealmStats(realm: string): Promise<RealmStats> {
       // Implement using this.kcAdmin.realms.findOne({ realm })
     }

     // ... more methods
   }
   ```

3. **Test** (requires Keycloak running):
   ```bash
   npm run build
   node --loader ts-node/esm test-keycloak.ts
   ```

---

## Development Workflow

### Watch Mode

For active development, use watch mode to automatically recompile on changes:

```bash
npm run build:watch
```

In another terminal, run tests:

```bash
node --loader ts-node/esm test-postgres.ts
```

### Linting

Before committing code:

```bash
npm run lint
```

Fix linting errors automatically:

```bash
npm run lint -- --fix
```

### Git Workflow

```bash
# Initialize git repository
git init
git add .
git commit -m "Initial commit: Phase 1 foundation complete"

# Create feature branch for Phase 2
git checkout -b phase-2-core-services

# After each service implementation
git add src/services/serverAdmin.ts
git commit -m "Add ServerAdminService (adapted from UbuntuAdminService)"
```

---

## Common Issues

### Issue: "Cannot find module './logger.js'"

**Solution**: Ensure all TypeScript imports use `.js` extension (TypeScript transpiles to ES modules):

```typescript
// ✅ CORRECT
import { logger } from "../utils/logger.js";

// ❌ WRONG
import { logger } from "../utils/logger";
```

### Issue: "PostgreSQL connection refused"

**Solution**: Verify PostgreSQL is running and credentials are correct:

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Test connection manually
psql -h localhost -U postgres -c "SELECT version();"
```

### Issue: "Redis connection refused"

**Solution**: Verify Redis is running:

```bash
# Check Redis status
sudo systemctl status redis

# Test connection manually
redis-cli PING
# Expected output: PONG
```

### Issue: "Type errors in structuredThinking.ts"

**Solution**: Ensure you copied the exact file from IT-MCP. The types are interdependent.

---

## Documentation

- **README.md**: User-facing documentation
- **IMPLEMENTATION_STATUS.md**: Progress tracking
- **GETTING_STARTED.md**: This file (developer onboarding)
- **.env.example**: Configuration reference

---

## Resources

- **MCP SDK Docs**: https://modelcontextprotocol.io/docs
- **PostgreSQL Node.js**: https://node-postgres.com/
- **ioredis Docs**: https://github.com/redis/ioredis
- **Keycloak Admin Client**: https://github.com/keycloak/keycloak-nodejs-admin-client

---

## Next Phase Checklist

Once Phase 2 is complete, you should have:

- [x] `ServerAdminService` - Ubuntu server administration (no SSH)
- [x] `DatabaseDiagnosticsService` - Local-only diagnostics
- [x] `KeycloakManagerService` - Keycloak Admin API
- [x] `NginxMonitoringService` - NGINX log analysis
- [x] `SystemMetricsService` - Linux system metrics
- [x] `AutomatedMaintenanceService` - Scheduled tasks

Then proceed to **Phase 3: MCP Tool Registration**.

---

**Questions?** Review the IT-MCP codebase (`/Users/alex/Projects/IT-MCP/`) for reference implementations.

**Good luck!** 🚀
