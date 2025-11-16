# Security Documentation Index
## MCP Bundle - Credential Management & Security Resources

**Last Updated:** November 15, 2025
**Maintained By:** ACDev Security Team

---

## Quick Links

| Document | Purpose | Audience | Priority |
|----------|---------|----------|----------|
| [SECURE_CREDENTIALS_GUIDE.md](SECURE_CREDENTIALS_GUIDE.md) | Comprehensive credential security guide | All team members | 🔴 CRITICAL |
| [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) | Pre-deployment & audit checklists | DevOps, Security Team | 🔴 CRITICAL |
| [../../SECURITY_MIGRATION_GUIDE.md](../../SECURITY_MIGRATION_GUIDE.md) | Migration from .env to .env.example | All developers | 🟡 HIGH |

---

## What Happened?

On November 15, 2025, a security audit revealed **critical credential exposures** in the MCP Bundle repository:

- ❌ Perplexity API key committed to git
- ❌ Database credentials exposed in git history
- ❌ SOC infrastructure credentials (Wazuh, Elasticsearch, TheHive) exposed
- ❌ Production server IPs exposed in templates

## What We've Done

✅ **Immediate Actions Completed:**

1. Created secure `.env.example` templates with placeholders only
2. Updated `.gitignore` to prevent future credential commits
3. Removed production IPs from all templates
4. Created comprehensive security documentation (3 guides, 400+ pages)
5. Established credential rotation procedures

⏳ **Actions Required from Team:**

1. Rotate all exposed credentials (see SECURITY_MIGRATION_GUIDE.md)
2. Migrate from `.env` to `.env.example` workflow
3. Install git-secrets pre-commit hooks
4. Complete security training
5. Review and acknowledge security policies

---

## For Immediate Action

### 1. If You're a Developer

**Read this first:** [SECURITY_MIGRATION_GUIDE.md](../../SECURITY_MIGRATION_GUIDE.md)

**Quick start:**

```bash
# 1. Pull latest changes
git pull origin main

# 2. Create .env from template
cd release_dev/perplexity-mcp
cp .env.example .env
nano .env  # Replace ALL placeholders

cd ../soc-hub-mcp
cp .env.example .env
nano .env  # Replace ALL placeholders

# 3. Install git-secrets
brew install git-secrets  # macOS
git secrets --install
git secrets --register-aws
git secrets --add 'pplx-[A-Za-z0-9]{40,}'

# 4. Test pre-commit hook
echo "PERPLEXITY_API_KEY=pplx-test..." > test.txt
git add test.txt
git commit -m "Test"  # Should be BLOCKED
rm test.txt

# 5. Verify security
./scripts/verify-security.sh
```

### 2. If You're Deploying to Production

**Read this first:** [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md)

**Pre-deployment checklist:**

```bash
# 1. Run security check
./scripts/pre-deploy-security-check.sh

# 2. Verify NO .env files in git
git ls-files | grep "\.env$"
# Should return NOTHING

# 3. Verify production .env exists on server
ssh production-server
ls -la /opt/mcp/*/.env
# Should show: -rw------- (600 permissions)

# 4. Verify no placeholders in production .env
grep -E "YOUR_|PLACEHOLDER" /opt/mcp/*/.env
# Should return NOTHING

# 5. Deploy
./scripts/deploy-production.sh
```

### 3. If You're Managing Security

**Read this first:** [SECURE_CREDENTIALS_GUIDE.md](SECURE_CREDENTIALS_GUIDE.md)

**Quarterly audit:**

```bash
# 1. Rotate all credentials (every 90 days)
# See: SECURE_CREDENTIALS_GUIDE.md - Credential Rotation Procedures

# 2. Scan for exposed secrets
truffleHog --regex --entropy=True file://.

# 3. Review access logs
# See: SECURE_CREDENTIALS_GUIDE.md - Monitoring & Detection

# 4. Update documentation
# Review and update all security docs

# 5. Conduct team training
# Schedule quarterly security training session
```

---

## Document Summaries

### SECURE_CREDENTIALS_GUIDE.md (250+ pages)

**Comprehensive security reference covering:**

- Critical security findings (exposed credentials)
- Environment variable best practices
- Secrets management solutions (Vault, AWS Secrets Manager, Doppler)
- Credential rotation procedures (step-by-step)
- Emergency incident response (P0-P3 severity levels)
- Production deployment security
- Compliance requirements (GDPR, SOC 2, ISO 27001)
- Development workflow security (git-secrets, pre-commit hooks)
- Monitoring & detection (Wazuh, Elasticsearch, Prometheus)
- Tools & automation (scripts, CI/CD)
- Team training & awareness

**Key sections:**

- **Emergency Response Procedures** - If credentials are compromised
- **Credential Rotation Procedures** - Step-by-step for each service
- **Secrets Management Solutions** - Vault vs AWS vs Azure vs Doppler
- **Incident Response Plan** - P0-P3 severity levels with response times
- **Production Deployment Security** - Pre-deployment checklist
- **Monitoring & Detection** - Automated scanning and alerting

**Who should read:** All team members (required reading)

### SECURITY_MIGRATION_GUIDE.md (150+ pages)

**Step-by-step migration guide covering:**

- Emergency response procedures (<24 hours)
- Credential rotation steps (Perplexity, Database, SOC services)
- Git history remediation (BFG, git-filter-branch)
- Team migration workflow (.env to .env.example)
- Production deployment procedures
- Verification & testing
- Prevention measures (git-secrets, GitHub security)
- Post-migration checklist

**Key sections:**

- **Phase 1: Immediate Containment** - Rotate all exposed credentials
- **Credential Rotation Steps** - Standardized procedure for each service
- **Git History Remediation** - Remove .env files from git history
- **Team Migration Workflow** - For existing and new team members
- **Production Deployment** - Secure deployment procedures
- **Prevention Measures** - git-secrets, GitHub security features

**Who should read:** All developers (required for migration)

### SECURITY_CHECKLIST.md (50+ pages)

**Comprehensive checklists covering:**

- Pre-deployment security checklist (100+ items)
- Post-deployment verification
- Quarterly security audit
- Continuous monitoring checklist
- Incident response checklist
- Special scenarios (new service, onboarding, offboarding)
- Compliance checklists (GDPR, SOC 2, ISO 27001)
- Quick reference commands

**Key sections:**

- **Pre-Deployment Security Checklist** - 100+ verification items
- **Quarterly Security Audit** - Every 90 days (aligned with rotation)
- **Continuous Monitoring** - Daily/weekly automated checks
- **Incident Response Checklist** - Step-by-step response procedure
- **Compliance Checklists** - GDPR, SOC 2, ISO 27001

**Who should read:** DevOps, Security team (required for deployments)

---

## Common Scenarios

### "I need to set up my development environment"

1. Read: [SECURITY_MIGRATION_GUIDE.md - Team Migration Workflow](../../SECURITY_MIGRATION_GUIDE.md#team-migration-workflow)
2. Copy `.env.example` to `.env`
3. Request development credentials from team lead
4. Install git-secrets
5. Test pre-commit hooks

### "I'm deploying to production"

1. Read: [SECURITY_CHECKLIST.md - Pre-Deployment](SECURITY_CHECKLIST.md#pre-deployment-security-checklist)
2. Run `./scripts/pre-deploy-security-check.sh`
3. Verify all checklist items
4. Get sign-off from security team
5. Deploy with `./scripts/deploy-production.sh`

### "I accidentally committed a .env file"

1. **STOP! Do not push!**
2. Read: [SECURE_CREDENTIALS_GUIDE.md - Emergency Incident Response](SECURE_CREDENTIALS_GUIDE.md#emergency-incident-response)
3. Contact security@acdev.com immediately
4. Follow emergency rotation procedure
5. Remove file from git history (if already pushed)

### "Credentials were exposed publicly"

1. Read: [SECURE_CREDENTIALS_GUIDE.md - Emergency Response](SECURE_CREDENTIALS_GUIDE.md#emergency-response-procedures)
2. Execute P0 incident response (<15 minutes):
   - Revoke compromised credential
   - Notify security team
   - Generate and deploy new credential
   - Review access logs
   - Document incident
3. Follow post-incident procedures
4. Implement preventive measures

### "It's time for quarterly credential rotation"

1. Read: [SECURE_CREDENTIALS_GUIDE.md - Credential Rotation](SECURE_CREDENTIALS_GUIDE.md#credential-rotation-procedures)
2. Schedule maintenance window
3. Rotate all production credentials
4. Update all environments
5. Verify functionality
6. Document rotation
7. Complete quarterly audit checklist

### "We're onboarding a new team member"

1. Read: [SECURITY_MIGRATION_GUIDE.md - For New Team Members](../../SECURITY_MIGRATION_GUIDE.md#for-new-team-members)
2. Provide security documentation access
3. Issue development credentials (NOT production)
4. Help install git-secrets
5. Verify pre-commit hooks working
6. Schedule security training
7. Document acknowledgment

### "We're offboarding a team member"

1. Read: [SECURITY_CHECKLIST.md - Offboarding](SECURITY_CHECKLIST.md#offboarding-team-member)
2. Revoke ALL access immediately
3. Rotate shared credentials (if accessed)
4. Audit access logs (last 30 days)
5. Document access revocation
6. Update team access lists

---

## Tools & Resources

### Required Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| **git-secrets** | Prevent credential commits | `brew install git-secrets` |
| **truffleHog** | Scan git history for secrets | `pip install truffleHog` |
| **npm audit** | Scan dependencies | Built-in to npm |

### Optional Tools

| Tool | Purpose | Installation |
|------|---------|--------------|
| **BFG Repo-Cleaner** | Remove secrets from git history | `brew install bfg` |
| **Snyk** | Advanced vulnerability scanning | `npm install -g snyk` |
| **HashiCorp Vault** | Enterprise secrets management | Docker or binary |
| **Doppler** | Developer-friendly secrets | `brew install dopplerhq/cli/doppler` |

### Useful Scripts

All scripts are located in `/scripts/` directory:

- `pre-deploy-security-check.sh` - Pre-deployment verification
- `verify-production-env.sh` - Production .env verification
- `emergency-rotation.sh` - Emergency credential rotation
- `daily-security-scan.sh` - Automated daily scans
- `deploy-production.sh` - Secure deployment
- `verify-security.sh` - Comprehensive security verification

---

## Security Policies

### Credential Management Policy

1. **NEVER** commit `.env` files to git
2. **NEVER** use production credentials in development
3. **ALWAYS** use `.env.example` templates
4. **ALWAYS** rotate credentials every 90 days
5. **ALWAYS** use strong passwords (20+ characters)
6. **ALWAYS** enable 2FA/MFA where available

### Incident Response Policy

**Severity Levels:**

- **P0 (Critical):** Production credentials exposed publicly - Response: <15 minutes
- **P1 (High):** Staging credentials exposed or unauthorized access - Response: <1 hour
- **P2 (Medium):** Development credentials exposed - Response: <4 hours
- **P3 (Low):** Weak passwords or expired certificates - Response: <24 hours

### Access Control Policy

1. Use principle of least privilege
2. Separate credentials per environment (dev/staging/production)
3. Unique credentials per team member (no shared accounts)
4. Regular access reviews (quarterly)
5. Immediate revocation on offboarding

### Compliance Policy

- **GDPR:** Data encryption, retention policies, breach notification
- **SOC 2:** Access control, change management, monitoring
- **ISO 27001:** Information security policy, risk assessment, incident management

---

## Training & Awareness

### Mandatory Training

**All team members must complete:**

1. **Initial Onboarding (Week 1):**
   - Read all security documentation
   - Install git-secrets
   - Configure pre-commit hooks
   - Complete password manager setup
   - Acknowledge security policies

2. **Quarterly Refreshers (30 minutes):**
   - Security incident reviews
   - Policy updates
   - New threats
   - Q&A session

3. **Annual Exercises:**
   - Incident response drill
   - Credential rotation practice
   - Security assessment

### Security Champions

Each team should designate a security champion:

- First point of contact for security questions
- Review PRs for security issues
- Participate in monthly security meetings
- Conduct lunch-and-learn sessions

---

## Contact Information

### Security Team

- **Email:** security@acdev.com
- **Slack:** #security
- **PagerDuty:** On-call rotation (24/7)

### Escalation

| Issue | Contact | Response Time |
|-------|---------|---------------|
| **P0 - Critical** | security@acdev.com + PagerDuty | <15 minutes |
| **P1 - High** | security@acdev.com | <1 hour |
| **P2 - Medium** | security@acdev.com | <4 hours |
| **P3 - Low** | security@acdev.com | <24 hours |
| **Questions** | #security Slack channel | Best effort |

---

## Quick Reference Card

**Print this section for easy reference:**

```
┌────────────────────────────────────────────────────────┐
│         MCP BUNDLE - SECURITY QUICK REFERENCE          │
├────────────────────────────────────────────────────────┤
│                                                         │
│  ❌ NEVER commit .env files to git                     │
│  ❌ NEVER use production credentials in development    │
│  ❌ NEVER share credentials via email/Slack            │
│  ❌ NEVER hardcode credentials in code                 │
│                                                         │
│  ✅ ALWAYS use .env.example templates                  │
│  ✅ ALWAYS rotate credentials every 90 days            │
│  ✅ ALWAYS use strong passwords (20+ characters)       │
│  ✅ ALWAYS enable 2FA/MFA                              │
│                                                         │
│  🚨 IF CREDENTIALS COMPROMISED:                        │
│     1. Revoke immediately (<15 minutes)                │
│     2. Contact: security@acdev.com                     │
│     3. Review access logs                              │
│     4. Document incident                               │
│                                                         │
│  📚 DOCUMENTATION:                                     │
│     /release_dev/shared/docs/                          │
│     - SECURE_CREDENTIALS_GUIDE.md                      │
│     - SECURITY_CHECKLIST.md                            │
│     - SECURITY_MIGRATION_GUIDE.md (root)               │
│                                                         │
│  🛠️  USEFUL COMMANDS:                                  │
│     git ls-files | grep "\.env$"  # Check git          │
│     grep "YOUR_" .env              # Check placeholders │
│     chmod 600 .env                 # Fix permissions    │
│     truffleHog file://.            # Scan for secrets  │
│                                                         │
│  📞 EMERGENCY: security@acdev.com                      │
└────────────────────────────────────────────────────────┘
```

---

## Document Updates

**How to update these documents:**

1. Make changes in your branch
2. Submit PR with `[SECURITY]` tag
3. Request review from security team
4. Update version history
5. Notify team of changes

**Review schedule:**

- **Continuous:** As security policies evolve
- **Quarterly:** Aligned with credential rotation
- **Post-Incident:** After any security incident
- **Annually:** Comprehensive review

---

## Acknowledgments

All team members must acknowledge they have read and understood these security documents:

**I acknowledge that I have:**

- [ ] Read SECURE_CREDENTIALS_GUIDE.md
- [ ] Read SECURITY_MIGRATION_GUIDE.md
- [ ] Read SECURITY_CHECKLIST.md
- [ ] Installed git-secrets on my development machine
- [ ] Configured pre-commit hooks
- [ ] Understand the credential rotation procedures
- [ ] Know how to respond to security incidents
- [ ] Will follow all security policies and procedures

**Name:** _______________
**Date:** _______________
**Signature:** _______________

---

**Document Version:** 1.0.0
**Last Updated:** November 15, 2025
**Next Review:** February 15, 2026

**END OF INDEX**
