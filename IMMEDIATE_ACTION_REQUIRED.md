# 🚨 IMMEDIATE ACTION REQUIRED 🚨
## MCP Bundle - Critical Security Incident Response

**Date:** November 15, 2025
**Classification:** CRITICAL - P0 Security Incident
**Status:** ⏳ URGENT ACTIONS PENDING

---

## ⚠️ CRITICAL SECURITY ALERT ⚠️

**Production credentials have been exposed in git history.**

This document provides immediate action steps. Read this FIRST before proceeding with any other documentation.

---

## 📋 Quick Status

| Component | Status | Action Required |
|-----------|--------|-----------------|
| ✅ **Templates** | Fixed | None - templates sanitized |
| ✅ **.gitignore** | Fixed | None - rules updated |
| ✅ **Documentation** | Complete | Review required |
| 🔴 **API Keys** | EXPOSED | ROTATE IMMEDIATELY |
| 🔴 **DB Credentials** | EXPOSED | ROTATE IMMEDIATELY |
| 🔴 **SOC Credentials** | EXPOSED | ROTATE IMMEDIATELY |

---

## 🚀 IMMEDIATE ACTIONS (Next 4 Hours)

### Step 1: Rotate Perplexity API Key (15 minutes)

```bash
# 1. Go to Perplexity dashboard
open https://www.perplexity.ai/settings/api

# 2. Create new API key (save it securely!)

# 3. Update production .env
ssh production-server
nano /opt/mcp/perplexity-mcp/.env
# Replace: PERPLEXITY_API_KEY=pplx-REDACTED...
# With:    PERPLEXITY_API_KEY=pplx-NEW_KEY_HERE

# 4. Restart service
sudo systemctl restart perplexity-mcp

# 5. Verify
curl http://localhost:PORT/health

# 6. Revoke old key in dashboard
# (Find old key: pplx-REDACTED... and click Revoke)
```

### Step 2: Rotate Database Password (15 minutes)

```bash
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 24)
echo "Save this: $NEW_PASSWORD"

# 2. Update PostgreSQL
psql -h 46.250.243.123 -U postgres -d mcp_ecosystem
ALTER USER mcp_admin WITH PASSWORD 'PASTE_NEW_PASSWORD_HERE';
\q

# 3. Update all .env files
ssh perplexity-server
nano /opt/mcp/perplexity-mcp/.env
# Update: DATABASE_URL=postgresql://mcp_admin:NEW_PASSWORD@...

ssh soc-hub-server
nano /opt/mcp/soc-hub-mcp/.env
# Update: DATABASE_URL=postgresql://mcp_admin:NEW_PASSWORD@...

# 4. Restart services
sudo systemctl restart perplexity-mcp
sudo systemctl restart soc-hub-mcp

# 5. Verify
psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c "SELECT 1;"
```

### Step 3: Rotate Wazuh Password (15 minutes)

```bash
# 1. SSH to Wazuh server
ssh root@154.26.158.31

# 2. Change admin password
/var/ossec/bin/wazuh-passwords --change-password admin
# Enter new strong password

# 3. Update SOC Hub .env
ssh soc-hub-server
nano /opt/mcp/soc-hub-mcp/.env
# Update: WAZUH_API_PASSWORD=NEW_PASSWORD

# 4. Restart SOC Hub
sudo systemctl restart soc-hub-mcp

# 5. Verify
curl -k -u admin:NEW_PASSWORD https://154.26.158.31:55000/
```

### Step 4: Review Access Logs (30 minutes)

```bash
# 1. Check Perplexity usage
# Log in to: https://www.perplexity.ai/settings/api
# Review "Usage History" for:
# - Unexpected spikes
# - Unknown IPs
# - Budget overages

# 2. Check database access
ssh database-server
sudo journalctl -u postgresql -S "2025-11-01" | grep "mcp_admin" > /tmp/db-access.log
# Review for:
# - Failed auth attempts
# - Unknown IPs
# - Suspicious queries

# 3. Check Wazuh access
ssh wazuh-server
tail -1000 /var/ossec/logs/api.log | grep "admin" > /tmp/wazuh-access.log
# Review for:
# - Failed logins
# - Unknown IPs
# - Config changes

# 4. Document findings
cat > /tmp/security-audit-$(date +%Y%m%d).txt <<EOF
=== Access Log Review ===
Date: $(date)

FINDINGS:
[Document any suspicious activity here]

UNAUTHORIZED ACCESS: YES / NO
BUDGET IMPACT: $X.XX
RECOMMENDATIONS:
[List any actions needed]
EOF
```

---

## 📧 NOTIFY SECURITY TEAM

After completing the above rotations, send this email:

```
To: security@acdev.com
Subject: [P0] Credential Rotation Complete - MCP Bundle

Timestamp: [CURRENT_TIME]
Incident: MCP Bundle credential exposure in git

ACTIONS COMPLETED:
[x] Perplexity API key rotated
[x] Database password rotated
[x] Wazuh password rotated
[x] Access logs reviewed

FINDINGS:
- Unauthorized access detected: YES / NO
- Budget impact: $X.XX
- Services operational: YES / NO

NEXT STEPS:
- Complete remaining rotations (Elasticsearch, TheHive)
- Team migration to .env.example workflow
- Git history remediation

Report attached: /tmp/security-audit-YYYYMMDD.txt
```

---

## 📚 DETAILED DOCUMENTATION

For comprehensive procedures, see:

1. **SECURITY_MIGRATION_GUIDE.md** - Complete rotation procedures
   - Location: `/Users/alex/Projects/MCP Bundle/SECURITY_MIGRATION_GUIDE.md`
   - Sections: Emergency Response, Credential Rotation, Git History

2. **SECURE_CREDENTIALS_GUIDE.md** - Best practices and policies
   - Location: `/Users/alex/Projects/MCP Bundle/release_dev/shared/docs/SECURE_CREDENTIALS_GUIDE.md`
   - Sections: Incident Response, Rotation Procedures, Monitoring

3. **SECURITY_CHECKLIST.md** - Verification checklists
   - Location: `/Users/alex/Projects/MCP Bundle/release_dev/shared/docs/SECURITY_CHECKLIST.md`
   - Sections: Pre-Deployment, Quarterly Audit, Incident Response

4. **SECURITY_REMEDIATION_SUMMARY.md** - Executive summary
   - Location: `/Users/alex/Projects/MCP Bundle/SECURITY_REMEDIATION_SUMMARY.md`
   - Sections: Impact Assessment, Actions Completed, Timeline

---

## ✅ VERIFICATION CHECKLIST

Mark each item as you complete it:

### Immediate (Next 4 Hours)

- [ ] Perplexity API key rotated
- [ ] Old Perplexity key revoked
- [ ] Database password rotated
- [ ] All services restarted with new password
- [ ] Wazuh password rotated
- [ ] Elasticsearch password rotated (optional - see guide)
- [ ] TheHive API key rotated (optional - see guide)
- [ ] Access logs reviewed
- [ ] Findings documented
- [ ] Security team notified

### Short-Term (Next 24 Hours)

- [ ] Verify all services operational
- [ ] No errors in logs (check last 100 lines)
- [ ] Database connections working
- [ ] API endpoints responding
- [ ] No unauthorized usage detected
- [ ] Team notified of incident
- [ ] Incident documented
- [ ] Post-incident review scheduled

### Medium-Term (Next Week)

- [ ] All team members install git-secrets
- [ ] All team members migrate to .env.example
- [ ] Pre-commit hooks tested
- [ ] Security training scheduled
- [ ] Git history remediation planned (optional)
- [ ] GitHub security features enabled
- [ ] Lessons learned documented

---

## 🆘 EMERGENCY CONTACTS

| Issue | Contact | Response Time |
|-------|---------|---------------|
| **P0 - Critical** | security@acdev.com | <15 minutes |
| **Technical Issues** | devops@acdev.com | <1 hour |
| **Questions** | #security Slack channel | Best effort |

---

## 🛑 STOP! Before You Continue...

**Have you completed the immediate actions above?**

- ✅ Yes → Proceed to detailed documentation
- ❌ No → Complete rotations FIRST, then review documentation

**Time-sensitive actions MUST be completed within 4 hours!**

---

## 📖 NEXT STEPS

After completing immediate actions:

1. **Read SECURITY_MIGRATION_GUIDE.md** (1,362 lines)
   - Complete team migration section
   - Install git-secrets on all dev machines
   - Review prevention measures

2. **Read SECURE_CREDENTIALS_GUIDE.md** (1,748 lines)
   - Understand secrets management options
   - Review monitoring and detection strategies
   - Implement continuous security scanning

3. **Read SECURITY_CHECKLIST.md** (530 lines)
   - Use pre-deployment checklist for all deployments
   - Schedule quarterly security audits
   - Implement continuous monitoring

4. **Schedule Team Training**
   - All team members read security docs
   - Complete security awareness training
   - Conduct incident response drill

---

## 🔒 WHAT'S BEEN FIXED

To prevent this from happening again:

✅ **Templates Sanitized**
- .env.example files created with placeholders only
- No real credentials in templates
- No production IPs in templates
- Comprehensive security warnings added

✅ **.gitignore Hardened**
- .env files blocked from git
- .env.example templates allowed
- 25+ new credential file patterns added
- Comments explain each rule

✅ **Documentation Created**
- 4,134 lines of comprehensive security documentation
- Emergency response procedures
- Credential rotation playbooks
- Security checklists
- Compliance frameworks

✅ **Prevention Measures**
- Pre-deployment security checklist
- Automated security scan procedures
- Incident response plan
- Team training program
- Continuous monitoring strategy

---

## ⏰ TIMELINE

**November 15, 2025:**
- 08:00 - Security audit completed
- 08:30 - Templates sanitized
- 08:40 - .gitignore updated
- 08:51 - Documentation complete

**PENDING (URGENT):**
- NOW - Rotate all credentials (4 hours)
- TODAY - Review access logs
- TODAY - Notify security team
- THIS WEEK - Team migration
- THIS MONTH - Prevention measures

---

## 📞 SUPPORT

**For immediate assistance:**
- Email: security@acdev.com
- Slack: #security channel
- PagerDuty: On-call engineer (24/7)

**For questions about procedures:**
- See detailed documentation (links above)
- Ask in #security Slack channel
- Contact security team

---

## ⚡ QUICK COMMANDS

```bash
# Generate strong password
openssl rand -base64 24

# Check for .env in git
git ls-files | grep "\.env$"

# Verify service health
curl http://localhost:PORT/health

# View service logs
journalctl -u service-name -f

# Test database connection
psql -h HOST -U USER -d DATABASE -c "SELECT 1;"
```

---

**🚨 REMEMBER: Time is critical! Complete credential rotations within 4 hours! 🚨**

**STATUS:** ⏳ URGENT ACTIONS PENDING

For detailed procedures, see: SECURITY_MIGRATION_GUIDE.md
