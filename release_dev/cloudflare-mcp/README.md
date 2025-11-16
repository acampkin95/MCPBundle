# Cloudflare MCP

Cloudflare MCP is the dedicated mesh-side agent that keeps every MCP unit discoverable over the public internet while enforcing identity gates around Cloudflare DNS updates. It clones the hardened SERVER-MCP scaffolding but retools the runtime for:

- **Heartbeat over HTTPS:** Every MCP node pushes MAC-bound heartbeats to the Cloudflare MCP API. Missed beats trigger quarantine workflows and DNS suppression.
- **Dynamic DNS relay:** Authorized heartbeats auto-update Cloudflare DNS (A/AAAA records) so floating or CGNAT IPs keep a stable hostname (`<agent>.${CLOUDFLARE_BASE_HOSTNAME}`).
- **Mesh registry on VMI03:** Heartbeats persist inside the VMI03 Postgres instance, giving policy gates, history, and compliance logging for MAC changes, DNS actions, and health anomalies.
- **Policy automation:** A background monitor downgrades stale agents, pauses their DNS route, and forces re-authorization whenever hardware fingerprints (MAC) shift.
- **Cloudflare toolchain:** MCP tools expose full DNS CRUD plus mesh registry controls so SecOps can remotely audit, revoke, or re-authorize units without logging into the box.

## Runtime Architecture

```
┌────────────────────┐    HTTPS + token     ┌──────────────────────────┐
│ MCP Units (3000+) ├──────────────────────>│ Cloudflare MCP (3003)    │
└────────────────────┘                       │ • Heartbeat API          │
                                            │ • Mesh registry (PG)     │
                                            │ • DNS relay (API)        │
                                            │ • MCP tooling (STDIO)    │
                                            └─────────┬────────────────┘
                                                      │
                                     Cloudflare API   │   Postgres (VMI03)
                                                      ▼
                                      Dynamic DNS + Mesh Ledger
```

## Environment Variables

| Variable                                             | Required | Description                                                                                                                                                |
| ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                               | ✅       | Scoped token with DNS/Edit, Queues/Edit, Access audit, etc. Keep in Vault; never commit (example placeholder: `HBZfO8_nhXG9syRO8VwNDvxqnTihNCfPXDq1qa8c`). |
| `CLOUDFLARE_ACCOUNT_ID`                              | ✅       | Cloudflare account identifier.                                                                                                                             |
| `CLOUDFLARE_ZONE_ID`                                 | ✅       | Zone being managed (e.g., `acdev.host`).                                                                                                                   |
| `CLOUDFLARE_BASE_HOSTNAME`                           | ✅       | Root hostname used for dynamic records (e.g., `mesh.acdev.host`).                                                                                          |
| `CLOUDFLARE_MCP_DB_URL`                              | ✅       | Postgres URL for the VMI03 mesh registry (use the dynamic-links database).                                                                                 |
| `CLOUDFLARE_MCP_DB_SSL_MODE`                         | ➖       | `disable`, `allow`, or `require` (defaults to `allow`).                                                                                                    |
| `CLOUDFLARE_MCP_HEARTBEAT_SECRET`                    | ✅       | Shared secret each MCP unit sends via the `x-heartbeat-token` header.                                                                                      |
| `CLOUDFLARE_MCP_ADMIN_TOKEN`                         | ➖       | Optional token for HTTPS/MCP MAC approvals.                                                                                                                |
| `CLOUDFLARE_MCP_HOST`                                | ➖       | Bind host (default `0.0.0.0`).                                                                                                                             |
| `CLOUDFLARE_MCP_PORT`                                | ➖       | API port (default `3003`).                                                                                                                                 |
| `CLOUDFLARE_MCP_HEARTBEAT_MS`                        | ➖       | Default heartbeat cadence (ms, default `60000`).                                                                                                           |
| `CLOUDFLARE_MCP_STALE_MS`                            | ➖       | Mark inactive after this many ms without heartbeat (default `300000`).                                                                                     |
| `CLOUDFLARE_MCP_DEFAULT_TTL`                         | ➖       | TTL for dynamic DNS (default `60`).                                                                                                                        |
| `CLOUDFLARE_MCP_PROXY_MODE`                          | ➖       | `true/false` to toggle Cloudflare proxying (default `true`).                                                                                               |
| `CLOUDFLARE_MCP_TLS_CERT` / `CLOUDFLARE_MCP_TLS_KEY` | ➖       | PEM paths for enabling HTTPS directly on the agent.                                                                                                        |

> **Security:** Keep tokens in `release_dev/cloudflare-mcp/.env` (git-ignored) or the orchestrator Vault injector. Never echo tokens to logs.

## Heartbeat & Mesh Registry

1. **Authenticate:** Heartbeats call `POST /mesh/heartbeat` with `x-heartbeat-token` = `CLOUDFLARE_MCP_HEARTBEAT_SECRET`.
2. **Payload contract:**
   ```json
   {
     "agentName": "perplexity-mcp",
     "macAddress": "b8:27:eb:11:22:33",
     "ipAddress": "198.51.100.42",
     "dnsLabel": "perplexity-mcp",
     "serviceRole": "perplexity",
     "heartbeatIntervalMs": 45000,
     "metadata": { "cluster": "vmi01" }
   }
   ```
3. **Registry enforcement:**
   - New agent ⇒ inserted with status `active` and DNS auto-provisioned.
   - MAC mismatch ⇒ `status=mac_verification_required`, DNS updates suspended, `pending_mac` populated.
   - Manual approval ⇒ call `/mesh/agents/<name>/authorize` or the MCP tool `mesh.registry.authorize-mac` with the admin token.
4. **Stale agents:** `MeshHealthMonitor` scans every `CLOUDFLARE_MCP_MONITOR_INTERVAL_MS`. If `last_heartbeat < now - offlineGrace`, the agent is set to `inactive` and its DNS record is pointed to `0.0.0.0`/`::` until a fresh heartbeat arrives.
5. **Database schema:** Created automatically on boot (`mesh_agents`, `mesh_agent_events`). Schema lives in the VMI03 Postgres cluster for durability and shared analytics.

## Cloudflare DNS Relay

- **Upsert logic:** `CloudflareDnsService` searches for existing A/AAAA records and only pushes changes when IP/TTL/proxy mode differ. Comments annotate MAC + timestamps.
- **Quarantine:** When health gates trip, DNS entries flip to `0.0.0.0` (IPv4) or `::` (IPv6) with a pause comment.
- **Tooling:**
  - `cloudflare.dns.list` – query the zone with optional name/type filters.
  - `cloudflare.dns.upsert` – force an upsert for a specific agent/IP.
  - `cloudflare.dns.delete` – delete by record ID or hostname.

## Admin Panel + Structured Thought APIs

- **REST Feeds**
  - `GET /panel/overview` → mesh stats + credential printout (hostnames, MACs, hashed fingerprints, last heartbeat, DNS timestamps).
  - `GET /panel/structured-thoughts` → summary, diagnostics, and recent timeline for the structured thought viewer (powered by the local SQLite planner).
- **MCP Tools**
  - `panel.snapshot` – returns the same data as the REST feeds for agents that would rather stay inside the MCP flow.
  - `mesh.registry.authorize-mac` – already doubled as an admin action; combine it with the snapshot to approve or quarantine nodes.

Feed consumers never see raw secrets—the credential printout uses SHA-256 fingerprints salted with the heartbeat secret while still surfacing the data needed for audits.

## MCP Tool Surface

| Tool                          | Purpose                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| `cloudflare.dns.list`         | Enumerate Cloudflare records under management.                                                 |
| `cloudflare.dns.upsert`       | Manually create/update an agent record.                                                        |
| `cloudflare.dns.delete`       | Remove records by ID or name (supports bulk delete by hostname).                               |
| `mesh.registry.list`          | Dump every agent (status, MAC, last heartbeat, DNS timestamp).                                 |
| `mesh.registry.get`           | Inspect a single agent entry.                                                                  |
| `mesh.registry.authorize-mac` | Approve pending MAC swaps (requires `CLOUDFLARE_MCP_ADMIN_TOKEN`).                             |
| `panel.snapshot`              | Ship an end-to-end admin snapshot (stats, credentials, structured thoughts) for the dashboard. |

All tool outputs include structured JSON responses so downstream observers (e.g., SOC dashboards) can parse audit data.

## Deployment Checklist (Phase 6 tie-in)

1. **Clone & build:**
   ```bash
   cd release_dev/cloudflare-mcp
   npm install
   npm run build
   ```
2. **Provision systemd** (example service file `systemd/cloudflare-mcp.service` already mirrors Server MCP; update ExecStart & env file).
3. **Populate env file:** `/etc/cloudflare-mcp/cloudflare-mcp.env` with the variables above. Pull the Cloudflare API token from Vault and ensure it matches the entitlement list supplied by SecOps.
4. **Database prep:** Point `CLOUDFLARE_MCP_DB_URL` at the dedicated `mesh_links` database on VMI03. The service will auto-migrate tables on first boot.
5. **Firewall:** Allow `3003/tcp` (or the configured port) inbound from MCP peers plus the orchestrator. Lock down to TLS if the segment is untrusted.
6. **Smoke test:**
   - `curl -H "x-heartbeat-token: $SECRET" -d @heartbeat.json https://<host>:3003/mesh/heartbeat`
   - `npx cloudflare-mcp` (or the supervising orchestrator) to exercise the MCP tools.
7. **Monitoring hooks:** Grafana/Loki dashboards already expect `/healthz` and the mesh registry tables; add the new service to Promtail scrapes if you want HTTP/access logs aggregated.

## Operational Notes

- **MAC-first security:** No DNS write happens until the registry verifies the MAC. If a NIC swap or VM migration occurs, expect the agent to fall into `mac_verification_required` until an admin authorizes it.
- **Audit logs:** Every state change is inserted into `mesh_agent_events` with JSON details (MAC deltas, DNS actions, inactivity). These rows roll into SOC-DEPLOY playbooks.
- **Fail-safe DNS:** When Cloudflare API errors occur, heartbeats still succeed but `allowDnsUpdate=false` and the MCP response contains the failure reason so upstream automation can alert.
- **Credentials:** The provided Cloudflare token grants DNS, Access, Workers, Queues, Firewall, etc. Logically scope it via Vault and rotate before the listed expiry (June 12, 2026).

## Next Steps

- Wire the Admin Panel (Phase 6) to the mesh registry tables for live topology and approvals.
- Extend CodeQL/ESLint coverage so the new heartbeat services are included in the CI gate.
- Integrate the VMI03 database snapshot jobs with the new `mesh_agents` tables for compliance backups.

## Log Streaming & PM2 Telemetry

The heartbeat API now exposes `/panel/logs`, `/panel/logs/summary`, and `/panel/logs/security` for the admin panel. Set the following environment variables when deploying:

- `CLOUDFLARE_LOG_INGEST_URL` (defaults to `/panel/logs/ingest` on the local service)
- `CLOUDFLARE_LOG_INGEST_TOKEN` (defaults to `CLOUDFLARE_MCP_LOG_INGEST_TOKEN`)
- `LOG_AGGREGATOR_URL` / `LOG_AGGREGATOR_TOKEN` for peer nodes that forward their Winston logs

Each MCP node publishes PM2 crash investigations and security events via the shared ingest pipeline, enabling the admin panel to surface high-signal telemetry without tailing raw process logs.
