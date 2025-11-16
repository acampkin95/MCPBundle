# MCP Bundle - Master Documentation Index

**Project**: MCP Bundle v0.2.0
**Status**: Production Operational
**Last Updated**: 2025-11-14

---

## Quick Navigation

| Category | Location | Purpose |
|----------|----------|---------|
| **Deployment** | [docs/deployment/](deployment/) | Deployment guides and procedures |
| **Infrastructure** | [docs/infrastructure/](infrastructure/) | Architecture and infrastructure setup |
| **Services** | [docs/services/](services/) | Service-specific documentation |
| **Operations** | [docs/operations/](operations/) | Day-to-day operations guides |
| **Security** | [docs/security/](security/) | Security, credentials, audits |
| **Reference** | [docs/reference/](reference/) | Technical reference materials |
| **Archive** | [docs/archive/](archive/) | Historical documentation |

---

## Root Level Documentation

| File | Purpose |
|------|---------|
| [README.md](../README.md) | Project overview and getting started |
| [CLAUDE.md](../CLAUDE.md) | Claude Code instructions and guidelines |

---

## Deployment Documentation

### Main Guides

| Document | Purpose | Location |
|----------|---------|----------|
| **Deployment Guide Complete** | Comprehensive deployment guide | [docs/deployment/DEPLOYMENT_GUIDE_COMPLETE.md](deployment/DEPLOYMENT_GUIDE_COMPLETE.md) |
| **Final Deployment Guide** | Final production deployment procedures | [docs/deployment/FINAL_DEPLOYMENT_GUIDE.md](deployment/FINAL_DEPLOYMENT_GUIDE.md) |
| **Deployment Checklist** | Step-by-step deployment checklist | [docs/deployment/DEPLOYMENT_CHECKLIST.md](deployment/DEPLOYMENT_CHECKLIST.md) |
| **Quick Reference** | Quick deployment commands | [docs/deployment/QUICK_REFERENCE.md](deployment/QUICK_REFERENCE.md) |
| **Final Deployment Report** | Deployment completion report | [docs/deployment/FINAL_DEPLOYMENT_REPORT.md](deployment/FINAL_DEPLOYMENT_REPORT.md) |
| **Deployment Status** | Current deployment status | [docs/deployment/DEPLOYMENT_STATUS.md](deployment/DEPLOYMENT_STATUS.md) |

### Planning & Implementation

| Document | Purpose |
|----------|---------|
| **Production Implementation Plan** | Production rollout plan | [docs/deployment/PRODUCTION_IMPLEMENTATION_PLAN.md](deployment/PRODUCTION_IMPLEMENTATION_PLAN.md) |
| **Improvement Plan** | System improvement roadmap | [docs/deployment/IMPROVEMENT_PLAN.md](deployment/IMPROVEMENT_PLAN.md) |
| **Quick Start (Redis)** | Redis services quick start | [docs/deployment/QUICKSTART_REDIS_SERVICES.md](deployment/QUICKSTART_REDIS_SERVICES.md) |

---

## Infrastructure Documentation

### Core Infrastructure

| Document | Purpose | Location |
|----------|---------|----------|
| **PostgreSQL Deployment** | Database setup and replication | [docs/infrastructure/POSTGRESQL_DEPLOYMENT_COMPLETE.md](infrastructure/POSTGRESQL_DEPLOYMENT_COMPLETE.md) |
| **VMI03 Gateway** | Gateway deployment guide | [docs/infrastructure/VMI03_GATEWAY_DEPLOYMENT_GUIDE.md](infrastructure/VMI03_GATEWAY_DEPLOYMENT_GUIDE.md) |
| **Media Deployment** | Media services deployment | [docs/infrastructure/MEDIA_DEPLOYMENT_COMPLETE.md](infrastructure/MEDIA_DEPLOYMENT_COMPLETE.md) |

### Network & VPN

| Document | Purpose | Location |
|----------|---------|----------|
| **WireGuard VPN** | VPN configuration and setup | [docs/infrastructure/WIREGUARD_VPN_CONFIGURATION.md](infrastructure/WIREGUARD_VPN_CONFIGURATION.md) |
| **Wazuh WAN** | Wazuh over WAN configuration | [docs/infrastructure/WAZUH_WAN_CONFIGURATION.md](infrastructure/WAZUH_WAN_CONFIGURATION.md) |
| **Public DNS** | DNS configuration | [docs/infrastructure/PUBLIC_DNS_CONFIGURATION.md](infrastructure/PUBLIC_DNS_CONFIGURATION.md) |

### Detailed Service Docs

Service-specific documentation is located in `deployment/` subdirectories:

- **SOC Hub**: [deployment/soc/](../deployment/soc/)
- **Monitoring**: [deployment/monitoring/](../deployment/monitoring/)
- **Keycloak**: [deployment/keycloak/](../deployment/keycloak/)
- **Media Services**: [deployment/media/](../deployment/media/)
- **Backup & DR**: [deployment/backup-dr/docs/](../deployment/backup-dr/docs/)
- **WireGuard VPN**: [deployment/wireguard/](../deployment/wireguard/)
- **Redis**: [deployment/redis/](../deployment/redis/)

---

## Service Documentation

### Core Services

| Service | Documentation | Status |
|---------|---------------|--------|
| **SOC Hub** | [deployment/soc/README.md](../deployment/soc/README.md) | ✅ Operational |
| **Backup & DR** | [deployment/backup-dr/docs/README.md](../deployment/backup-dr/docs/README.md) | ✅ Operational |
| **Monitoring Stack** | [deployment/monitoring/README.md](../deployment/monitoring/README.md) | ✅ Operational |
| **Keycloak SSO** | [deployment/keycloak/integration-guide.md](../deployment/keycloak/integration-guide.md) | ✅ Operational |
| **Media Services** | [deployment/media/README.md](../deployment/media/README.md) | ✅ Operational |

### MCP Services

| Service | Documentation | Location |
|---------|---------------|----------|
| **itjsst-mcp** | IT administration MCP | [release_dev/itjsst-mcp/README.md](../release_dev/itjsst-mcp/README.md) |
| **mcp-orchestrator** | Central orchestration | [release_dev/mcp-orchestrator/README.md](../release_dev/mcp-orchestrator/README.md) |
| **perplexity-mcp** | AI search integration | [release_dev/perplexity-mcp/README.md](../release_dev/perplexity-mcp/README.md) |
| **cloudflare-mcp** | Cloudflare management | [release_dev/cloudflare-mcp/README.md](../release_dev/cloudflare-mcp/README.md) |

### Service-Specific Docs

| Document | Purpose | Location |
|----------|---------|----------|
| **SOC Deploy** | SOC Hub deployment | [docs/services/SOC-DEPLOY.md](services/SOC-DEPLOY.md) |
| **SOC Credentials** | SOC Hub access credentials | [docs/services/SOC_PROJECT_SUMMARY_AND_CREDENTIALS.md](services/SOC_PROJECT_SUMMARY_AND_CREDENTIALS.md) |
| **Perplexity BI** | Perplexity business intelligence | [docs/services/Perplexity-MCP-Business-Intelligence.md](services/Perplexity-MCP-Business-Intelligence.md) |

---

## Operations Documentation

### Daily Operations

| Document | Purpose | Location |
|----------|---------|----------|
| **Testing Guide** | Testing procedures | [docs/operations/TESTING.md](operations/TESTING.md) |
| **Testing & Automation** | Automated testing guide | [docs/operations/TESTING_AND_AUTOMATION_GUIDE.md](operations/TESTING_AND_AUTOMATION_GUIDE.md) |
| **WORM Setup** | Write-once storage setup | [docs/operations/WORM-Setup-VMI02D.md](operations/WORM-Setup-VMI02D.md) |
| **WORM Quick Reference** | WORM operations quick ref | [docs/operations/WORM-Quick-Reference.md](operations/WORM-Quick-Reference.md) |

### Backup Operations

Complete backup operations documentation: [deployment/backup-dr/docs/current/OPERATIONS.md](../deployment/backup-dr/docs/current/OPERATIONS.md)

---

## Security Documentation

| Document | Purpose | Location |
|----------|---------|----------|
| **Secrets Import** | Secret management procedures | [docs/security/SECRETS_IMPORT_INSTRUCTIONS.md](security/SECRETS_IMPORT_INSTRUCTIONS.md) |
| **Contabo Secrets** | Contabo API credentials | [docs/security/CONTABO_SECRETS.md](security/CONTABO_SECRETS.md) |
| **Security Audit** | Keycloak/HAProxy audit | [docs/security/SOC_SECURITY_AUDIT_KEYCLOAK_HAPROXY.md](security/SOC_SECURITY_AUDIT_KEYCLOAK_HAPROXY.md) |
| **Backup Credentials** | Backup system credentials | [deployment/backup-dr/docs/security/CREDENTIALS.md](../deployment/backup-dr/docs/security/CREDENTIALS.md) |

---

## Reference Documentation

### Technical Reference

| Document | Purpose | Location |
|----------|---------|----------|
| **Agents** | Agent documentation | [docs/reference/AGENTS.md](reference/AGENTS.md) |
| **Agent Acceleration** | Agent performance summary | [docs/reference/AGENT_ACCELERATION_SUMMARY.md](reference/AGENT_ACCELERATION_SUMMARY.md) |
| **VS Marketplace Guide** | VS Code extension guide | [docs/reference/guidance for VS Marketplace _VS Claude_ extension.md](reference/guidance%20for%20VS%20Marketplace%20_VS%20Claude_%20extension.md) |

### Architecture

| Document | Purpose | Location |
|----------|---------|----------|
| **Backup Architecture** | Backup system architecture | [deployment/backup-dr/docs/reference/ARCHITECTURE.md](../deployment/backup-dr/docs/reference/ARCHITECTURE.md) |
| **Agents Architecture** | Agent system architecture | [.key/agents/ARCHITECTURE.md](../.key/agents/ARCHITECTURE.md) |
| **Phase 6 Architecture** | Phase 6 architecture docs | [.key/phase6/ARCHITECTURE.md](../.key/phase6/ARCHITECTURE.md) |

### Development Docs

| Document | Purpose | Location |
|----------|---------|----------|
| **Workflow Quickstart** | Development workflow | [release_dev/shared/docs/WORKFLOW_QUICKSTART.md](../release_dev/shared/docs/WORKFLOW_QUICKSTART.md) |
| **Folder Structure** | Project structure reference | [release_dev/shared/docs/FOLDER_STRUCTURE.md](../release_dev/shared/docs/FOLDER_STRUCTURE.md) |
| **Diagnostic System** | Diagnostics documentation | [release_dev/shared/docs/DIAGNOSTIC_SYSTEM.md](../release_dev/shared/docs/DIAGNOSTIC_SYSTEM.md) |
| **Testing** | Testing framework | [release_dev/shared/docs/TESTING.md](../release_dev/shared/docs/TESTING.md) |

---

## Archive Documentation

Historical documentation and progress reports: [docs/archive/](archive/)

### Categories

- **Progress Reports**: Session summaries and status updates ([archive/progress-reports/](archive/progress-reports/))
- **Completion Summaries**: Project completion reports ([archive/completion-summaries/](archive/completion-summaries/))
- **Sessions**: Session notes and history ([archive/sessions/](archive/sessions/))
- **V02 Migration**: Schema v0.2 migration docs ([archive/v02-migration/](archive/v02-migration/))

---

## Quick Links

### Most Common Tasks

| Task | Documentation |
|------|---------------|
| Deploy new server | [DEPLOYMENT_GUIDE_COMPLETE.md](deployment/DEPLOYMENT_GUIDE_COMPLETE.md) |
| Backup operations | [backup-dr/docs/current/OPERATIONS.md](../deployment/backup-dr/docs/current/OPERATIONS.md) |
| Restore files | [backup-dr/docs/current/RESTORE.md](../deployment/backup-dr/docs/current/RESTORE.md) |
| Run tests | [operations/TESTING.md](operations/TESTING.md) |
| Check SOC Hub | [deployment/soc/QUICK_START.md](../deployment/soc/QUICK_START.md) |
| Monitor system | [deployment/monitoring/QUICK_REFERENCE.md](../deployment/monitoring/QUICK_REFERENCE.md) |

### Credentials & Access

| Resource | Documentation |
|----------|---------------|
| Backup encryption | [backup-dr/docs/security/CREDENTIALS.md](../deployment/backup-dr/docs/security/CREDENTIALS.md) |
| SOC Hub access | [services/SOC_PROJECT_SUMMARY_AND_CREDENTIALS.md](services/SOC_PROJECT_SUMMARY_AND_CREDENTIALS.md) |
| Contabo API | [security/CONTABO_SECRETS.md](security/CONTABO_SECRETS.md) |
| Secrets management | [security/SECRETS_IMPORT_INSTRUCTIONS.md](security/SECRETS_IMPORT_INSTRUCTIONS.md) |

---

## Project Status

### Infrastructure

| Component | Status | Documentation |
|-----------|--------|---------------|
| PostgreSQL Replication | ✅ Operational | [infrastructure/POSTGRESQL_DEPLOYMENT_COMPLETE.md](infrastructure/POSTGRESQL_DEPLOYMENT_COMPLETE.md) |
| WireGuard VPN | ✅ Operational | [infrastructure/WIREGUARD_VPN_CONFIGURATION.md](infrastructure/WIREGUARD_VPN_CONFIGURATION.md) |
| Backup & DR | ✅ Operational | [backup-dr/docs/current/DEPLOYMENT_STATUS.md](../deployment/backup-dr/docs/current/DEPLOYMENT_STATUS.md) |
| Monitoring Stack | ✅ Operational | [deployment/monitoring/](../deployment/monitoring/) |
| SOC Hub | ✅ Operational | [deployment/soc/](../deployment/soc/) |

### Services

| Service | Version | Status | Documentation |
|---------|---------|--------|---------------|
| itjsst-mcp | v0.2.0 | ✅ Production | [release_dev/itjsst-mcp/](../release_dev/itjsst-mcp/) |
| mcp-orchestrator | v0.2.0 | ✅ Production | [release_dev/mcp-orchestrator/](../release_dev/mcp-orchestrator/) |
| perplexity-mcp | v0.2.0 | ✅ Production | [release_dev/perplexity-mcp/](../release_dev/perplexity-mcp/) |
| cloudflare-mcp | v0.2.0 | ⚠️ Development | [release_dev/cloudflare-mcp/](../release_dev/cloudflare-mcp/) |

---

## Getting Help

1. **Deployment Issues**: Check [deployment/QUICK_REFERENCE.md](deployment/QUICK_REFERENCE.md)
2. **Service Issues**: Check service-specific docs in `deployment/<service>/`
3. **Backup Issues**: Check [backup-dr/docs/current/OPERATIONS.md](../deployment/backup-dr/docs/current/OPERATIONS.md)
4. **Testing**: See [operations/TESTING.md](operations/TESTING.md)

---

**Documentation Version**: 1.0
**Last Organized**: 2025-11-14
**Status**: Production Ready
