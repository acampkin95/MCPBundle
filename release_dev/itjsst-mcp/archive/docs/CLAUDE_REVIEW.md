# CLAUDE.md Review - Errors Found

## Major Inaccuracies Documented

### 1. **Production Architecture** - INCORRECT ❌

**Claimed:** IT-MCP runs on Ubuntu 24.04 at `server.acdev.host` with PostgreSQL 16, Redis, NGINX, Keycloak

**Reality:** IT-MCP is a **local stdio MCP server** that uses SQLite, not a production deployment. The reference docs (agents.md, retry-provide-one-single-md.md) describe a SEPARATE server infrastructure, not IT-MCP itself.

### 2. **Database Layer** - PARTIALLY INCORRECT ❌

**Claimed:** PostgreSQL 16 database `mcp-st-db` with tables for agent coordination, command queue, etc.

**Reality:** IT-MCP uses **local SQLite** (`mcp_plan.db`) via SQLitePlannerService. There's NO PostgreSQL connection in the IT-MCP codebase. PostgreSQL is only mentioned in diagnostic tools that CHECK remote PostgreSQL servers.

**Correct:** SQLite with WAL mode, thoughts table, markdown_resources table, FTS5 search

### 3. **Agent System Architecture** - NOT IMPLEMENTED ❌

**Claimed:** Full agent coordination with registration, heartbeat, command queue, polling

**Reality:** RemoteAgentService is a **STUB** that returns "not yet implemented":

```typescript
// src/services/remoteAgent.ts
public async dispatch(task: RemoteAgentTask): Promise<RemoteAgentResponse> {
  logger.warn("Remote agent dispatch stub invoked", { task });
  return {
    status: "rejected",
    reason: "Remote agent dispatch not yet implemented.",
  };
}
```

### 4. **Keycloak Authentication** - NOT IN IT-MCP ❌

**Claimed:** Keycloak for agent identity and RBAC, JWT tokens, capability-based access control

**Reality:** IT-MCP has **NO Keycloak integration**. No authentication code at all.

### 5. **Infrastructure Stack** - NOT PART OF IT-MCP ❌

**Claimed:** NGINX reverse proxy, Redis caching, UFW firewall, Fail2Ban

**Reality:** IT-MCP is a standalone MCP server. These are part of a separate server infrastructure.

### 6. **Agent Registration/Heartbeat/Command Queue** - NOT IMPLEMENTED ❌

**Claimed:** Agents register with mac_address, send heartbeats every 30s, poll for commands, etc.

**Reality:** None of this exists in IT-MCP codebase.

### 7. **Production Deployment Checklists** - NOT APPLICABLE ❌

**Claimed:** Server-side and agent-side setup checklists, Prometheus monitoring, backup procedures

**Reality:** IT-MCP runs locally over stdio. No deployment infrastructure.

### 8. **Database Schema (PostgreSQL)** - NOT IN IT-MCP ❌

**Claimed:** thought_sessions, structured_thoughts, mcp_agents, command_queue, command_audit tables in PostgreSQL

**Reality:** Only SQLite tables exist: thoughts, markdown_resources, markdown_resources_fts

### 9. **Security Hardening** - OVERSTATED ❌

**Claimed:** Keycloak authentication, token rotation, Fail2Ban, UFW rules, capability-based access control

**Reality:** IT-MCP only has:

- Sudo handling (IT_MCP_ALLOW_SUDO)
- Dry-run mode for destructive operations
- No authentication/authorization system

### 10. **"Production-Ready"** Claims - MISLEADING ❌

**Claimed:** Production deployment on server.acdev.host, monitoring, backups, performance tuning

**Reality:** IT-MCP is a development/local tool, not deployed to production infrastructure

---

## What IS Correct ✅

1. **Core Fundamentals** - The five principles (Structured Thinking, Efficient Coding, Troubleshooting, Error Management, Project Management) are real concepts
2. **StructuredThinkingService** - Exists, works, tested ✅
3. **SQLitePlannerService** - Exists, uses SQLite with WAL mode ✅
4. **CommandRunner** - Exists, handles shell execution with sudo support ✅
5. **Service Layer Pattern** - 29 services, dependency injection ✅
6. **Error Handling** - CommandExecutionError, handleError utility ✅
7. **Diagnostic Services** - macOS, network, database (for CHECKING remote servers) ✅
8. **Build Commands** - npm run build, npm run dev, etc. ✅
9. **Code Style Conventions** - TypeScript strict mode, ES modules ✅
10. **Tool Registration Pattern** - Zod schemas, registerTools.ts ✅

---

## What Needs Clarification

### ExecutionRouter

**Currently Documented:** Maps capabilities to remote agents, SSH, WinRM

**Reality:** Exists but mostly returns "local" execution. Remote agent dispatch is stubbed.

### RemoteAgentService

**Currently Documented:** Submits commands to agent queue

**Reality:** Stub that logs warning and returns "not yet implemented"

### DatabaseDiagnosticsService

**Currently Documented:** As if it's for IT-MCP's own database

**Reality:** It's a tool to DIAGNOSE remote PostgreSQL/Redis/Keycloak servers via SSH

---

## Recommendation

CLAUDE.md should be rewritten to:

1. **Remove all production infrastructure claims** (PostgreSQL, Keycloak, NGINX, Redis, agent system)
2. **Clarify IT-MCP is a local MCP server** that runs over stdio
3. **Document only what actually exists**: SQLite, diagnostic tools, CommandRunner, service layer
4. **Mark RemoteAgentService as future/placeholder**
5. **Remove deployment/operations sections** related to production server
6. **Keep the five fundamentals** but remove false implementation claims
7. **Reference materials should be noted as "related infrastructure"** not "IT-MCP architecture"
