# MCP Bundle - Complete Deployment Guide

## Production Infrastructure Deployment Across VMI01, VMI02D, VMI03

**Version:** 0.2.0  
**Date:** 2025-01-08  
**Status:** Infrastructure Ready, Applications In Specification

---

## 📊 Executive Summary

This guide provides complete instructions for deploying a comprehensive enterprise infrastructure across three servers, integrating security, monitoring, media services, VPN, web hosting, and automated backups.

### What's Included:

- ✅ **SOC Security Stack** - Production-ready, deployed to all servers
- ✅ **Foundation Services** - Redis, MCP services, monitoring stack
- ✅ **Media Services** - NextCloud, Plex, automated transcoding
- ✅ **Backup System** - Wasabi S3 with 6-hour snapshots
- 📋 **VPN Invite System** - Complete architectural specification
- 📋 **Web Hosting Platform** - Complete architectural specification

### Timeline:

- **Immediate Deployment:** Phases 0-2, 5 (Infrastructure & Backup) - 1-2 days
- **Application Development:** Phases 3-4 (VPN, Web Hosting) - 4-8 weeks
- **Testing & Validation:** Phase 6 - 1 week

---

## 🏗️ Infrastructure Architecture

```
VMI01 (46.250.243.123) - Application Server
├── PostgreSQL 16 (Primary, port 5432)
├── Redis 7 (pub/sub, port 6379)
├── MCP Orchestrator (port 3000)
├── Perplexity MCP (port 3001)
├── IT-MCP Server (port 3002)
└── SOC Agents (Suricata, CrowdSec, Wazuh, Falco)

VMI02D (46.250.241.70) - Storage & Media Server
├── PostgreSQL 16 (Standby/Replica)
├── NextCloud (HTTPS 443)
├── Plex Media Server (port 32400)
├── Video Transcoding Service
├── Elasticsearch (data node, port 9200)
└── SOC Agents

VMI03 (154.26.158.31) - Gateway & Security Hub
├── HAProxy Load Balancer (HTTP 80, HTTPS 443)
├── Keycloak SSO (HTTPS 8443)
├── Prometheus (port 9090)
├── Grafana (port 3030)
├── AdGuard Home DNS (port 53, UI 3030)
├── Elasticsearch (coordinator)
├── Kibana (port 5601)
├── TheHive + Cortex (port 9000)
├── Wazuh Manager
├── [Future] VPN Invite System
├── [Future] Web Hosting Platform
└── SOC Hub

Network Architecture:
├── WireGuard VPN Mesh (10.0.50-52.0/24)
├── User VPN (10.10.10.0/24)
└── Public Internet (selective service exposure)
```

---

## 🚀 Phase 0: SOC Security Stack (All Servers)

**Duration:** 4 hours  
**Location:** `/deployment/soc/`

### Deploy Security Foundation:

```bash
cd "/Users/alex/Projects/MCP Bundle/deployment/soc"
./deploy-all.sh
```

This script deploys (in order):

1. nftables firewall (per-host configuration)
2. Suricata IPS (inline packet inspection)
3. CrowdSec (community threat intelligence)
4. Falco (runtime EDR)
5. Wazuh manager (VMI03) and agents (VMI01, VMI02D)
6. Elasticsearch + Kibana (VMI03)
7. TheHive + Cortex (VMI03)
8. Nightly SOC sync

### Verification:

```bash
./verify-soc.sh
```

### Post-Deployment:

- Access Kibana: `https://154.26.158.31:5601`
- Access TheHive: `https://154.26.158.31:9000`
- Register Wazuh agents: Follow prompts during deployment
- Configure TheHive/Cortex integration

**✅ Deliverable:** Multi-layer security stack protecting all infrastructure

---

## 🏗️ Phase 1: Foundation Services

### VMI01 - Redis & MCP Services

**Duration:** 2 hours  
**Location:** `/deployment/redis/`, `/deployment/scripts/`

#### Step 1: Deploy Redis

```bash
cd "/Users/alex/Projects/MCP Bundle"
scp deployment/redis/configure-redis.sh root@46.250.243.123:/tmp/
ssh root@46.250.243.123 '/tmp/configure-redis.sh'
```

**Credentials:** Saved to `/opt/redis/credentials.txt` on VMI01

#### Step 2: Deploy MCP Services

```bash
cd deployment/scripts
export PERPLEXITY_API_KEY="your-api-key-here"  # Optional
./deploy-mcp-services-enhanced.sh
```

#### Verification:

```bash
curl http://46.250.243.123:3000/health  # Orchestrator
curl http://46.250.243.123:3001/health  # Perplexity MCP
curl http://46.250.243.123:3002/health  # IT-MCP
```

**✅ Deliverable:** MCP services operational with Redis coordination

### VMI03 - Keycloak & HAProxy

**Duration:** 3 hours  
**Location:** `/deployment/keycloak/`, `/deployment/ha/`

⚠️ **IMPORTANT:** Security fixes required before deployment!

#### Pre-Deployment:

1. Review `/deployment/SOC_SECURITY_AUDIT_KEYCLOAK_HAPROXY.md`
2. Implement critical security fixes (estimated 16-24 hours)
3. Or accept risks and deploy with current implementation

#### Deploy Keycloak:

```bash
cd deployment/keycloak
./deploy-native-keycloak.sh
```

#### Deploy HAProxy:

```bash
cd ../ha
./deploy-haproxy.sh
```

**Credentials:** Saved to `/opt/keycloak/credentials.txt` on VMI03

**✅ Deliverable:** SSO authentication and load balancing operational

### VMI03 - Monitoring Stack

**Duration:** 2 hours  
**Location:** `/deployment/monitoring/`, `/deployment/dns/`

#### Deploy All Monitoring:

```bash
cd deployment/monitoring
./deploy-monitoring-stack.sh
```

This deploys:

- Prometheus with all exporters configured
- Grafana with Keycloak SSO and pre-built dashboards
- AdGuard Home DNS with smart filtering

#### Verification:

```bash
curl http://154.26.158.31:9090/-/healthy  # Prometheus
curl http://154.26.158.31:3030/api/health  # Grafana
curl http://154.26.158.31:3030/control/status  # AdGuard
```

**Access URLs:**

- Prometheus: `http://154.26.158.31:9090`
- Grafana: `http://154.26.158.31:3030` (admin credentials in `/opt/grafana/credentials.txt`)
- AdGuard: `http://154.26.158.31:3030` (admin credentials in `/opt/adguard/credentials.txt`)

**✅ Deliverable:** Complete monitoring and DNS filtering

---

## 📺 Phase 2: Media Services (VMI02D)

**Duration:** 3 hours  
**Location:** `/deployment/media/`

### Deploy All Media Services:

```bash
cd deployment/media
./deploy-nextcloud.sh
./deploy-plex.sh
./deploy-transcoding.sh
```

### Verification:

```bash
./validate-deployment.sh
```

**Access URLs:**

- NextCloud: `https://46.250.241.70`
- Plex: `http://46.250.241.70:32400/web`

**Upload Folder:** `/nextcloud/plex-ingest/`

### Workflow Test:

1. Upload video to NextCloud plex-ingest folder
2. Wait 30 seconds (transcoding daemon scans)
3. Check `/opt/plex/movies/` for transcoded file
4. Verify Plex library updated

**✅ Deliverable:** Automated media pipeline operational

---

## 💾 Phase 5: Backup System (All Servers)

**Duration:** 1 hour  
**Location:** `/deployment/backup-dr/`

### Deploy Wasabi S3 Backups:

```bash
cd deployment/backup-dr
./configure-wasabi-s3.sh
./configure-snapshots.sh
```

### Verification:

```bash
./backup-validation.sh
```

**Backup Schedule:**

- Snapshots: Every 6 hours (00:00, 06:00, 12:00, 18:00)
- Validation: Weekly (Sunday 03:00)
- GFS Rotation: Automated (4 hourly, 7 daily, 4 weekly, 12 monthly, 7 yearly)

**Credentials:** Wasabi access configured in `/root/.config/rclone/rclone.conf`

**✅ Deliverable:** Enterprise backup system with 6-hour snapshots

---

## 🌐 Phase 3: VPN Invite System (VMI03)

**Status:** 📋 Architectural Specification Ready  
**Implementation:** 4-6 weeks development required

### Architecture Overview:

**Full-Stack Application:**

- Backend: Express.js + TypeScript (port 3100)
- Frontend: Next.js 14 + React (port 3101)
- Database: PostgreSQL on VMI01
- WireGuard: wg1 interface on port 51823
- Network: 10.10.10.0/24

**Core Features:**

- 2-hour time-limited invite links
- QR code generation for mobile devices
- Platform-specific config downloads (Windows, macOS, Linux, iOS, Android)
- Keycloak SSO authentication
- IP pool management (10.10.10.10-250)
- Full tunnel routing (0.0.0.0/0)
- DNS via AdGuard Home (10.10.10.1)

**Implementation Required:**

- 28 backend files (API, services, models)
- 32 frontend files (pages, components, hooks)
- 10 platform templates
- 4 database migrations
- 12 deployment scripts

### Development Guide:

See `/deployment/VPN_INVITE_SYSTEM_SPECIFICATION.md` for complete implementation details including:

- Database schema
- API endpoints
- Frontend components
- Deployment procedures

**Estimated Timeline:** 4-6 weeks with 1 full-stack developer

---

## 🏢 Phase 4: Web Hosting Platform (VMI03)

**Status:** 📋 Architectural Specification Ready  
**Implementation:** 8-12 weeks development required

### Architecture Overview:

**Enterprise Multi-Tenant Platform:**

- Frontend: Next.js 14 + TypeScript + TailwindCSS + shadcn/ui
- Backend: Express.js + TypeScript + Prisma ORM
- Database: PostgreSQL on VMI01
- Job Queue: BullMQ with Redis
- Real-time: Socket.io

**Core Features:**

- Multi-admin, multi-user architecture
- Automated tenant provisioning
- Domain management + auto-SSL (Let's Encrypt)
- Per-tenant resource quotas (storage, bandwidth, CPU)
- Chrooted SFTP access
- Per-tenant PostgreSQL databases
- Per-tenant PHP-FPM pools
- Nginx dynamic vhost generation
- Automated backups

**Integrations:**

- Keycloak SSO
- CloudFlare CDN
- Stripe payments
- Mux video hosting
- Agora.io live streaming
- Yoti/AU10TIX age verification

**Implementation Required:**

- 40+ backend files (API routes, services, jobs, Prisma schema)
- 50+ frontend files (pages, components, hooks, stores)
- 10+ templates (Nginx, PHP-FPM configs)
- 12+ deployment scripts

### Development Guide:

See `/deployment/WEB_HOSTING_PLATFORM_SPECIFICATION.md` for complete implementation details including:

- Complete Prisma schema
- API documentation (50+ endpoints)
- Component hierarchy
- Integration setup guides
- Deployment automation

**Estimated Timeline:** 8-12 weeks with 2-3 developers

---

## 🧪 Phase 6: Testing & Validation

**Duration:** 1 week  
**Location:** `/deployment/tests/`, `/deployment/automation/`

### Security Validation:

```bash
cd deployment/tests
./security-validation.sh
```

Tests:

- Port scanning (nmap)
- SSL/TLS configuration
- Firewall rules verification
- Service exposure checks
- Authentication testing
- Fail2Ban verification
- SOC stack validation
- Vulnerability scanning (Lynis)

### Backup Validation:

```bash
cd deployment/backup-dr
./backup-validation.sh
```

Tests:

- Rclone connectivity
- Encryption verification
- GFS rotation compliance
- Restore procedures
- Performance metrics
- Storage quotas

### Integration Tests:

```bash
cd deployment/tests
./mcp-integration-tests.sh
```

### Performance Testing:

```bash
./load-testing.sh
```

**✅ Deliverable:** Complete test reports and security validation

---

## 📋 Post-Deployment Checklist

### Phase 0-2 Completion (Infrastructure):

- [ ] All SOC services running (Suricata, CrowdSec, Wazuh, Falco, TheHive)
- [ ] Firewalls configured (nftables on all 3 VMs)
- [ ] Redis operational on VMI01
- [ ] All MCP services healthy (ports 3000-3002)
- [ ] Keycloak SSO configured with all realms
- [ ] HAProxy routing to all backends
- [ ] Prometheus scraping all targets
- [ ] Grafana dashboards displaying metrics
- [ ] AdGuard DNS filtering active
- [ ] NextCloud accessible via HTTPS
- [ ] Plex Media Server operational
- [ ] Video transcoding pipeline working
- [ ] Wasabi backups completing (6-hour snapshots)
- [ ] All services monitored in Grafana

### Security Validation:

- [ ] Port scans show only intended public services
- [ ] SSL/TLS using TLS 1.3 on all HTTPS endpoints
- [ ] VPN-only services not publicly accessible
- [ ] SSH key-only authentication (no passwords)
- [ ] Fail2Ban active on all servers
- [ ] SOC stack detecting and blocking threats
- [ ] Wazuh agents reporting to manager
- [ ] TheHive receiving alerts

### Monitoring Validation:

- [ ] Prometheus metrics from all services
- [ ] Grafana dashboards showing real-time data
- [ ] Alert rules configured and tested
- [ ] Backup validation passing weekly
- [ ] Disk space monitoring active
- [ ] Log rotation configured

### Backup Validation:

- [ ] 6-hour snapshots completing successfully
- [ ] GFS rotation working correctly
- [ ] Test restore successful
- [ ] Encryption verified
- [ ] Notifications working (email + webhook)

### Application Development (Future):

- [ ] VPN invite system specification reviewed
- [ ] Web hosting platform specification reviewed
- [ ] Development team assigned
- [ ] Sprint planning completed
- [ ] Development environments set up

---

## 🔧 Maintenance & Operations

### Daily:

- Monitor Grafana dashboards for anomalies
- Review TheHive for new incidents
- Check backup completion status

### Weekly:

- Review Wazuh alerts in Kibana
- Validate backup integrity
- Review SOC sync reports
- Check disk space on all VMs

### Monthly:

- Security updates (Ubuntu packages)
- Review and update firewall rules
- Performance optimization
- Capacity planning

### Quarterly:

- Full security audit
- Disaster recovery drill
- Documentation updates
- Architecture review

---

## 📚 Documentation Reference

### Completed Infrastructure:

- `/deployment/soc/README.md` - SOC security stack
- `/deployment/redis/README.md` - Redis configuration
- `/deployment/monitoring/README.md` - Monitoring stack
- `/deployment/media/README.md` - Media services
- `/deployment/backup-dr/README.md` - Backup system
- `/deployment/SOC_SECURITY_AUDIT_KEYCLOAK_HAPROXY.md` - Security audit
- `/deployment/DEPLOYMENT_STATUS.md` - Overall status

### Application Specifications:

- `/deployment/VPN_INVITE_SYSTEM_SPECIFICATION.md` - VPN system architecture
- `/deployment/WEB_HOSTING_PLATFORM_SPECIFICATION.md` - Web hosting architecture

### Quick References:

- `/deployment/soc/QUICKSTART.md`
- `/deployment/monitoring/QUICK_REFERENCE.md`
- `/deployment/media/QUICKSTART.md`
- `/deployment/backup-dr/QUICK_REFERENCE.md`

---

## 🚨 Troubleshooting

### Common Issues:

**Issue:** Services not starting after deployment

- Check systemd status: `systemctl status <service>`
- Review logs: `journalctl -u <service> -n 50`
- Verify dependencies running
- Check firewall rules

**Issue:** Cannot access web interfaces

- Verify HAProxy routing: `systemctl status haproxy`
- Check firewall allows port: `nft list ruleset | grep <port>`
- Test from VPN: Connect to WireGuard first
- Review Nginx logs on target server

**Issue:** Backups failing

- Check Wasabi credentials: `rclone config show wasabi`
- Verify network connectivity: `ping s3.wasabisys.com`
- Review logs: `/var/log/wasabi-backup.log`
- Test manual backup: `rclone ls wasabi:mcp-bundle-backups`

**Issue:** Monitoring not showing metrics

- Verify Prometheus targets: `http://154.26.158.31:9090/targets`
- Check exporter running: `systemctl status node_exporter`
- Test endpoint manually: `curl localhost:9100/metrics`
- Review Prometheus logs

### Emergency Contacts:

- **SOC Issues:** Check TheHive for active incidents
- **Infrastructure Down:** Review Grafana for system alerts
- **Security Breach:** Isolate affected VM, review Wazuh/Suricata logs
- **Data Loss:** Restore from Wasabi backups using `/deployment/backup-dr/backup-validation.sh`

---

## 🌐 Cloudflare MCP Mesh Relay (New Deliverable)

**Purpose:** Provide real-time DNS + heartbeat coordination plus an admin-ready data plane for credentials and structured thought timelines.

**Deployment Steps (VMI01 primary, VMI03 optional standby):**

1. Run `./deploy.sh` option **1 (Dev/Test)** to produce `cloudflare-mcp-$VERSION.tar.gz` alongside the other agents.
2. Copy to the target node and execute the generated `deploy-to-server.sh`; it now:
   - Backs up `/opt/mcp/cloudflare-mcp`
   - Installs dependencies via `npm ci --production`
   - Restarts `cloudflare-mcp.service` (systemd) or falls back to PM2
3. Confirm service health:

```bash
systemctl status cloudflare-mcp
curl http://VMI01:3003/healthz
curl http://VMI01:3003/panel/overview | jq '.stats'
curl http://VMI01:3003/panel/structured-thoughts | jq '.summary.progress'
```

4. Validate DNS automation by issuing a heartbeat:

```bash
curl -X POST http://VMI01:3003/mesh/heartbeat \
  -H "Content-Type: application/json" \
  -H "x-heartbeat-token: $CLOUDFLARE_MCP_HEARTBEAT_SECRET" \
  -d @examples/heartbeat.json
```

5. Approve NIC swaps/MAC changes via either HTTP (`POST /mesh/agents/<name>/authorize` with `x-admin-token`) or the MCP tool `mesh.registry.authorize-mac`.

**Admin Panel Feeds:**

- `/panel/overview` → mesh stats + credential printout (hashed fingerprints, hostnames, MACs, heartbeat ages).
- `/panel/structured-thoughts` → structured thinking timeline + diagnostics for the interactive viewer.
- MCP Tool `panel.snapshot` mirrors the same payload so SOC operators can request snapshots directly from their assistants.
- `release_dev/admin-panel` (Next.js) consumes these feeds for Phase 6 dashboards; `npm run panel:snapshot` mirrors the MCP tool for CLI/CI use.

**Health & Monitoring:**

- Prometheus scrape target: `http://VMI01:3003/healthz`
- Loki tail (if enabled): `/var/log/cloudflare-mcp/*.log`
- Grafana dashboard template: import `deployment/monitoring/dashboards/cloudflare-mcp.json` (auto-created when you rerun the monitoring deploy script).

With this deliverable, the admin dashboard tasks in Phase 6 simply consume the new REST feeds instead of reaching into `.keys/`.

---

## 🎯 Success Criteria

**Infrastructure Deployment Success:**

- ✅ All services running and healthy
- ✅ Security stack detecting threats
- ✅ Monitoring showing real-time metrics
- ✅ Backups completing every 6 hours
- ✅ Media pipeline processing videos
- ✅ All tests passing
- ✅ Documentation complete

**Application Development Success (Future):**

- VPN invite system deployed and generating configs
- Web hosting platform hosting multiple tenants
- All integrations working (Stripe, CloudFlare, Mux, etc.)
- Performance targets met (P95 < 500ms)
- Security audit passed
- User acceptance testing complete

---

## 📞 Support & Next Steps

**Immediate Actions:**

1. Review this deployment guide thoroughly
2. Execute Phase 0-2 deployments (1-2 days)
3. Execute Phase 5 backup deployment
4. Run all validation tests
5. Review application specifications for Phases 3-4

**Development Planning:**

1. Assign development team for VPN invite system
2. Assign development team for web hosting platform
3. Set up development environments
4. Create sprint plans based on specifications
5. Begin iterative development

**Questions or Issues:**

- Review relevant `/deployment/*/README.md` files
- Check troubleshooting section above
- Review logs in `/var/log/` on affected server
- Consult security audit for Keycloak/HAProxy issues

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-08  
**Next Review:** After Phase 0-2 completion
