# MCP Bundle - Security Checklist
## Production Deployment & Ongoing Security Verification

**Document Version:** 1.0.0
**Last Updated:** November 15, 2025
**Review Frequency:** Before every deployment + Quarterly audits

---

## Pre-Deployment Security Checklist

**CRITICAL: Complete this checklist before EVERY production deployment**

### Environment Configuration

- [ ] All `.env` files excluded from git (verify: `git ls-files | grep "\.env$"` returns nothing)
- [ ] All `.env.example` templates use placeholders only (no real credentials)
- [ ] Production `.env` file exists on server (not in git)
- [ ] All placeholders replaced in production `.env` (grep for `YOUR_`, `PLACEHOLDER`, `EXAMPLE`)
- [ ] `NODE_ENV=production` in production `.env`
- [ ] `LOG_LEVEL=info` or `warn` in production (NOT `debug`)
- [ ] All passwords are 20+ characters with mixed case, numbers, symbols
- [ ] All URLs use HTTPS (except localhost/internal networks)
- [ ] `.env` file permissions are `600` (owner read/write only)
- [ ] `.env` file owned by service user (not root)

### Credential Security

- [ ] No API keys hardcoded in code (checked with: `grep -r "pplx-" --include="*.js"`)
- [ ] No database passwords hardcoded (checked with: `grep -r "password\s*=" --include="*.js"`)
- [ ] No production IPs in code (checked with: `grep -r "154\.26\.158" --include="*.js"`)
- [ ] All credentials rotated in last 90 days (check rotation log)
- [ ] Perplexity API key is production key (not development)
- [ ] Database credentials are production credentials (not shared with dev)
- [ ] JWT secrets are cryptographically strong (64+ characters)
- [ ] Keycloak client secrets are unique per environment

### SSL/TLS Configuration

- [ ] All external services use HTTPS
- [ ] SSL certificates are valid (not expired)
- [ ] SSL certificates auto-renew (Let's Encrypt configured)
- [ ] TLS 1.2 or higher enforced
- [ ] HSTS headers enabled (Strict-Transport-Security)
- [ ] Database connections use SSL (`?sslmode=require` for PostgreSQL)
- [ ] Redis connections use TLS (`rediss://` instead of `redis://`)

### Access Control

- [ ] RBAC enabled (`RBAC_ENABLED=true`)
- [ ] Default role is restrictive (not `admin`)
- [ ] Wazuh SSL verification enabled (`WAZUH_VERIFY_SSL=true`)
- [ ] CORS origins whitelisted (no wildcards: `*`)
- [ ] Rate limiting configured (appropriate limits for production)
- [ ] API authentication required for all endpoints

### Network Security

- [ ] Firewall rules configured (restrict access to services)
- [ ] Services bound to appropriate interfaces (not `0.0.0.0` for internal services)
- [ ] VPN required for SOC service access
- [ ] Database only accessible from application servers
- [ ] Redis only accessible from application servers
- [ ] SSH key-based authentication only (passwords disabled)

### Monitoring & Alerting

- [ ] Health endpoints functional (`/health`, `/api/health`)
- [ ] Monitoring configured (Prometheus, Grafana, etc.)
- [ ] Alerting rules configured (authentication failures, high error rates)
- [ ] Log aggregation configured (centralized logging)
- [ ] Security event logging enabled (Wazuh, SIEM)
- [ ] Access logs retained (minimum 90 days)

### Backup & Recovery

- [ ] Database backups enabled (automated daily)
- [ ] Backup restoration tested (within last 30 days)
- [ ] Configuration backups created (`.env` files backed up securely)
- [ ] Disaster recovery plan documented
- [ ] RTO/RPO defined and achievable

### Code Quality & Dependencies

- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] All dependencies up to date (or documented exceptions)
- [ ] No dev dependencies in production (`npm ci --production`)
- [ ] Source maps disabled in production (or protected)
- [ ] Debug mode disabled (`NODE_ENV=production`)

### Documentation

- [ ] `.env.example` templates up to date
- [ ] README.md updated with deployment instructions
- [ ] Security documentation reviewed (SECURE_CREDENTIALS_GUIDE.md)
- [ ] Incident response plan accessible to on-call team
- [ ] Runbook available for common operations

---

## Post-Deployment Verification

**Complete within 30 minutes of deployment:**

### Service Health

- [ ] All services started successfully (`systemctl status`)
- [ ] Health endpoints return 200 OK
- [ ] No errors in logs (check last 100 lines)
- [ ] CPU usage normal (<50% under normal load)
- [ ] Memory usage normal (<80%)
- [ ] Disk space sufficient (>20% free)

### Functionality

- [ ] Database connections successful
- [ ] Redis connections successful
- [ ] External API calls working (Perplexity, Wazuh, etc.)
- [ ] Authentication working (Keycloak SSO)
- [ ] API endpoints responding correctly
- [ ] Real-time features working (WebSockets, SSE)

### Security

- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] SSL certificate valid
- [ ] Security headers present (X-Content-Type-Options, X-Frame-Options, etc.)
- [ ] Rate limiting functional (test with repeated requests)
- [ ] Authentication required (unauthenticated requests rejected)
- [ ] CORS policy enforced

### Monitoring

- [ ] Metrics collecting (check Prometheus targets)
- [ ] Dashboards updating (check Grafana)
- [ ] Alerts configured (check Alertmanager)
- [ ] Logs flowing to aggregation system
- [ ] No critical alerts firing

---

## Quarterly Security Audit

**Complete every 90 days (aligned with credential rotation):**

### Credential Management

- [ ] All production credentials rotated (API keys, passwords, secrets)
- [ ] Credential rotation documented (log reviewed)
- [ ] Old credentials revoked (verified in service providers)
- [ ] Access logs reviewed for unauthorized usage (last 90 days)
- [ ] No shared accounts detected (each user has unique credentials)
- [ ] Service accounts use principle of least privilege

### Repository Security

- [ ] No `.env` files in git history (scan with truffleHog)
- [ ] No secrets in code (scan with git-secrets)
- [ ] `.gitignore` coverage verified (all credential file patterns)
- [ ] GitHub secret scanning enabled
- [ ] GitHub push protection enabled
- [ ] Dependabot enabled and reviewed
- [ ] No open security alerts in GitHub

### Access Control

- [ ] User access reviewed (remove departed employees)
- [ ] Role assignments reviewed (principle of least privilege)
- [ ] SSH key access reviewed (revoke old keys)
- [ ] API key usage reviewed (revoke unused keys)
- [ ] Database user privileges reviewed
- [ ] VPN access list reviewed

### Vulnerability Management

- [ ] Dependency vulnerabilities addressed (`npm audit`)
- [ ] OS security patches applied
- [ ] Docker images updated (if using containers)
- [ ] Third-party services updated
- [ ] Security advisories reviewed (GitHub, npm, etc.)
- [ ] Penetration test findings addressed (if applicable)

### Compliance

- [ ] GDPR compliance verified (data processing, retention)
- [ ] SOC 2 controls reviewed (if applicable)
- [ ] Audit logs retained (minimum 1 year)
- [ ] Data retention policies enforced
- [ ] Privacy policy up to date
- [ ] Terms of service up to date

### Incident Response

- [ ] Incident response plan reviewed and updated
- [ ] Contact list current (on-call rotation)
- [ ] Escalation procedures tested (tabletop exercise)
- [ ] Backup restoration tested
- [ ] Disaster recovery plan tested
- [ ] Post-mortem process reviewed

### Team Training

- [ ] All team members completed security training
- [ ] New team members onboarded with security checklist
- [ ] Security champions identified on each team
- [ ] Phishing awareness training completed
- [ ] Incident response roles assigned
- [ ] Security documentation reviewed by team

---

## Continuous Monitoring Checklist

**Automated daily (via cron or CI/CD):**

### Automated Scans

- [ ] Git repository scanned for secrets (truffleHog)
- [ ] Dependencies scanned for vulnerabilities (npm audit)
- [ ] File permissions verified on `.env` files (600)
- [ ] SSL certificate expiry checked (>30 days remaining)
- [ ] Disk space monitored (>20% free)
- [ ] Backup success verified

### Log Review (Weekly)

- [ ] Authentication failures reviewed (no brute force attempts)
- [ ] API usage reviewed (no unusual patterns)
- [ ] Error logs reviewed (no recurring issues)
- [ ] Security events reviewed (Wazuh alerts)
- [ ] Database slow queries reviewed
- [ ] Network traffic anomalies investigated

### Access Review (Weekly)

- [ ] API key usage logs reviewed
- [ ] Database connection logs reviewed
- [ ] VPN connection logs reviewed
- [ ] Failed authentication attempts investigated
- [ ] Unusual geographic access investigated

---

## Incident Response Checklist

**If credentials are compromised or suspicious activity detected:**

### Immediate Response (<15 minutes)

- [ ] Identify compromised credential(s)
- [ ] Revoke compromised credential immediately
- [ ] Notify security team (security@acdev.com)
- [ ] Document incident (what, when, where, how)
- [ ] Isolate affected systems (if necessary)

### Investigation (<1 hour)

- [ ] Review access logs (identify unauthorized usage)
- [ ] Check billing/usage (detect fraudulent activity)
- [ ] Identify scope (what systems affected)
- [ ] Determine root cause (how did exposure occur)
- [ ] Assess impact (data breach, service disruption, financial loss)

### Remediation (<4 hours)

- [ ] Rotate ALL potentially affected credentials
- [ ] Deploy new credentials to all environments
- [ ] Restart affected services
- [ ] Verify functionality restored
- [ ] Continue monitoring for 24 hours

### Post-Incident (<24 hours)

- [ ] Complete incident report
- [ ] Conduct post-mortem meeting
- [ ] Identify preventive measures
- [ ] Update security documentation
- [ ] Communicate with stakeholders
- [ ] Implement lessons learned

### Follow-Up (<7 days)

- [ ] Verify all remediation steps completed
- [ ] Implement preventive controls
- [ ] Conduct team training on incident
- [ ] Review and update incident response plan
- [ ] Close incident ticket with documentation

---

## Special Scenarios

### Adding a New Service

- [ ] Create `.env.example` template with placeholders
- [ ] Add `.env` exclusion to `.gitignore`
- [ ] Document all required environment variables
- [ ] Generate strong credentials for new service
- [ ] Configure monitoring and alerting
- [ ] Add to backup procedures
- [ ] Update security documentation

### Onboarding New Team Member

- [ ] Provide access to security documentation
- [ ] Issue development credentials (NOT production)
- [ ] Install git-secrets on their machine
- [ ] Configure pre-commit hooks
- [ ] Complete security training
- [ ] Review credential management procedures
- [ ] Test pre-commit hooks (with dummy secrets)
- [ ] Document acknowledgment of security policies

### Offboarding Team Member

- [ ] Revoke all access credentials immediately
- [ ] Revoke SSH keys
- [ ] Revoke VPN access
- [ ] Revoke database access
- [ ] Revoke API keys (if personal)
- [ ] Remove from GitHub organization
- [ ] Remove from password manager (1Password, etc.)
- [ ] Audit access logs (last 30 days)
- [ ] Rotate shared credentials (if accessed by departing employee)
- [ ] Document access revocation

### Migrating to New Infrastructure

- [ ] Generate new credentials for new environment
- [ ] Test new environment with new credentials
- [ ] Update DNS/load balancers (gradual cutover)
- [ ] Monitor new environment closely (24 hours)
- [ ] Revoke old environment credentials (after verification)
- [ ] Decommission old infrastructure
- [ ] Update documentation with new architecture
- [ ] Verify backups working on new infrastructure

---

## Compliance Checklists

### GDPR Compliance

- [ ] Data processing agreements documented
- [ ] Privacy policy includes all data collection
- [ ] User consent mechanisms implemented
- [ ] Right to erasure (data deletion) functional
- [ ] Right to access (data export) functional
- [ ] Data breach notification process (<72 hours)
- [ ] Data minimization principles followed
- [ ] Data retention policies enforced
- [ ] Cross-border data transfer agreements (if applicable)

### SOC 2 Type II

- [ ] Access control policies documented
- [ ] Change management process followed
- [ ] Monitoring and alerting configured
- [ ] Incident response plan documented and tested
- [ ] Backup and recovery procedures tested
- [ ] Vendor risk assessments completed
- [ ] Security awareness training provided
- [ ] Audit logs retained (1+ year)

### ISO 27001

- [ ] Information security policy documented
- [ ] Risk assessment completed
- [ ] Risk treatment plan implemented
- [ ] Asset inventory maintained
- [ ] Access control policy enforced
- [ ] Cryptography policy implemented
- [ ] Operations security procedures documented
- [ ] Communications security configured
- [ ] System acquisition and development security
- [ ] Supplier relationships managed
- [ ] Incident management process operational
- [ ] Business continuity plan tested

---

## Quick Reference: Common Security Commands

### Check for Secrets in Git

```bash
# Check for .env files in git
git ls-files | grep "\.env$"

# Scan for secrets with truffleHog
truffleHog --regex --entropy=True file://.

# Check for hardcoded API keys
grep -r "pplx-[A-Za-z0-9]" --include="*.js" release_dev/

# Check for database passwords
grep -r "password\s*=\s*['\"]" --include="*.js" release_dev/
```

### Credential Generation

```bash
# Strong password (24 characters)
openssl rand -base64 24

# JWT secret (64 bytes = 128 characters)
openssl rand -hex 64

# Random API key format
openssl rand -base64 32 | tr -d '/+=' | cut -c1-40
```

### File Permissions

```bash
# Set secure .env permissions
chmod 600 .env

# Verify permissions
ls -la .env
# Should show: -rw------- (600)

# Fix ownership
sudo chown mcp-service:mcp-service .env
```

### Service Management

```bash
# Check service status
sudo systemctl status perplexity-mcp

# Restart service
sudo systemctl restart perplexity-mcp

# View logs
journalctl -u perplexity-mcp -f

# Check health endpoint
curl http://localhost:PORT/health
```

### Security Verification

```bash
# Run pre-deployment security check
./scripts/pre-deploy-security-check.sh

# Verify .env configuration
./scripts/verify-production-env.sh

# Check SSL certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Test rate limiting
for i in {1..10}; do curl http://localhost:3200/api/endpoint; done
```

---

## Checklist Completion Tracking

### Pre-Deployment Checklist Status

**Deployment Date:** _______________
**Deployed By:** _______________
**Reviewed By:** _______________

**Environment Configuration:** ⬜ Complete
**Credential Security:** ⬜ Complete
**SSL/TLS Configuration:** ⬜ Complete
**Access Control:** ⬜ Complete
**Network Security:** ⬜ Complete
**Monitoring & Alerting:** ⬜ Complete
**Backup & Recovery:** ⬜ Complete
**Code Quality:** ⬜ Complete
**Documentation:** ⬜ Complete

**Overall Status:** ⬜ APPROVED FOR PRODUCTION

**Sign-off:**
- Deployer: _______________
- Security Team: _______________
- Team Lead: _______________

---

## Quarterly Audit Status

**Audit Period:** Q___ 20___
**Audit Date:** _______________
**Auditor:** _______________

**Credential Management:** ⬜ Complete
**Repository Security:** ⬜ Complete
**Access Control:** ⬜ Complete
**Vulnerability Management:** ⬜ Complete
**Compliance:** ⬜ Complete
**Incident Response:** ⬜ Complete
**Team Training:** ⬜ Complete

**Findings:** _______________
**Remediation Required:** ⬜ Yes ⬜ No
**Next Audit Date:** _______________

**Sign-off:**
- Auditor: _______________
- Security Team: _______________
- Management: _______________

---

## Document Control

**Maintainer:** ACDev Security Team
**Contact:** security@acdev.com
**Last Review:** November 15, 2025
**Next Review:** February 15, 2026 (Quarterly)

**Version History:**

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2025-11-15 | Initial release | ACDev Security Team |

---

**END OF CHECKLIST**

Print this document and keep accessible for all deployments and audits.
