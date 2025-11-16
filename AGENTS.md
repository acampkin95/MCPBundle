# MCP Bundle Agents

_Last reviewed: November 14, 2025_

## Purpose
- Provide a single source of truth for every Model Context Protocol (MCP) agent that ships in this bundle.
- Capture responsibilities, run/deploy commands, and cross-agent handoffs so new contributors can onboard quickly.
- Link each agent back to the canonical directories and documents that own its implementation details.

See `README.md` for repo-wide workflows and `release_dev/shared/docs/WORKFLOW_QUICKSTART.md` for day-to-day commands.

## Shared Control Plane & Registry
- **PostgreSQL (`mcp_ecosystem`)** on VMI01 with streaming replica on VMI02D (`DEPLOYMENT_SUCCESS_SUMMARY.md`). Key tables from `release_dev/shared/docs/MCP_DEPLOYMENT_SUMMARY.md`:
  - `mcp_agents`, `agent_heartbeats`, and `mesh_topology` track registration, heartbeats, and topology metadata.
  - `command_queue` and `command_execution_log` capture dispatch + audit history.
  - `thought_sessions` and `structured_thoughts` persist structured reasoning payloads that agents share.
  - `policies`, `alert_rules`, and maintenance functions (`cleanup_old_data`) guardrail destructive work.
- **Redis 8.2.3** provides pub/sub for heartbeats, approvals, and cache invalidation.
- **Keycloak** secures HTTPS transports (realm + JWKS as documented in `MCP_HTTPS_API_MODE_GUIDE.md`).
- **Cloudflare** hosts DNS + mesh heartbeat API (see `release_dev/cloudflare-mcp/README.md`).
- **Observability:** Prometheus/Grafana pending rollout; journald + Winston log streams available today (per README files inside each agent).

## Agent Roster at a Glance
| Agent | Directory | Primary Role | Transports | Production Status |
| --- | --- | --- | --- | --- |
| IT-MCP | `release_dev/itjsst-mcp` | Desktop automation & command dispatcher for macOS + remote hosts | stdio (Claude Desktop), future HTTP relay | ✅ Running on VMI01 (`DEPLOYMENT_SUCCESS_SUMMARY.md`) |
| SERVER-MCP | `release_dev/mcp-orchestrator` | On-server orchestration for PostgreSQL, Redis, Keycloak, NGINX, structured thinking | HTTP (Keycloak), stdio | ✅ Running on VMI01 (`DEPLOYMENT_SUCCESS_SUMMARY.md`) |
| Cloudflare MCP | `release_dev/cloudflare-mcp` | Mesh heartbeat & dynamic DNS relay via Cloudflare API | HTTPS API | ⚠ Phase 5 complete, Phase 6 admin-panel wiring outstanding (see README "Next Steps") |
| SOC Hub MCP | `release_dev/soc-hub-mcp` | Unified SOC API (Wazuh, Elasticsearch, TheHive, CrowdSec) feeding dashboards | HTTP API + MCP stdio | ✅ Deployed on VMI03 per `SOC_DASHBOARDS_GUIDE.md` |
| Perplexity MCP | `release_dev/perplexity-mcp` | Business intelligence, research, and deliberation powered by Perplexity API | stdio (MCP) + optional HTTP hooks | ✅ Running on VMI01 (`DEPLOYMENT_SUCCESS_SUMMARY.md`) |

## Detailed Profiles

### 1. IT-MCP — Desktop Automation Dispatcher
- **Scope:** macOS administration, diagnostics, cleanup, networking, packet capture, Microsoft 365/Intune, VPN, remote SSH/Ubuntu health checks, and web ops tooling (`release_dev/itjsst-mcp/README.md`).
- **Tool surface (samples):** system health snapshots, cleanup runbooks, log aggregation with predicates, Homebrew hygiene, tcpdump guides, email diagnostics, `m365-intune-summary`, `panos-cli`, `ubuntu-health-report`.
- **Runtime:**
  - Install/build: `npm install && npm run build`.
  - Development stdio: `npm run dev`; production stdio: `npm start`.
  - Tests/lint: `npm run lint`, targeted dry-run executions.
- **Safety:** `IT_MCP_ALLOW_SUDO` defaults to true; set false to prohibit implicit sudo. Packet captures land in `IT_MCP_CAPTURE_DIR` (default `./captures`). Long-running tools include conservative defaults—review output before re-running with relaxed limits.
- **Logging:** Configure `LOG_AGGREGATOR_URL`/`LOG_AGGREGATOR_TOKEN` plus optional `MCP_NODE_ID` for centralized telemetry. Winston log level via `IT_MCP_LOG_LEVEL`.
- **Integration:** Acts as the command dispatcher that talks to `mcp_agents` (auto-registration) and will call `RemoteAgentService` when HTTP agents (SERVER-MCP, Cloudflare MCP, etc.) advertise capabilities. Ships with `CommandRunner`, `ExecutionRouter`, and structured thinking cache (SQLite) to keep historical plans synchronized.

### 2. SERVER-MCP — On-Server Orchestrator
- **Scope:** Runs directly on Ubuntu infra nodes, automating PostgreSQL, Redis, Keycloak, and NGINX plus local service health.
- **MCP tools:**
  - `database-diagnostics` (multi-suite health checks for Postgres/Redis/Keycloak/NGINX/system firewalls).
  - `postgres-manage` (connections, replication lag, bloat, VACUUM/reindex, backups).
  - `redis-manage`, `keycloak-manage`, `nginx-monitor`, `system-metrics`, `structured-thinking` (capture/retrieve/summarize reasoning records stored in Postgres).
- **Deployment:** lives at `/opt/mcp/services/mcp-orchestrator/` with systemd (`server-mcp.service`/`mcp-orchestrator.service`). Journald tails via `sudo journalctl -u server-mcp -f`.
- **Configuration:** copy `.env.example`, set `POSTGRES_*`, optional `POSTGRES_CONNECTION_STRING` (structured thinking sync), `REDIS_*`, and `KEYCLOAK_*` client credentials.
- **Usage:** auto-registers with the agent registry on boot; IT-MCP can dispatch via HTTPS (Keycloak-issued JWT) or via stdio for local testing.
- **Data:** writes structured thinking artifacts into `thought_sessions` + `structured_thoughts`, enabling long-running investigations anchored to the server of record.

### 3. Cloudflare MCP — Mesh Heartbeat & DNS Relay
- **Scope:** Keeps every MCP node reachable over the public internet, enforces MAC/identity gates, and persists mesh telemetry in VMI03 Postgres (`mesh_agents`, `mesh_agent_events`).
- **Capabilities:**
  - Heartbeat ingestion with MAC binding and automatic quarantine when beats stop.
  - Dynamic DNS updates to `<agent>.${CLOUDFLARE_BASE_HOSTNAME}` via the Cloudflare API.
  - Policy automation that zeroes DNS when MAC/IP drift, plus log streaming endpoints (`/panel/logs`, `/panel/logs/summary`, `/panel/logs/security`).
- **MCP tools:** `cloudflare.dns.list`, `cloudflare.dns.upsert`, `cloudflare.dns.delete`, `mesh.registry.list/get/authorize-mac`, and health monitors as listed in `release_dev/cloudflare-mcp/README.md`.
- **Configuration:** `.env.example` documents `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_BASE_HOSTNAME`, `CLOUDFLARE_ZONE_ID`, heartbeat intervals, log ingest tokens, and database DSN for VMI03.
- **Status:** Phase 5 (log streaming + mesh registry) is complete; Phase 6 requires wiring the Next.js admin panel before declaring GA. Treat as QA-only until that linkage ships.

### 4. SOC Hub MCP — Security Intelligence Fabric
- **Scope:** Aggregates Wazuh SIEM data, Suricata/Falco alerts from Elasticsearch, TheHive incident primitives, and CrowdSec threat intel into a unified API plus MCP toolset (`release_dev/soc-hub-mcp/README.md`).
- **Key MCP tools:** `soc_get_dashboard`, `soc_get_agents`, `soc_get_alerts`, `soc_get_cases`, `soc_create_case`, `soc_get_threat_intel`, `soc_search_ip`, `soc_health_check`.
- **API Endpoints:** `/api/v1/health`, `/dashboard`, `/alerts/:source`, `/cases`, `/threat-intel/crowdsec`, `/stats/elasticsearch`, `/search/ip/:value` (port 3200 by default).
- **Runtime modes:** `SERVER_MODE=http`, `SERVER_MODE=mcp`, or `SERVER_MODE=both`.
- **Configuration:** `.env` needs Wazuh, Elasticsearch, TheHive, and CrowdSec credentials plus `PORT`/`NODE_ENV`.
- **Deployment:** Systemd unit `soc-hub-mcp.service` (see README snippet) under `/opt/mcp/soc-hub-mcp`. Dashboards documented in `SOC_DASHBOARDS_GUIDE.md` confirm production deployment on VMI03 with Keycloak/WebAuthn in front.

### 5. Perplexity MCP — Business Intelligence & Research
- **Scope:** Enterprise BI, opportunity vetting, technical research, and multi-agent deliberation powered by Perplexity (`release_dev/perplexity-mcp/README.md`).
- **Tooling:** `market_research`, `opportunity_analysis`, `trend_analysis`, `gap_analysis`, `doc_finder`, `tech_review`, `whitepaper_search`, `code_review_assist`, `structured_thought_enhance`, `deep_research` (tool availability depends on mode).
- **Modes:**
  - `MCP_MODE=acdev` → 10 tools, $1/day auto approvals, 200 requests/hour, 3 auto rounds (20 w/ approval), code review + deep research enabled.
  - `MCP_MODE=public` → 4 tools, $5/day budget, 50 requests/hour, 3 auto rounds (5 max), safer feature set.
- **Configuration:** `.env` requires `PERPLEXITY_API_KEY`, `DATABASE_URL` (usually `mcp_ecosystem`), optional `REDIS_URL`, budgets, and `LOG_LEVEL`.
- **Runtime:** `npm install`, `npm run build`, `npm run dev` for hot reload, `npm start` for production.
- **Data:** Persists tool runs, budgets, and structured thinking artifacts back to Postgres so results stay queryable across agents.

## Supporting Interfaces
- **MCP Admin Panel (`release_dev/admin-panel`)**: Next.js dashboard that will read mesh registry + log streams once Cloudflare MCP Phase 6 lands.
- **ACDev SOC Hub v2**: HTML/JS dashboard already live on `soc.acdev.host`/`154.26.158.31` (see `SOC_DASHBOARDS_GUIDE.md`) fed by SOC Hub MCP endpoints.

## Cross-Agent Workflow Cheatsheet
1. **Bootstrap** a new agent from `release_dev/<agent-name>/`, copy `.env.example`, and fill credentials (Postgres, Redis, Keycloak, vendor APIs).
2. **Register** by starting the service; the agent calls `mcp_agents` + `agent_heartbeats` automatically (SERVER-MCP/IT-MCP do this out of the box). For custom agents, insert via stored proc or POST to the registry API.
3. **Configure security**: issue a Keycloak client for HTTPS transports or rely on stdio for local-only flows. Store secrets in Vault/1Password.
4. **DNS & mesh visibility**: once Cloudflare MCP approves the MAC, DNS gets updated and mesh health monitors start tracking latency/bandwidth data.
5. **Command dispatch**: IT-MCP (or any client with the dispatcher role) takes a task, looks up `mcp_agents` capabilities, and routes via HTTPS or stdio. `command_queue` + `command_execution_log` capture the lifecycle, and structured thought records tie reasoning to the agent that executed it.
6. **Observability & cleanup**: follow the verification commands in `DEPLOYMENT_SUCCESS_SUMMARY.md`, watch journald/Winston streams, and run `SELECT * FROM cleanup_old_data(90);` monthly to prune heartbeats and audit noise.

## Maintenance Quick Checks
- `ssh root@<host> 'systemctl status postgresql redis-server mcp-orchestrator itjsst-mcp perplexity-mcp'` (per deployment summary) for VMI01 health.
- `ssh root@46.250.243.123 'sudo journalctl -u server-mcp -p err -n 50'` to spot failing playbooks.
- `curl -H "Authorization: Bearer <token>" https://mesh.acdev.host/panel/logs/summary` to ensure Cloudflare MCP heartbeat ingest is online.
- `curl http://soc.acdev.host:3200/api/v1/health` before promoting SOC dashboards; if `SERVER_MODE=both`, also validate MCP stdio interactions via integration tests in `release_dev/soc-hub-mcp/tests`.
- Watch Perplexity budgets via the admin endpoints in `release_dev/perplexity-mcp/PRODUCTION_DEPLOYMENT_GUIDE.md`; adjust `DAILY_AUTO_APPROVAL_USD`/`WEEKLY_BUDGET_USD` when running high-volume analyses.

Refer back to each agent's README for exhaustive command references, environment variable descriptions, and security notes. Keep this file synced whenever an agent gains a new capability, transport, or deployment target.
