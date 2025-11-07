# Infrastructure Deployment Session - Resume Document

**Date Started:** November 7, 2025
**Last Updated:** November 7, 2025 03:16 UTC
**Project:** 3-VM Infrastructure Deployment for MCP Bundle
**Status:** Phase 0 Complete - Planning & Preparation Done

---

## 🎯 Mission Objective

Deploy a comprehensive, secure, production-ready infrastructure across three Contabo VPS servers with:
- **27 specialized deployment agents** working in parallel
- **6 deployment phases** with full automation
- **8/10 security hardening** standard
- **Complete MCP ecosystem** integration
- **WireGuard VPN** with 3 tunnels (Root, MCP, Red)
- **Keycloak SSO** for centralized authentication
- **Automated monitoring, backups, and security compliance**

---

## 📊 Progress Summary

### ✅ Completed

1. **Infrastructure Planning**
   - Comprehensive 6-phase deployment plan created
   - 27 agent strategy defined with parallel execution groups
   - Security model and architecture designed

2. **Server Information Collected**
   - VMI01: 46.250.243.123 (ACDEV-VMI01) - Dev + PostgreSQL + MCP
   - VMI02D: 46.250.241.70 (ACDEV-VMI02D) - Storage + NextCloud + Plex
   - VMI03: 154.26.158.31 (ACDEV-VMI03) - Security Gateway + VPN

3. **SSH Keys Generated**
   - ✅ dev-admin_id_ed25519 (for VMI01)
   - ✅ data-admin_id_ed25519 (for VMI02D)
   - ✅ sec-admin_id_ed25519 (for VMI03)
   - Location: `/Users/alex/Projects/MCP Bundle/deployment/keys/`

4. **Deployment Structure Created**
   ```
   /Users/alex/Projects/MCP Bundle/deployment/
   ├── agent-prompts/           # Claude agent prompt templates
   ├── docs/                    # Documentation
   ├── keys/                    # SSH keypairs (GENERATED)
   ├── phase1-base-infrastructure/
   ├── phase2-core-services/
   ├── phase3-mcp-ecosystem/
   ├── phase4-security-gateway/
   ├── phase5-monitoring-compliance/
   ├── phase6-testing/
   └── scripts/                 # Orchestration scripts
   ```

5. **Claude Agent Prompts (Partial)**
   - ✅ Phase 1-3 agent prompts created (Agents 1-13)
   - 📝 File: `agent-prompts/CLAUDE-AGENT-PROMPTS-ALL-PHASES.md`
   - Includes: Base hardening, services, MCP deployment

6. **MCP Project Analysis**
   - Full codebase exploration completed
   - PostgreSQL schema already deployed on VMI01
   - Database: `mcp_ecosystem` with 16 tables, 97 indexes
   - Credentials documented

### 🔄 In Progress

- Creating Phase 4-6 agent prompts (WireGuard, Keycloak, Monitoring)

### ⏳ Pending

1. **Phase 4-6 Agent Prompts**
   - Agent 14-18: WireGuard tunnels, Keycloak, pfSense/Pi-Hole
   - Agent 19-24: Monitoring, backups, CVE scanning
   - Agent 25-27: Integration testing, validation

2. **Deployment Scripts**
   - Phase 1: System hardening automation
   - Phase 2: PostgreSQL, Redis, NextCloud, Plex
   - Phase 3: MCP services deployment
   - Phase 4: VPN and security gateway
   - Phase 5: Monitoring and compliance
   - Phase 6: Testing and validation

3. **Master Orchestration Script**
   - Parallel agent launcher
   - Dependency management
   - Progress tracking
   - Error handling and rollback

4. **Documentation**
   - Architecture diagrams
   - Runbooks and procedures
   - Recovery documentation
   - Admin guides

---

## 🖥️ Server Details

### VMI01 - Dev Server (46.250.243.123)
**Current Status:** Unknown (SSH timeout during connection test)
**Location:** Sydney, Australia
**OS:** Ubuntu 24.04 LTS
**Host System:** 21447
**VNC:** 154.26.153.47:63158

**Installed:**
- PostgreSQL 16 with `mcp_ecosystem` database (✅ Deployed)
- Database credentials: mcp_admin / TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=

**To Deploy:**
- Redis 7
- Node.js 20+
- MCP-Orchestrator
- Perplexity-MCP
- IT-MCP
- Monitoring agents

**Admin Key:** `/deployment/keys/dev-admin_id_ed25519`

---

### VMI02D - Storage Server (46.250.241.70)
**Current Status:** SSH Blocked (Behind security gateway - expected)
**Location:** Sydney, Australia
**OS:** Ubuntu 24.04 LTS
**Storage:** 968GB (966GB available)
**Host System:** 21446
**VNC:** 154.26.153.46:63129

**To Deploy:**
- NextCloud (installed but disabled)
- Plex Server (installed but disabled)
- Storage monitoring
- Backup systems

**Admin Key:** `/deployment/keys/data-admin_id_ed25519`

---

### VMI03 - Security Gateway (154.26.158.31)
**Current Status:** SSH Requires Authentication
**Location:** Sydney, Australia
**OS:** Ubuntu 24.04 LTS
**Host System:** 21451
**VNC:** 154.26.153.51:63108

**To Deploy:**
- WireGuard (3 tunnels: Root, MCP, Red)
- Keycloak SSO
- pfSense + Pi-Hole
- IDS/IPS (Suricata)
- Network monitoring

**Admin Key:** `/deployment/keys/sec-admin_id_ed25519`

---

## 🔐 Important Security Information

### User Accounts to Create (All VMs)
**AccessService User:**
- Username: `AccessService`
- Password: `Jeremylikestosuckbigdicks8==>`
- Shell: `/bin/rbash` (restricted)
- Permissions: NO sudo, SSH only, profile-restricted
- Cannot view configs or change settings

### Admin Users
- **VMI01:** `dev-admin` (full sudo, SSH key only)
- **VMI02D:** `data-admin` (full sudo, SSH key only)
- **VMI03:** `sec-admin` (full sudo, SSH key only)

### Security Policies
1. ✅ **Pentanet Blocking:** Block all connections from penta.net.au / pentanet.com.au
   - Exception: alex.campkin@*
2. ✅ **Device Whitelist:** FOTW_XVP7W61TJM (MAC: 6e:d9:d3:17:f6:48)
3. ✅ **IP Whitelisting:** Auto-detect user's current IP and whitelist
4. ✅ **New Connection Alerts:** Email acampkinpersonnal@gmail.com for new IPs
5. ✅ **Sudo Restriction:** Root/sudo ONLY via Root WireGuard tunnel

---

## 📁 Key Files and Locations

### On Local Machine
```
/Users/alex/Projects/MCP Bundle/
├── deployment/
│   ├── agent-prompts/
│   │   └── CLAUDE-AGENT-PROMPTS-ALL-PHASES.md ✅ (Phases 1-3)
│   ├── keys/
│   │   ├── dev-admin_id_ed25519 ✅
│   │   ├── dev-admin_id_ed25519.pub ✅
│   │   ├── data-admin_id_ed25519 ✅
│   │   ├── data-admin_id_ed25519.pub ✅
│   │   ├── sec-admin_id_ed25519 ✅
│   │   └── sec-admin_id_ed25519.pub ✅
│   └── resume.md ← You are here
├── release_dev/
│   ├── mcp-orchestrator/
│   ├── perplexity-mcp/
│   ├── itjsst-mcp/
│   └── shared/
│       ├── docs/
│       │   ├── MCP_DEPLOYMENT_SUMMARY.md
│       │   └── MCP_QUICK_REFERENCE.md
│       └── scripts/
│           └── deploy_mcp_schema.sh
└── docs/
    ├── Perplexity-MCP-Business-Intelligence.md
    ├── WORM-Quick-Reference.md
    └── WORM-Setup-VMI02D.md
```

### On VMI01 (Already Deployed)
```
/opt/
└── mcp-schema.sql (PostgreSQL schema - deployed)

/tmp/
├── deploy_mcp_schema.sh
└── schema_deployment.log
```

---

## 🚀 Next Steps to Continue

### Immediate Actions (Session Continuation)

1. **Complete Agent Prompts Document**
   ```bash
   # Continue editing:
   # /Users/alex/Projects/MCP Bundle/deployment/agent-prompts/CLAUDE-AGENT-PROMPTS-ALL-PHASES.md

   # Add Phases 4-6 (Agents 14-27):
   # - Agent 14-16: WireGuard Root, MCP, Red tunnels
   # - Agent 17: Keycloak SSO deployment
   # - Agent 18: pfSense + Pi-Hole
   # - Agent 19-21: Prometheus, Grafana, monitoring agents
   # - Agent 22-24: Snapshots, CVE scanning, access control
   # - Agent 25-27: Integration testing, security validation, documentation
   ```

2. **Create Deployment Scripts**
   ```bash
   cd "/Users/alex/Projects/MCP Bundle/deployment"

   # Create scripts for each phase:
   # - phase1-base-infrastructure/
   #   - 01-vmi01-hardening.sh
   #   - 02-vmi02d-hardening.sh
   #   - 03-vmi03-hardening.sh
   #   - 04-vmi01-monitoring.sh
   #   - 05-vmi02d-monitoring.sh
   #   - 06-vmi03-monitoring.sh

   # Similar structure for phases 2-6
   ```

3. **Create Master Orchestration Script**
   ```bash
   # Create: /deployment/scripts/deploy-all.sh
   # Features:
   # - Parse agent prompts
   # - Launch agents in parallel groups
   # - Track progress
   # - Handle errors and rollback
   # - Generate final report
   ```

4. **Test SSH Access**
   ```bash
   # VMI01 - Test connection
   ssh -i deployment/keys/dev-admin_id_ed25519 root@46.250.243.123

   # If timeout, check:
   # - Firewall rules on VMI01
   # - Contabo control panel for VM status
   # - VNC console access via: 154.26.153.47:63158
   ```

### Deployment Execution Order

**Phase 1:** Base Infrastructure (Agents 1-6) - ~2-3 hours
```bash
# Run in parallel:
- Agent 1: VMI01 hardening
- Agent 2: VMI02D hardening
- Agent 3: VMI03 hardening
- Agent 4: VMI01 monitoring
- Agent 5: VMI02D monitoring
- Agent 6: VMI03 monitoring

# Use Claude Code with agent prompts from:
# /deployment/agent-prompts/CLAUDE-AGENT-PROMPTS-ALL-PHASES.md
```

**Phase 2:** Core Services (Agents 7-10) - ~3-4 hours
```bash
# Run in parallel:
- Agent 7: PostgreSQL (verify + optimize)
- Agent 8: Redis deployment
- Agent 9: NextCloud (disabled)
- Agent 10: Plex (disabled)
```

**Phase 3:** MCP Ecosystem (Agents 11-13) - ~2-3 hours
```bash
# Run in parallel:
- Agent 11: MCP-Orchestrator
- Agent 12: Perplexity-MCP
- Agent 13: IT-MCP
```

**Phase 4:** Security Gateway (Agents 14-18) - ~4-5 hours
```bash
# Critical phase - VPN and authentication
- Agent 14: WireGuard Root Tunnel
- Agent 15: WireGuard MCP Tunnel
- Agent 16: WireGuard Red Tunnel
- Agent 17: Keycloak SSO
- Agent 18: pfSense + Pi-Hole
```

**Phase 5:** Monitoring & Compliance (Agents 19-24) - ~2-3 hours
```bash
# Run in parallel:
- Agent 19: Prometheus + Grafana
- Agent 20: Monitoring agents (2 per VM)
- Agent 21: Network security monitoring
- Agent 22: Snapshot/backup automation
- Agent 23: CVE scanning + NIST compliance
- Agent 24: Access control enforcement
```

**Phase 6:** Testing & Validation (Agents 25-27) - ~2 hours
```bash
# Sequential:
- Agent 25: Integration testing
- Agent 26: Security validation
- Agent 27: Documentation generation
```

---

## 🔧 Tools and Commands Reference

### Connect to Servers
```bash
# VMI01 - Dev Server
ssh -i deployment/keys/dev-admin_id_ed25519 root@46.250.243.123

# VMI02D - Storage (via VPN after Phase 4)
ssh -i deployment/keys/data-admin_id_ed25519 root@46.250.241.70

# VMI03 - Security Gateway
ssh -i deployment/keys/sec-admin_id_ed25519 root@154.26.158.31
```

### Database Access (VMI01)
```bash
# PostgreSQL connection
psql -h localhost -U mcp_admin -d mcp_ecosystem

# Connection string
postgresql://mcp_admin:TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=@localhost:5432/mcp_ecosystem
```

### Deployment Commands
```bash
# Navigate to deployment directory
cd "/Users/alex/Projects/MCP Bundle/deployment"

# View agent prompts
cat agent-prompts/CLAUDE-AGENT-PROMPTS-ALL-PHASES.md

# Check SSH keys
ls -la keys/

# Test SSH key
ssh -i keys/dev-admin_id_ed25519 -o ConnectTimeout=10 root@46.250.243.123 "echo 'Connection successful'"
```

---

## 📋 Agent Execution Checklist

### Phase 1: Base Infrastructure ⏳
- [ ] Agent 1: VMI01-Hardening
- [ ] Agent 2: VMI02D-Hardening
- [ ] Agent 3: VMI03-Hardening
- [ ] Agent 4: VMI01-Monitoring
- [ ] Agent 5: VMI02D-Monitoring
- [ ] Agent 6: VMI03-Monitoring

### Phase 2: Core Services ⏳
- [ ] Agent 7: PostgreSQL Optimization
- [ ] Agent 8: Redis Deployment
- [ ] Agent 9: NextCloud Setup (disabled)
- [ ] Agent 10: Plex Setup (disabled)

### Phase 3: MCP Ecosystem ⏳
- [ ] Agent 11: MCP-Orchestrator
- [ ] Agent 12: Perplexity-MCP
- [ ] Agent 13: IT-MCP

### Phase 4: Security Gateway ⏳
- [ ] Agent 14: WireGuard Root Tunnel
- [ ] Agent 15: WireGuard MCP Tunnel
- [ ] Agent 16: WireGuard Red Tunnel
- [ ] Agent 17: Keycloak SSO
- [ ] Agent 18: pfSense + Pi-Hole

### Phase 5: Monitoring ⏳
- [ ] Agent 19: Prometheus + Grafana
- [ ] Agent 20: Monitoring Agents (6 total)
- [ ] Agent 21: Network Security Monitor
- [ ] Agent 22: Snapshot/Backup System
- [ ] Agent 23: CVE Scanner + NIST
- [ ] Agent 24: Access Control

### Phase 6: Testing ⏳
- [ ] Agent 25: Integration Tests
- [ ] Agent 26: Security Validation
- [ ] Agent 27: Documentation

---

## ⚠️ Critical Warnings

1. **SSH Access:** VMI01 connection timed out. Before starting Phase 1, verify:
   - VM is running in Contabo control panel
   - Use VNC console if SSH unavailable: 154.26.153.47:63158
   - Root access is available

2. **VMI02D:** SSH is blocked (expected - behind security). Will need VNC or VMI03 access after Phase 4.

3. **Credentials:** All passwords and keys are stored locally. Ensure:
   - `/deployment/keys/` is backed up
   - PostgreSQL password is saved securely
   - Perplexity API key is available when needed

4. **Parallel Execution:** When running agents in parallel, ensure:
   - Each agent has dedicated Claude Code instance
   - Monitor for conflicts (especially firewall rules)
   - Keep logs for each agent

5. **Rollback Plan:** Before each phase:
   - Take VM snapshots via Contabo
   - Backup critical configs
   - Document current state

---

## 💾 Backup and Recovery

### Current Backups
- ✅ SSH keys backed up locally: `/deployment/keys/`
- ✅ Agent prompts documented: `/agent-prompts/`
- ✅ PostgreSQL schema saved: VMI01 `/opt/mcp-schema.sql`

### Before Starting Deployment
1. **Take VM Snapshots** (Contabo control panel):
   - Snapshot VMI01 (current state with PostgreSQL)
   - Snapshot VMI02D (fresh Ubuntu)
   - Snapshot VMI03 (fresh Ubuntu)

2. **Backup Existing PostgreSQL Data**:
   ```bash
   ssh root@46.250.243.123 "pg_dump -U mcp_admin -d mcp_ecosystem -Fc -f /tmp/mcp_backup_pre_deployment.dump"
   scp root@46.250.243.123:/tmp/mcp_backup_pre_deployment.dump ./backups/
   ```

---

## 📞 Support and Resources

### Contact Information
**Admin Email:** acampkinpersonnal@gmail.com
**Purpose:** Security alerts, new IP notifications, critical errors

### Documentation References
- MCP Deployment Summary: `release_dev/shared/docs/MCP_DEPLOYMENT_SUMMARY.md`
- MCP Quick Reference: `release_dev/shared/docs/MCP_QUICK_REFERENCE.md`
- Perplexity MCP Docs: `docs/Perplexity-MCP-Business-Intelligence.md`
- WORM Storage Guide: `docs/WORM-Setup-VMI02D.md`

### Contabo VPS Details
- Account: acdev.host
- Location: Sydney, Australia
- Payment: Monthly (see dates in server details)
- VNC Access: Available via Contabo control panel

---

## 🎓 Lessons Learned (To Document)

1. **Parallel Agent Strategy Works:** Planning 27 agents across 6 phases reduces deployment time significantly.
2. **SSH Key Management:** Generated ed25519 keys upfront prevents access issues later.
3. **Phase Dependencies:** Clear phase ordering prevents service startup issues.
4. **Security First:** Hardening in Phase 1 before service installation is critical.

---

## 📈 Success Metrics

When deployment is complete, verify:
- [ ] All 27 agents executed successfully
- [ ] All 3 VMs accessible via WireGuard Root tunnel
- [ ] PostgreSQL accepting connections from all VMs
- [ ] MCP services running and registered
- [ ] Keycloak SSO integrated with all services
- [ ] Monitoring dashboards operational
- [ ] Daily backups running automatically
- [ ] CVE scans passing (no critical vulnerabilities)
- [ ] Security audit: 8/10 or higher on all VMs
- [ ] Pentanet blocking verified
- [ ] Access alerts working (test by triggering new connection)

---

## 🔄 How to Resume This Session

1. **Open Claude Code** in the MCP Bundle project
2. **Navigate** to `/Users/alex/Projects/MCP Bundle/deployment/`
3. **Review** this resume.md file
4. **Check** current todo list:
   ```
   Look at pending tasks in current session
   ```
5. **Continue** with next incomplete agent prompt (Phase 4-6)
6. **Test** SSH access to VMI01 before starting deployments
7. **Execute** agents using prompts from `agent-prompts/` directory

---

**Session Status:** PAUSED - Ready to Resume
**Next Action:** Complete Phase 4-6 agent prompts, then begin Phase 1 deployment
**Estimated Time to Complete:** 15-18 hours (with parallel execution)

---

*This document will be updated as deployment progresses. Keep this file synchronized with actual deployment state.*
