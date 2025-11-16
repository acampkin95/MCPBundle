# Security Migration Guide
## MCP Bundle - Credential Exposure Remediation

**Document Version:** 1.0.0
**Created:** November 15, 2025
**Status:** ACTIVE - Immediate Action Required
**Classification:** CRITICAL SECURITY

---

## Executive Summary

**CRITICAL SECURITY INCIDENT DETECTED**

On November 15, 2025, a comprehensive security audit revealed exposed credentials in the MCP Bundle repository. This guide provides step-by-step procedures for immediate remediation and prevention of future exposures.

### Exposed Credentials Summary

| Component | Credential Type | Severity | Status |
|-----------|----------------|----------|--------|
| Perplexity MCP | API Key | CRITICAL | ⏳ Requires Rotation |
| SOC Hub MCP | Database Password | CRITICAL | ⏳ Requires Rotation |
| SOC Hub MCP | Wazuh Credentials | CRITICAL | ⏳ Requires Rotation |
| SOC Hub MCP | Production IPs | HIGH | ✅ Removed from Templates |
| All Components | .env.example Templates | MEDIUM | ✅ Sanitized |

### Immediate Actions Required

1. ✅ **COMPLETED:** .env.example templates sanitized (placeholders only)
2. ✅ **COMPLETED:** Updated .gitignore to prevent future exposures
3. ✅ **COMPLETED:** Created comprehensive security documentation
4. ⏳ **PENDING:** Rotate all exposed credentials (see procedures below)
5. ⏳ **PENDING:** Scrub git history (optional but recommended)
6. ⏳ **PENDING:** Implement git-secrets pre-commit hooks
7. ⏳ **PENDING:** Conduct security training for all team members

---

## Table of Contents

1. [Emergency Response Procedures](#emergency-response-procedures)
2. [Credential Rotation Steps](#credential-rotation-steps)
3. [Git History Remediation](#git-history-remediation)
4. [Team Migration Workflow](#team-migration-workflow)
5. [Production Deployment Procedures](#production-deployment-procedures)
6. [Verification & Testing](#verification--testing)
7. [Prevention Measures](#prevention-measures)
8. [Post-Migration Checklist](#post-migration-checklist)

---

## Emergency Response Procedures

### Phase 1: Immediate Containment (Complete Within 24 Hours)

#### Step 1.1: Rotate Perplexity API Key

**Severity:** CRITICAL - Exposed key can lead to unauthorized API usage

```bash
# 1. Log in to Perplexity dashboard
# URL: https://www.perplexity.ai/settings/api

# 2. Generate new API key
# - Click "Create New API Key"
# - Copy new key: pplx-NEW_KEY_XXXXXXXXXXXXXXXXXXXXXXXXX
# - Save securely (1Password/Bitwarden)

# 3. Update production .env
ssh your-production-server
cd /opt/mcp/perplexity-mcp
nano .env

# Replace this line:
# PERPLEXITY_API_KEY=pplx-REDACTED

# With:
# PERPLEXITY_API_KEY=pplx-NEW_KEY_XXXXXXXXXXXXXXXXXXXXXXXXX

# 4. Restart service
sudo systemctl restart perplexity-mcp

# 5. Verify functionality
journalctl -u perplexity-mcp -f

# 6. Revoke old API key in Perplexity dashboard
# - Find old key: pplx-REDACTED...
# - Click "Revoke"
# - Confirm revocation

# 7. Document rotation
echo "$(date): Perplexity API key rotated due to exposure in git" \
  >> /var/log/credential-rotations.log
```

**Verification:**

```bash
# Test new API key
curl -X POST https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer pplx-NEW_KEY_XXXXXXXXXXXXXXXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-sonar-small-128k-online",
    "messages": [{"role": "user", "content": "test"}]
  }'

# Should return 200 OK with response
```

#### Step 1.2: Rotate Database Credentials

**Severity:** CRITICAL - Exposed credentials allow database access

```bash
# 1. Generate new strong password
NEW_DB_PASSWORD=$(openssl rand -base64 24)
echo "New password: $NEW_DB_PASSWORD"  # Save securely!

# 2. Connect to PostgreSQL
psql -h 46.250.243.123 -U postgres -d mcp_ecosystem

# 3. Update password
ALTER USER mcp_admin WITH PASSWORD 'NEW_DB_PASSWORD_HERE';

# 4. Update .env files on all servers

# Perplexity MCP
ssh perplexity-server
cd /opt/mcp/perplexity-mcp
nano .env
# Update: DATABASE_URL=postgresql://mcp_admin:NEW_PASSWORD@46.250.243.123:5432/mcp_ecosystem

# SOC Hub MCP
ssh soc-hub-server
cd /opt/mcp/soc-hub-mcp
nano .env
# Update: DATABASE_URL=postgresql://mcp_admin:NEW_PASSWORD@46.250.243.123:5432/mcp_ecosystem

# 5. Restart all services
sudo systemctl restart perplexity-mcp
sudo systemctl restart soc-hub-mcp

# 6. Verify database connectivity
psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c "SELECT 1;"

# 7. Document rotation
echo "$(date): Database password rotated for mcp_admin" \
  >> /var/log/credential-rotations.log
```

#### Step 1.3: Rotate SOC Infrastructure Credentials

**Severity:** CRITICAL - Default credentials used on production systems

##### Wazuh Credentials

```bash
# 1. SSH to Wazuh server
ssh root@154.26.158.31

# 2. Update Wazuh admin password
# Method 1: Using wazuh-passwords tool (recommended)
/var/ossec/bin/wazuh-passwords --change-password admin

# Method 2: Manual (if tool not available)
htpasswd -bc /etc/wazuh-manager/passwords admin NEW_STRONG_PASSWORD

# 3. Restart Wazuh
systemctl restart wazuh-manager

# 4. Update .env in SOC Hub MCP
ssh soc-hub-server
cd /opt/mcp/soc-hub-mcp
nano .env
# Update: WAZUH_API_PASSWORD=NEW_STRONG_PASSWORD

# 5. Restart SOC Hub
sudo systemctl restart soc-hub-mcp

# 6. Verify connection
curl -k -u admin:NEW_STRONG_PASSWORD \
  https://154.26.158.31:55000/security/user/authenticate
```

##### Elasticsearch Credentials

```bash
# 1. SSH to Elasticsearch server
ssh root@154.26.158.31

# 2. Reset elastic user password
/usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic

# Copy new password

# 3. Update .env in SOC Hub MCP
nano /opt/mcp/soc-hub-mcp/.env
# Update: ELASTICSEARCH_PASSWORD=NEW_PASSWORD

# 4. Restart SOC Hub
sudo systemctl restart soc-hub-mcp

# 5. Verify connection
curl -u elastic:NEW_PASSWORD http://154.26.158.31:9200/_cluster/health
```

##### TheHive API Key

```bash
# 1. Log in to TheHive web interface
# URL: http://154.26.158.31:9000

# 2. Navigate to: Profile → API Keys

# 3. Revoke old API key (if exists)

# 4. Create new API key
# - Click "Create API Key"
# - Copy key immediately (shown only once!)

# 5. Update .env in SOC Hub MCP
ssh soc-hub-server
nano /opt/mcp/soc-hub-mcp/.env
# Update: THEHIVE_API_KEY=NEW_API_KEY

# 6. Restart SOC Hub
sudo systemctl restart soc-hub-mcp

# 7. Verify connection
curl -H "Authorization: Bearer NEW_API_KEY" \
  http://154.26.158.31:9000/api/case
```

#### Step 1.4: Review Access Logs

**Check for unauthorized usage of exposed credentials:**

```bash
# 1. Review Perplexity API usage
# Log in to: https://www.perplexity.ai/settings/api
# Check "Usage History" tab for:
# - Unexpected usage spikes
# - Requests from unknown IPs
# - Budget overages

# 2. Review database access logs
ssh database-server
sudo journalctl -u postgresql -S "2025-11-01" | grep "mcp_admin"

# Look for:
# - Failed authentication attempts
# - Connections from unknown IPs
# - Unusual query patterns

# 3. Review Wazuh access logs
ssh wazuh-server
tail -1000 /var/ossec/logs/api.log | grep "admin"

# Look for:
# - Failed login attempts
# - API calls from unknown IPs
# - Unusual activity patterns

# 4. Document findings
cat > /var/log/security-audit-$(date +%Y%m%d).log <<EOF
=== Security Audit: Credential Exposure Review ===
Date: $(date)
Auditor: $USER

PERPLEXITY API:
- Unauthorized usage detected: YES/NO
- Unusual IPs detected: YES/NO
- Budget impact: $X.XX

DATABASE:
- Unauthorized access detected: YES/NO
- Failed login attempts: X
- Suspicious queries: YES/NO

WAZUH:
- Unauthorized access detected: YES/NO
- Failed login attempts: X
- Configuration changes: YES/NO

RECOMMENDATIONS:
[List any findings and recommended actions]
EOF
```

---

## Credential Rotation Steps

### For Each Exposed Credential

Follow this standardized procedure:

#### 1. Preparation

```bash
# Document current state
echo "=== Credential Rotation: [SERVICE_NAME] ===" >> /tmp/rotation-log.txt
echo "Date: $(date)" >> /tmp/rotation-log.txt
echo "Current credential: [REDACTED]" >> /tmp/rotation-log.txt
```

#### 2. Generate New Credential

```bash
# For passwords (20+ characters)
NEW_PASSWORD=$(openssl rand -base64 24)

# For JWT secrets (64+ characters)
NEW_JWT_SECRET=$(openssl rand -hex 64)

# For API keys
# Generate in service provider dashboard
```

#### 3. Update Service Provider

```bash
# Update in service provider's system
# - Perplexity: Dashboard → API Keys
# - Database: ALTER USER command
# - Wazuh: wazuh-passwords tool
# - Keycloak: Admin console → Clients → Credentials
```

#### 4. Update Configuration Files

```bash
# Production .env
ssh production-server
cd /opt/mcp/[service-name]
nano .env
# Update credential value

# Staging .env (if applicable)
ssh staging-server
cd /opt/mcp/[service-name]
nano .env
# Update credential value
```

#### 5. Restart Services

```bash
# Restart affected service
sudo systemctl restart [service-name]

# Wait for service to stabilize
sleep 10

# Check service status
sudo systemctl status [service-name]
```

#### 6. Verify Functionality

```bash
# Test service health endpoint
curl http://localhost:[PORT]/health

# Test actual functionality
# (Service-specific tests)

# Check logs for errors
journalctl -u [service-name] -n 50
```

#### 7. Revoke Old Credential

```bash
# Revoke in service provider's system
# - Perplexity: Revoke old API key
# - Database: (Optional - password already changed)
# - Wazuh: Delete old user or change password
# - Keycloak: Regenerate client secret
```

#### 8. Document Rotation

```bash
# Update rotation log
cat >> /var/log/credential-rotations.log <<EOF
$(date): [SERVICE_NAME] credential rotated
- Reason: Exposed in git repository
- Rotated by: $USER
- Verification: PASS
- Old credential revoked: YES
EOF
```

---

## Git History Remediation

### Option 1: BFG Repo-Cleaner (Recommended)

**Fastest method to remove sensitive files from git history:**

```bash
# 1. Install BFG
# macOS:
brew install bfg

# Linux:
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar
alias bfg='java -jar bfg-1.14.0.jar'

# 2. Clone fresh copy (mirror)
cd /tmp
git clone --mirror https://github.com/YourOrg/MCP-Bundle.git mcp-bundle-mirror
cd mcp-bundle-mirror

# 3. Remove .env files from history
bfg --delete-files .env

# Alternative: Remove files containing secrets
bfg --replace-text passwords.txt  # Create file with: regex:.env.*==>***REMOVED***

# 4. Rewrite history
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 5. Force push (WARNING: Requires coordination!)
git push --force

# 6. Notify team to re-clone
echo "Repository history rewritten. All team members must re-clone!"
```

### Option 2: Git Filter-Branch (Manual)

**More control but slower:**

```bash
# 1. Clone repository
cd /tmp
git clone https://github.com/YourOrg/MCP-Bundle.git
cd MCP-Bundle

# 2. Remove .env files from all branches
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch \
    'release_dev/perplexity-mcp/.env' \
    'release_dev/soc-hub-mcp/.env' \
    '*.env' \
  " \
  --prune-empty --tag-name-filter cat -- --all

# 3. Remove backup refs
rm -rf .git/refs/original/

# 4. Expire reflog
git reflog expire --expire=now --all

# 5. Garbage collect
git gc --prune=now --aggressive

# 6. Force push
git push origin --force --all
git push origin --force --tags
```

### Option 3: GitHub Secret Scanning Remediation

**If repository is on GitHub:**

1. Navigate to: Repository → Settings → Security → Secret scanning alerts
2. Review all detected secrets
3. For each alert:
   - Verify secret is exposed
   - Rotate credential (follow procedures above)
   - Mark alert as "Resolved" (or "Revoked")
4. Enable "Push protection" to prevent future exposures

### Team Coordination for History Rewrite

**Send this message to all team members:**

```
🚨 CRITICAL: Git History Rewrite Required

The MCP Bundle repository history has been rewritten to remove exposed credentials.

ACTION REQUIRED:

1. Backup any local uncommitted changes:
   cd /path/to/MCP-Bundle
   git stash
   git branch backup-$(date +%Y%m%d)

2. Delete local repository:
   cd ..
   rm -rf MCP-Bundle

3. Re-clone from GitHub:
   git clone https://github.com/YourOrg/MCP-Bundle.git
   cd MCP-Bundle

4. Restore uncommitted changes (if any):
   git stash pop

5. Verify .env.example files (NOT .env):
   git status
   # Should NOT show .env files

⚠️  DO NOT force push or attempt to merge old history!

Questions? Contact: security@acdev.com
```

---

## Team Migration Workflow

### For Existing Team Members

**Step-by-step migration from .env to .env.example:**

#### 1. Backup Current Configuration

```bash
# Navigate to MCP Bundle
cd /path/to/MCP-Bundle

# Create backup directory
mkdir -p ~/.mcp-backup

# Backup all .env files
find release_dev -name ".env" -exec cp {} ~/.mcp-backup/ \;

# List backups
ls -la ~/.mcp-backup/
```

#### 2. Pull Latest Changes

```bash
# Pull updated .env.example templates
git pull origin main

# Verify new .env.example files
ls -la release_dev/perplexity-mcp/.env.example
ls -la release_dev/soc-hub-mcp/.env.example
```

#### 3. Create Local .env Files

```bash
# Perplexity MCP
cd release_dev/perplexity-mcp
cp .env.example .env
nano .env
# Replace all placeholders with actual values:
# - YOUR_PERPLEXITY_API_KEY_HERE → pplx-actual-key
# - YOUR_DB_USER → mcp_admin
# - YOUR_DB_PASSWORD → actual-password
# - YOUR_DB_HOST → localhost (or actual host)
# - etc.

# SOC Hub MCP
cd ../soc-hub-mcp
cp .env.example .env
nano .env
# Replace all placeholders with actual values
# - YOUR_WAZUH_HOST → actual IP or hostname
# - YOUR_WAZUH_USER → admin
# - YOUR_WAZUH_PASSWORD → actual-password
# - etc.
```

#### 4. Verify Configuration

```bash
# Check that .env is NOT tracked by git
git status
# Should NOT show .env files

# If .env appears, check .gitignore
cat ../../.gitignore | grep "\.env"
# Should show: .env (and NOT !.env)

# Verify .env has correct values
grep -E "^[A-Z_]+=YOUR_" release_dev/*/. env
# Should return NOTHING (all placeholders replaced)
```

#### 5. Test Services Locally

```bash
# Test Perplexity MCP
cd release_dev/perplexity-mcp
npm install
npm start
# Should start without errors

# In another terminal, test health endpoint
curl http://localhost:PORT/health
# Should return: {"status":"healthy"}

# Test SOC Hub MCP
cd release_dev/soc-hub-mcp
npm install
npm start
# Should start without errors

# Test health endpoint
curl http://localhost:3200/health
# Should return: {"status":"healthy"}
```

#### 6. Set Correct File Permissions

```bash
# Secure .env files (owner read/write only)
chmod 600 release_dev/perplexity-mcp/.env
chmod 600 release_dev/soc-hub-mcp/.env

# Verify permissions
ls -la release_dev/*/.env
# Should show: -rw------- (600)
```

### For New Team Members

**Onboarding procedure:**

#### 1. Clone Repository

```bash
# Clone from GitHub
git clone https://github.com/YourOrg/MCP-Bundle.git
cd MCP-Bundle
```

#### 2. Request Credentials

```bash
# Contact team lead or security team for:
# - Perplexity API key (development key, NOT production!)
# - Database credentials (development database)
# - Keycloak client secret (if applicable)
# - Other service credentials

# Store credentials in password manager (1Password/Bitwarden)
```

#### 3. Create .env Files

```bash
# Perplexity MCP
cd release_dev/perplexity-mcp
cp .env.example .env
nano .env
# Fill in credentials provided by team lead

# SOC Hub MCP
cd ../soc-hub-mcp
cp .env.example .env
nano .env
# Fill in credentials provided by team lead
```

#### 4. Install git-secrets

```bash
# Install git-secrets (prevents committing credentials)
# macOS:
brew install git-secrets

# Linux:
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
sudo make install

# Configure for MCP repository
cd /path/to/MCP-Bundle
git secrets --install
git secrets --register-aws

# Add custom patterns
git secrets --add 'pplx-[A-Za-z0-9]{40,}'  # Perplexity keys
git secrets --add 'postgresql://[^@]+:[^@]+@'  # Database URLs
```

#### 5. Test Pre-Commit Hooks

```bash
# Create test file with dummy secret
echo "PERPLEXITY_API_KEY=pplx-test123..." > test-secret.txt
git add test-secret.txt
git commit -m "Test"

# Should be BLOCKED with error:
# "test-secret.txt:1:PERPLEXITY_API_KEY=pplx-test123... matches pplx-[A-Za-z0-9]{40,}"

# Remove test file
rm test-secret.txt
```

#### 6. Complete Onboarding Checklist

```bash
# Review security documentation
cat release_dev/shared/docs/SECURE_CREDENTIALS_GUIDE.md

# Acknowledge security policies
echo "I have read and understood the credential security policies" \
  > ~/.mcp-security-ack-$(date +%Y%m%d).txt

# Contact security team to confirm completion
# Email: security@acdev.com
```

---

## Production Deployment Procedures

### Pre-Deployment Security Checklist

**Run before EVERY production deployment:**

```bash
#!/bin/bash
# pre-deploy-security-check.sh

echo "=== Pre-Deployment Security Check ==="

ERRORS=0

# 1. Check for .env files in git
echo "1. Checking for committed .env files..."
if git ls-files | grep -q "\.env$"; then
  echo "❌ FAIL: .env files found in git!"
  git ls-files | grep "\.env$"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: No .env files in git"
fi

# 2. Check for secrets in code
echo "2. Scanning for hardcoded secrets..."
if grep -r "pplx-[A-Za-z0-9]" --include="*.js" --exclude-dir=node_modules release_dev/; then
  echo "❌ FAIL: Perplexity API key found in code!"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: No hardcoded API keys"
fi

# 3. Check for production IPs in code
echo "3. Checking for hardcoded IPs..."
if grep -r "154\.26\.158\.31\|46\.250\.243\.123" --include="*.js" --include="*.md" release_dev/; then
  echo "❌ FAIL: Production IPs found in code!"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: No production IPs in code"
fi

# 4. Verify .env.example files exist
echo "4. Verifying .env.example files..."
for service in perplexity-mcp soc-hub-mcp; do
  if [ ! -f "release_dev/$service/.env.example" ]; then
    echo "❌ FAIL: Missing .env.example for $service"
    ERRORS=$((ERRORS + 1))
  fi
done
if [ $ERRORS -eq 0 ]; then
  echo "✅ PASS: All .env.example files present"
fi

# 5. Check .gitignore coverage
echo "5. Verifying .gitignore..."
if ! grep -q "^\.env$" .gitignore; then
  echo "❌ FAIL: .env not in .gitignore!"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ PASS: .gitignore properly configured"
fi

# Summary
echo ""
echo "=== SECURITY CHECK COMPLETE ==="
if [ $ERRORS -gt 0 ]; then
  echo "❌ FAILED with $ERRORS error(s)"
  echo "Fix errors before deploying to production!"
  exit 1
else
  echo "✅ PASSED - Ready for deployment"
  exit 0
fi
```

**Usage:**

```bash
# Make executable
chmod +x scripts/pre-deploy-security-check.sh

# Run before deployment
./scripts/pre-deploy-security-check.sh

# Only proceed if exit code is 0
echo $?  # Should be 0
```

### Production .env Setup

**Never use development .env in production:**

```bash
# 1. SSH to production server
ssh production-server

# 2. Navigate to service directory
cd /opt/mcp/perplexity-mcp

# 3. Create production .env from template
cp .env.example .env

# 4. Fill in PRODUCTION credentials
nano .env

# CRITICAL: Use PRODUCTION values:
# - NODE_ENV=production (NOT development)
# - Production database (NOT dev database)
# - Production API keys (NOT dev keys)
# - HTTPS URLs (NOT HTTP)
# - Strong passwords (20+ characters)

# 5. Verify all placeholders replaced
grep -E "YOUR_|PLACEHOLDER|EXAMPLE" .env
# Should return NOTHING

# 6. Set secure permissions
chmod 600 .env
chown mcp-service:mcp-service .env

# 7. Verify permissions
ls -la .env
# Should show: -rw------- 1 mcp-service mcp-service
```

### Deployment Automation

**Secure deployment script:**

```bash
#!/bin/bash
# deploy-production.sh

set -e  # Exit on error

echo "=== MCP Production Deployment ==="

# 1. Run security checks
./scripts/pre-deploy-security-check.sh || exit 1

# 2. Backup current configuration
BACKUP_DIR="/opt/mcp/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp /opt/mcp/*/.env "$BACKUP_DIR/" 2>/dev/null || true
echo "Backup created: $BACKUP_DIR"

# 3. Pull latest code
git fetch origin
git checkout production
git pull origin production

# 4. Install dependencies (production only, no dev dependencies)
cd /opt/mcp/perplexity-mcp
npm ci --production --ignore-scripts

cd /opt/mcp/soc-hub-mcp
npm ci --production --ignore-scripts

# 5. Verify .env files (should NOT be in git)
if git ls-files | grep -q "\.env$"; then
  echo "❌ ERROR: .env files in git! Aborting deployment."
  exit 1
fi

# 6. Check .env exists (should exist from previous deployment)
if [ ! -f "/opt/mcp/perplexity-mcp/.env" ]; then
  echo "❌ ERROR: Production .env missing! Create from .env.example."
  exit 1
fi

# 7. Restart services (graceful reload)
echo "Restarting services..."
sudo systemctl reload-or-restart perplexity-mcp
sleep 5

# 8. Health check
if ! curl -f http://localhost:PORT/health; then
  echo "❌ ERROR: Health check failed! Rolling back..."
  sudo systemctl restart perplexity-mcp
  exit 1
fi

echo "✅ Perplexity MCP deployed successfully"

# Repeat for other services...
sudo systemctl reload-or-restart soc-hub-mcp
sleep 5

if ! curl -f http://localhost:3200/health; then
  echo "❌ ERROR: SOC Hub health check failed! Rolling back..."
  sudo systemctl restart soc-hub-mcp
  exit 1
fi

echo "✅ SOC Hub MCP deployed successfully"

# 9. Monitor for 5 minutes
echo "Monitoring services for 5 minutes..."
timeout 300 journalctl -u perplexity-mcp -u soc-hub-mcp -f &
MONITOR_PID=$!
sleep 300
kill $MONITOR_PID 2>/dev/null || true

echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "Backup location: $BACKUP_DIR"
echo "Monitor logs for next 24 hours!"
```

---

## Verification & Testing

### Verify Credential Security

**Comprehensive verification checklist:**

```bash
#!/bin/bash
# verify-security.sh

echo "=== Security Verification ==="

# 1. Check .env files NOT in git
echo "1. Checking git status..."
if git ls-files | grep -q "\.env$"; then
  echo "❌ FAIL: .env files in git!"
  exit 1
fi
echo "✅ PASS: No .env files in git"

# 2. Check .env.example files ARE in git
echo "2. Checking .env.example files..."
if ! git ls-files | grep -q "\.env\.example$"; then
  echo "❌ FAIL: .env.example files missing from git!"
  exit 1
fi
echo "✅ PASS: .env.example files in git"

# 3. Check .env.example has NO real credentials
echo "3. Checking .env.example for placeholders..."
if grep -E "pplx-[A-Za-z0-9]{40}|mcp_secure_pass|154\.26\.158\.|46\.250\.243\." release_dev/*/.env.example; then
  echo "❌ FAIL: Real credentials found in .env.example!"
  exit 1
fi
echo "✅ PASS: .env.example uses placeholders only"

# 4. Check .env has real credentials (not placeholders)
echo "4. Checking .env for real values..."
for env_file in release_dev/*/.env; do
  if [ -f "$env_file" ]; then
    if grep -q "YOUR_\|PLACEHOLDER" "$env_file"; then
      echo "❌ FAIL: Placeholders found in $env_file"
      exit 1
    fi
  fi
done
echo "✅ PASS: .env files have real values"

# 5. Check file permissions
echo "5. Checking .env file permissions..."
for env_file in release_dev/*/.env; do
  if [ -f "$env_file" ]; then
    PERMS=$(stat -f "%A" "$env_file" 2>/dev/null || stat -c "%a" "$env_file")
    if [ "$PERMS" != "600" ]; then
      echo "❌ FAIL: Insecure permissions on $env_file: $PERMS"
      exit 1
    fi
  fi
done
echo "✅ PASS: .env files have secure permissions (600)"

# 6. Check .gitignore coverage
echo "6. Checking .gitignore..."
if ! grep -q "^\.env$" .gitignore; then
  echo "❌ FAIL: .env not in .gitignore"
  exit 1
fi
if grep -q "^!\.env$" .gitignore; then
  echo "❌ FAIL: .gitignore allows .env files!"
  exit 1
fi
echo "✅ PASS: .gitignore properly configured"

# 7. Check for git-secrets hooks
echo "7. Checking git-secrets..."
if [ ! -f ".git/hooks/pre-commit" ]; then
  echo "⚠️  WARNING: pre-commit hook not installed"
fi
echo "ℹ️  INFO: Run 'git secrets --install' to enable"

echo ""
echo "=== VERIFICATION COMPLETE ==="
echo "✅ Security checks passed!"
```

### Test Services

**Verify services work with new credentials:**

```bash
#!/bin/bash
# test-services.sh

echo "=== Service Testing ==="

# 1. Test Perplexity MCP
echo "1. Testing Perplexity MCP..."
cd release_dev/perplexity-mcp
npm start &
PID=$!
sleep 10

# Test health endpoint
if curl -f http://localhost:PORT/health; then
  echo "✅ Perplexity MCP health check passed"
else
  echo "❌ Perplexity MCP health check failed"
  kill $PID
  exit 1
fi

# Test API key (if public endpoint available)
# curl -X POST http://localhost:PORT/api/search -d '{"query":"test"}'

kill $PID
echo "✅ Perplexity MCP tests passed"

# 2. Test SOC Hub MCP
echo "2. Testing SOC Hub MCP..."
cd ../soc-hub-mcp
npm start &
PID=$!
sleep 10

# Test health endpoint
if curl -f http://localhost:3200/health; then
  echo "✅ SOC Hub MCP health check passed"
else
  echo "❌ SOC Hub MCP health check failed"
  kill $PID
  exit 1
fi

# Test database connection
if curl -f http://localhost:3200/api/health/database; then
  echo "✅ Database connection verified"
else
  echo "❌ Database connection failed"
  kill $PID
  exit 1
fi

kill $PID
echo "✅ SOC Hub MCP tests passed"

echo ""
echo "=== ALL TESTS PASSED ==="
```

---

## Prevention Measures

### Install git-secrets (REQUIRED)

**All team members MUST install git-secrets:**

```bash
# macOS
brew install git-secrets

# Linux
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
sudo make install

# Configure for MCP Bundle
cd /path/to/MCP-Bundle
git secrets --install

# Register AWS patterns (includes common secrets)
git secrets --register-aws

# Add custom MCP patterns
git secrets --add 'pplx-[A-Za-z0-9]{40,}'  # Perplexity API keys
git secrets --add 'postgresql://[^@]+:[^@]+@'  # Database connection strings
git secrets --add '154\.26\.158\.\d{1,3}'  # Production IP (VMI03)
git secrets --add '46\.250\.243\.\d{1,3}'  # Production IP (Database)
git secrets --add 'mcp_secure_pass_\d+'  # Database password pattern

# Test (should be blocked)
echo "PERPLEXITY_API_KEY=pplx-test..." > test.txt
git add test.txt
git commit -m "Test"  # Should FAIL

# Clean up
rm test.txt
```

### Enable GitHub Security Features

**Configure repository security on GitHub:**

1. **Secret Scanning:**
   - Navigate to: Repository → Settings → Security & analysis
   - Enable: "Secret scanning"
   - Enable: "Push protection"

2. **Dependabot:**
   - Enable: "Dependabot alerts"
   - Enable: "Dependabot security updates"

3. **Code Scanning:**
   - Enable: "Code scanning"
   - Set up: CodeQL analysis workflow

### Automated Security Scanning (CI/CD)

**GitHub Actions workflow:**

```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [ main, develop, production ]
  pull_request:
    branches: [ main, develop, production ]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Full history for truffleHog

      - name: Run truffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD

  dependency-scan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [perplexity-mcp, soc-hub-mcp]
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd release_dev/${{ matrix.service }}
          npm ci

      - name: Run npm audit
        run: |
          cd release_dev/${{ matrix.service }}
          npm audit --production --audit-level=moderate

  env-file-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Check for .env files
        run: |
          if git ls-files | grep -q "\.env$"; then
            echo "❌ ERROR: .env files found in repository!"
            git ls-files | grep "\.env$"
            exit 1
          fi
          echo "✅ No .env files in repository"

      - name: Verify .env.example exists
        run: |
          for service in perplexity-mcp soc-hub-mcp; do
            if [ ! -f "release_dev/$service/.env.example" ]; then
              echo "❌ ERROR: Missing .env.example for $service"
              exit 1
            fi
          done
          echo "✅ All .env.example files present"
```

### Team Training (MANDATORY)

**Schedule security training sessions:**

1. **Initial Training (2 hours):**
   - Overview of credential exposure risks
   - Walkthrough of this migration guide
   - Hands-on: git-secrets installation
   - Hands-on: .env.example to .env workflow
   - Quiz: Test comprehension

2. **Quarterly Refreshers (30 minutes):**
   - Review of recent security incidents (industry-wide)
   - Updates to security policies
   - New threats and attack vectors
   - Q&A session

3. **Incident Response Drills (Annually):**
   - Tabletop exercise: Credential exposure scenario
   - Practice: Emergency rotation procedure
   - Review: Access log analysis
   - Update: Incident response documentation

---

## Post-Migration Checklist

### Immediate (Within 24 Hours)

- [ ] All exposed credentials rotated
- [ ] Access logs reviewed for unauthorized usage
- [ ] .env.example templates sanitized and committed
- [ ] .gitignore updated to prevent future exposures
- [ ] Team notified of security incident and migration
- [ ] Production services verified operational
- [ ] Security documentation created and published

### Short-Term (Within 1 Week)

- [ ] Git history scrubbed (if decided to proceed)
- [ ] All team members migrated to .env workflow
- [ ] git-secrets installed on all development machines
- [ ] Pre-commit hooks tested and verified
- [ ] GitHub security features enabled
- [ ] CI/CD security scans configured
- [ ] Credential rotation schedule established

### Long-Term (Within 1 Month)

- [ ] Security training completed for all team members
- [ ] Secrets management solution evaluated (Vault/Doppler)
- [ ] Automated credential rotation implemented
- [ ] Security monitoring and alerting configured
- [ ] Incident response plan tested (tabletop exercise)
- [ ] Compliance audit completed (GDPR, SOC 2, etc.)
- [ ] Post-mortem conducted and documented

### Ongoing (Continuous)

- [ ] Daily automated security scans
- [ ] Weekly access log reviews
- [ ] Monthly security awareness reminders
- [ ] Quarterly credential rotations
- [ ] Annual security audits
- [ ] Continuous monitoring for exposed credentials

---

## Support & Resources

### Documentation

- **Secure Credentials Guide:** `/release_dev/shared/docs/SECURE_CREDENTIALS_GUIDE.md`
- **Git Secrets Documentation:** https://github.com/awslabs/git-secrets
- **BFG Repo-Cleaner:** https://rtyley.github.io/bfg-repo-cleaner/
- **GitHub Secret Scanning:** https://docs.github.com/en/code-security/secret-scanning

### Contacts

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| **Emergency (P0)** | security@acdev.com | < 15 minutes |
| **Security Questions** | security@acdev.com | < 4 hours (business hours) |
| **Technical Support** | support@acdev.com | < 24 hours |
| **Training Requests** | training@acdev.com | < 48 hours |

### Incident Reporting

**If you discover exposed credentials:**

1. **DO NOT** commit or push changes
2. **DO NOT** panic or delete files
3. **DO** immediately contact: security@acdev.com
4. **DO** document what you found:
   - What credential was exposed?
   - Where was it found? (file, commit, branch)
   - How long has it been exposed?
   - Who has access to the repository?

### FAQ

**Q: I accidentally committed a .env file. What should I do?**

A: STOP! Do not push! Contact security@acdev.com immediately. If already pushed, follow the emergency rotation procedure in this guide.

**Q: Can I use the same .env file for dev and production?**

A: NO! Never use production credentials in development. Always use separate .env files with separate credentials.

**Q: How do I share .env configuration with my team?**

A: Use .env.example templates (safe to commit). Share actual credentials securely via password manager (1Password/Bitwarden) or secrets management system.

**Q: Do I need to rotate credentials if I only committed .env to a private repository?**

A: YES! Private repositories can become public, be accessed by former employees, or be compromised. Always rotate exposed credentials.

**Q: How often should I rotate production credentials?**

A: Minimum every 90 days. More frequently for high-security environments (30-60 days).

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-15 | ACDev Security Team | Initial release - Critical security incident response |

**Review Schedule:**
- Post-incident review (after all rotations complete)
- Update as procedures evolve
- Review quarterly with security team

**Acknowledgment:**

By continuing to work with the MCP Bundle repository, you acknowledge that you have read, understood, and will follow the procedures outlined in this migration guide.

---

**END OF DOCUMENT**

For immediate security assistance: security@acdev.com
