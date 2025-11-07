# IT-MCP

Node-based Model Context Protocol (MCP) server that wraps a curated collection of macOS administration, diagnostics, and optimisation tasks. Tools are exposed over the MCP interface so they can be orchestrated by compatible AI assistants or automation frameworks.

## Highlights
- System health snapshots (uptime, load, memory, disk, launch services)
- Tunable cleanup routines with safe dry-run previews
- Log aggregation with predicate and process filters
- Homebrew hygiene reports and application sizing
- Network inspection (connections, listeners, firewall, Wi-Fi, bandwidth)
- Guided `tcpdump` packet capture with managed output locations
- Email diagnostics covering MX records, authentication, connectivity, and mailbox consumption
- Microsoft 365 and Intune tenant insights via the `m365` CLI
- VPN troubleshooting, ad-hoc SSH execution, and remote Ubuntu/Debian health reports
- Web operations tooling for server process visibility and HTTP performance probes
- Network port scanning and firewall diagnostics using netcat and native macOS tooling
- Structured thinking framework and thought tracking utilities for planning sessions
- Related-thought analysis, progress tracking, and import/export helpers for thinking pipelines
- First capture automatically bootstraps from existing Markdown notes (`*.md`, `Claude.md`, `Agents.md`) when present
- DevOps task planner converts thought history into CI/CD stages, debugging tracks, and Linear/Notion-ready payloads
- Compliance auditing and evidence packaging aligned with Essential 8 and NIST frameworks
- Network infrastructure diagnostics covering path tracing, firewall policy audits, and dual-stack health
- Security scanning orchestration for CodeQL and OpenVAS (with optional install automation)
- Ubuntu & Debian administration tooling (APT, systemd, Nginx, PM2, advanced Docker/PostgreSQL, SMB/NFS/ACL, firewall & security hardening, storage buckets, Kubernetes ops)
- Remote Windows administration via PowerShell remoting (service/process control, event logs, firewall, scheduled tasks)
- Windows Server management extensions for updates, roles/features, and live performance telemetry
- Cross-vendor firewall troubleshooting playbooks (Palo Alto Networks, PAN-OS, Cisco ASA, Fortinet, Check Point, pfSense)
- PAN-OS CLI runner for direct operational commands over SSH
- Deep macOS diagnostics & repair workflows (local or remote via SSH)
- Database server diagnostics covering PostgreSQL, Redis, Keycloak, Nginx, and firewall posture
- Structured reporting hub that links tool outputs into the Structured Thinking timeline for cross-tool insights
- Wireless diagnostics for macOS (signal status, nearby scan, throughput sampling, Wi-Fi subsystem logs)
- Capability-aware execution router ready for delegated remote agents across macOS/Linux/Windows

## Getting Started

```bash
npm install
npm run build
```

Run during development with TypeScript sources:

```bash
npm run dev
```

Ship the compiled server over stdio (useful for MCP shells such as Claude Desktop):

```bash
npm start
```

## MCP Tools

| Tool | Purpose | Notable parameters |
| --- | --- | --- |
| `system-overview` | Consolidated uptime, load, memory, disk, and top processes | `topProcesses` (1-50) |
| `list-launch-daemons` | Lists launchd services for startup triage | `filter` substring |
| `m365-intune-summary` | Microsoft 365/Intune overview using the m365 CLI | `includeUsers`, `includeGroups`, `includeIntuneDevices`, `includeServiceHealth` |
| `web-service-status` | Checks nginx/Apache/Node processes, optional headers & Lighthouse audit | `url`, `includeHeaders`, `includeLighthouse`, `timeoutSeconds` |
| `web-performance-probe` | Curl-based timing probe for a URL | `url`, `method`, `headers[]`, `timeoutSeconds` |
| `network-port-scan` | TCP/UDP port scan with optional nmap | `host`, `ports`, `protocol`, `timeoutSeconds`, `useNmap` |
| `firewall-diagnostics` | pfctl and application firewall status | none |
| `structured-thinking-framework` | Provides staged thinking framework | `includeExamples`, `customStages[]` |
| `thought-tracker` | Records sequential thoughts with metadata | `entries[]`, `autoNumbering` |
| `devops-task-plan` | Builds DevOps tasks, CI/CD pipeline, and debug tracks from thought history | `goal`, `context`, `assumptions[]`, `constraints[]`, `stages[]`, `storagePath` |
| `structured-diagnostics` | Audits structured thinking coverage, stale entries, and high-priority follow-ups | `staleHours`, `storagePath` |
| `structured-report` | Generates Markdown/JSON reports from structured thinking timeline | `format`, `includeTimeline`, `maxEntries`, `storagePath` |
| `compliance-audit` | Runs Essential 8/NIST assessments and builds evidence packages | `systems[]`, `controls[]`, `framework`, `generateEvidence`, `evidenceName` |
| `network-infra-diagnostics` | Generates path traces, firewall reviews, and dual-stack checks | `source`, `destination`, `includeFirewallAnalysis`, `firewallPolicy[]`, `performDualStackCheck` |
| `firewall-toolkit` | Builds vendor-aware firewall troubleshooting runbooks | `vendor`, `scenario`, `context` |
| `mac-diagnostics` | Deep macOS analytics & repair (local or SSH) | `mode`, `operation`, `suite`, `repairAction`, `host`, `username` |
| `database-diagnostics` | Database host health (Postgres/Redis/Keycloak/Nginx/firewall/system) | `mode`, `suites[]`, `host`, `username` |
| `scan_security_vulnerabilities` | Installs/runs CodeQL & OpenVAS scans | `installCodeql`, `installOpenvas`, `codeql{}`, `openvas{}` |
| `ubuntu-admin` | Executes Ubuntu administration commands | `action`, plus service/docker/postgres/network/filesystem/virtualmin/security/kubernetes options |
| `debian-admin` | Executes Debian administration commands | `action`, plus service/docker/postgres/network/filesystem/virtualmin/security/kubernetes options |
| `windows-admin` | Executes remote Windows administration via PowerShell Remoting | `action`, `host`, plus service/process/event-log/firewall/update/role/performance options |
| `panos-cli` | Runs PAN-OS CLI commands over SSH (with presets) | `host`, `username`, `command`, `preset`, SSH options |
| `wireless-diagnostics` | Runs macOS Wi-Fi diagnostics (status, scans, performance, logs) | `interface`, `includeScan`, `includePerformance`, `includeLogs`, `pingHost` |
| `thought-export` | Exports tracked thoughts to JSON/Markdown | `format`, `includeMetadata` |
| `thought-import` | Imports thoughts from JSON/Markdown payloads | `format`, `content` |
| `thought-summary` | Generates summaries and related-thought analysis | `entries[]`, `autoNumbering` |
| `email-mx-lookup` | Retrieves MX records for a domain | `domain` |
| `email-connectivity-test` | Probes SMTP/IMAP endpoints for TCP reachability | `checks[]` (host, protocol, port, timeout) |
| `email-auth-check` | Inspects SPF, DKIM, and DMARC TXT records | `domain`, `dkimSelectors[]` |
| `vpn-diagnostics` | Collects macOS VPN configuration and process information | `includeWifi` |
| `ssh-exec` | Runs an arbitrary SSH command against a remote host | `host`, `username`, `command`, `port`, `identityFile` |
| `ubuntu-health-report` | Remote Ubuntu health snapshot via SSH | `host`, `username`, `identityFile`, `port` |
| `debian-health-report` | Remote Debian health snapshot via SSH | `host`, `username`, `identityFile`, `port` |
| `mailbox-quota-check` | Measures mailbox storage usage with optional breakdown | `path`, `includeBreakdown` |
| `cleanup-runbook` | Cache purge, downloads pruning, optional Time Machine thinning | `dryRun`, `purgeSystemCaches`, `purgeDownloadsOlderThanDays`, `thinTimeMachineSnapshotsGb` |
| `log-review` | Collects log excerpts using `log show` | `lastMinutes`, `predicate`, `process`, `limit` |
| `software-maintenance` | Surfaces Homebrew updates and optional cleanups | `performCleanup`, `includeApplications` |
| `network-inspect` | Netstat, listeners, optional firewall/Wi-Fi/bandwidth sampling | `includeFirewall`, `includeWifiScan`, `bandwidthSampleSeconds` |
| `packet-capture` | Time-bounded `tcpdump` capture | `interface`, `durationSeconds`, `filterExpression`, `outputDirectory` |

All tools emit both human-readable text blocks and machine-friendly `structuredContent` payloads.

## Privilege & Safety Model
- The server prefixes sensitive commands with `sudo` by default. Disable this behaviour by exporting `IT_MCP_ALLOW_SUDO=false` before launch if you prefer to run everything as an unprivileged user.
- Always run `cleanup-runbook` in the default dry-run mode first. Only rerun with `dryRun=false` after vetting the previewed commands.
- Packet captures are stored in `./captures` unless `IT_MCP_CAPTURE_DIR` or the `outputDirectory` input is provided. Rotate captures and restrict access appropriately.
- Commands that stream large volumes of data (`nettop`, `tcpdump`, `log show`) are bounded with sensible defaults; adjust parameters cautiously when running on production hosts.
- Windows administration tooling depends on PowerShell 7 (`pwsh`) being available in the container and WinRM/PowerShell remoting access to the target host. Provide credentials via environment variables (default `WINDOWS_REMOTE_PASSWORD`) when needed.

## Environment Variables

| Variable | Default | Effect |
| --- | --- | --- |
| `IT_MCP_ALLOW_SUDO` | `true` | Controls whether `sudo` is auto-prefixed for privileged commands |
| `IT_MCP_CAPTURE_DIR` | `<cwd>/captures` | Base directory for packet capture output files |
| `IT_MCP_LOG_LEVEL` | `debug` (when not in production) | Controls winston log level (`error`, `warn`, `info`, `debug`, etc.) |

## Extending The Server
- Add new services under `src/services/` to wrap reusable command logic.
- Register additional MCP tools in `src/tools/registerTools.ts`.
- Update the instructions string in `src/index.ts` so clients know how to use new capabilities.
- Always prefer `CommandRunner` for shell execution so you inherit consistent sudo, timeout, and error handling semantics.
- The execution router (`ExecutionRouter`) maps tool requests to local execution or future remote agents; implement agent dispatch in `RemoteAgentService` when rolling out remote workers.

## Testing & Validation
- `npm run build` compiles the TypeScript sources.
- `npm run lint` enforces lint rules (install ESLint globally or via `npm install` first).
- Consider running tools in dry-run mode initially when integrating with downstream automations.
