# Secure Credentials Management Guide
## MCP Bundle - Production Security Infrastructure

**Document Version:** 1.0.0
**Last Updated:** November 15, 2025
**Classification:** INTERNAL - Security Best Practices
**Maintained By:** ACDev Security Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Security Findings](#critical-security-findings)
3. [Environment Variable Best Practices](#environment-variable-best-practices)
4. [Secrets Management Solutions](#secrets-management-solutions)
5. [Credential Rotation Procedures](#credential-rotation-procedures)
6. [Emergency Incident Response](#emergency-incident-response)
7. [Production Deployment Security](#production-deployment-security)
8. [Compliance & Audit Requirements](#compliance--audit-requirements)
9. [Development Workflow Security](#development-workflow-security)
10. [Monitoring & Detection](#monitoring--detection)
11. [Tools & Automation](#tools--automation)
12. [Team Training & Awareness](#team-training--awareness)

---

## Executive Summary

This guide establishes comprehensive security standards for credential management across the MCP Bundle infrastructure. All developers, operators, and administrators MUST follow these procedures to protect production systems and sensitive data.

### Scope

This guide applies to:
- All MCP servers (Perplexity, SOC Hub, Admin Panel, etc.)
- All environments (development, staging, production)
- All team members with repository access
- All third-party integrations

### Core Principles

1. **Never commit credentials to version control**
2. **Use strong, unique passwords for every service**
3. **Rotate credentials regularly (90-day maximum)**
4. **Implement least-privilege access control**
5. **Monitor for credential exposure continuously**
6. **Respond to incidents immediately**

---

## Critical Security Findings

### Exposed Credentials (November 2025)

The following critical security issues were identified and remediated:

#### 1. Perplexity API Key Exposure

**Finding:**
- Real Perplexity API key committed to git in `.env` file
- Key: `pplx-REDACTED`
- Exposure: Public repository commit history

**Impact:**
- Unauthorized API usage
- Budget exhaustion ($1/day limit could be exceeded)
- Service disruption
- Compliance violation

**Remediation:**
- ✅ API key rotated in Perplexity dashboard
- ✅ Git history scrubbed (using BFG Repo-Cleaner)
- ✅ .env.example template created with placeholders
- ✅ .gitignore updated to prevent recurrence
- ⏳ Access logs reviewed for unauthorized usage
- ⏳ Budget monitoring enabled

#### 2. Database Credentials Exposure

**Finding:**
- PostgreSQL credentials committed to git
- Database: `mcp_ecosystem`
- User: `mcp_admin`
- Password: `mcp_secure_pass_2024`
- Host: `46.250.243.123` (production IP exposed)

**Impact:**
- Unauthorized database access
- Data breach risk
- Compliance violation (GDPR, SOC 2)
- Network reconnaissance information leak

**Remediation:**
- ✅ Database password rotated
- ✅ Database user privileges reviewed
- ✅ .env.example template created
- ✅ Production IPs removed from templates
- ⏳ Database access logs audited
- ⏳ Connection whitelisting implemented
- ⏳ SSL/TLS enforcement enabled

#### 3. SOC Infrastructure Credentials Exposure

**Finding:**
- Wazuh, Elasticsearch, TheHive credentials in git
- Production IPs exposed: `154.26.158.31`
- Default credentials used (admin/admin for Wazuh)

**Impact:**
- Complete SOC infrastructure compromise
- Security monitoring bypass
- Incident response capability loss
- Regulatory compliance failure

**Remediation:**
- ✅ All SOC credentials rotated
- ✅ Default credentials changed
- ✅ .env.example template created
- ⏳ Wazuh access logs reviewed
- ⏳ Two-factor authentication implemented
- ⏳ IP whitelisting configured

---

## Environment Variable Best Practices

### File Structure

```
project/
├── .env                    # NEVER commit (in .gitignore)
├── .env.example            # Template (safe to commit)
├── .env.development        # Dev overrides (in .gitignore)
├── .env.staging            # Staging overrides (in .gitignore)
├── .env.production         # Production (NEVER in git)
└── .env.local              # Personal overrides (in .gitignore)
```

### Environment-Specific Configuration

#### Development Environment

```bash
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://dev_user:dev_pass@localhost:5432/mcp_dev
REDIS_URL=redis://localhost:6379

# Use test API keys (not production!)
PERPLEXITY_API_KEY=pplx-test-key-development
WAZUH_API_URL=http://localhost:55000
```

**Security Notes:**
- Use separate development credentials
- Never use production API keys in development
- Use local services where possible (localhost)
- Debug logging acceptable (but review before committing code)

#### Staging Environment

```bash
# .env.staging
NODE_ENV=staging
LOG_LEVEL=info
DATABASE_URL=postgresql://staging_user:STRONG_PASSWORD@staging-db.internal:5432/mcp_staging
REDIS_URL=redis://:REDIS_PASSWORD@staging-redis.internal:6379

# Use staging API keys
PERPLEXITY_API_KEY=pplx-staging-key-xxxxxxxxxx
WAZUH_API_URL=https://staging-wazuh.internal:55000
```

**Security Notes:**
- Use production-like security (HTTPS, authentication)
- Separate credentials from production
- Moderate budget limits for cost control
- Enable monitoring but less critical alerting

#### Production Environment

```bash
# .env.production
NODE_ENV=production
LOG_LEVEL=warn
DATABASE_URL=postgresql://prod_user:VERY_STRONG_PASSWORD@prod-db.internal:5432/mcp_production?sslmode=require
REDIS_URL=rediss://:REDIS_PASSWORD@prod-redis.internal:6379

# Production API keys (rotate every 90 days)
PERPLEXITY_API_KEY=pplx-prod-key-XXXXXXXXXXXXXXXX
WAZUH_API_URL=https://prod-wazuh.internal:55000
```

**Security Requirements:**
- SSL/TLS everywhere (`https://`, `rediss://`, `?sslmode=require`)
- Strong passwords (20+ characters, mixed case, numbers, symbols)
- Restricted log levels (warn/error only - no debug!)
- Monitoring and alerting enabled
- Regular credential rotation (90 days maximum)

### Password Strength Requirements

| Environment | Minimum Length | Complexity | Rotation |
|-------------|----------------|------------|----------|
| Development | 12 characters | Alphanumeric | Annually |
| Staging | 16 characters | Mixed case + numbers + symbols | Quarterly (90 days) |
| Production | 20 characters | Mixed case + numbers + symbols + special | Quarterly (90 days) |

**Password Generation:**

```bash
# Generate a strong password (20 characters)
openssl rand -base64 20

# Generate a hex password (32 bytes = 64 characters)
openssl rand -hex 32

# Generate a JWT secret (64 bytes = 128 characters)
openssl rand -hex 64
```

### File Permissions

**Critical: Protect .env files with restrictive permissions**

```bash
# Owner read/write only (600)
chmod 600 .env
chmod 600 .env.production

# Verify permissions
ls -la .env
# Should show: -rw------- (600)

# Wrong permissions (NEVER use these):
# chmod 644 .env  # ❌ World-readable!
# chmod 666 .env  # ❌ World-writable!
# chmod 777 .env  # ❌ Extremely dangerous!
```

**Verify ownership:**

```bash
# Ensure correct ownership
sudo chown $USER:$USER .env

# For production servers (use service user)
sudo chown mcp-service:mcp-service /opt/mcp/.env.production
```

---

## Secrets Management Solutions

### Option 1: HashiCorp Vault (Recommended for Production)

**Overview:**
- Industry-standard secrets management
- Dynamic secrets with automatic rotation
- Audit logging and access control
- Encryption at rest and in transit

**Setup:**

```bash
# Install Vault
wget https://releases.hashicorp.com/vault/1.15.0/vault_1.15.0_linux_amd64.zip
unzip vault_1.15.0_linux_amd64.zip
sudo mv vault /usr/local/bin/

# Initialize Vault
vault server -dev &  # Development mode (use proper config in production)
export VAULT_ADDR='http://127.0.0.1:8200'

# Store secrets
vault kv put secret/mcp/perplexity api_key="pplx-xxxx"
vault kv put secret/mcp/database url="postgresql://..."

# Retrieve secrets in application
vault kv get -field=api_key secret/mcp/perplexity
```

**Integration with MCP:**

```javascript
// lib/vault-client.js
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

async function getSecret(path, key) {
  const result = await vault.read(`secret/data/${path}`);
  return result.data.data[key];
}

// Usage
const perplexityKey = await getSecret('mcp/perplexity', 'api_key');
```

**Production Configuration:**

```hcl
# vault-config.hcl
storage "postgresql" {
  connection_url = "postgres://vault:password@localhost/vault"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/etc/vault/tls/vault.crt"
  tls_key_file  = "/etc/vault/tls/vault.key"
}

seal "awskms" {
  region     = "us-west-2"
  kms_key_id = "alias/vault-seal-key"
}
```

### Option 2: AWS Secrets Manager

**Overview:**
- Managed service (no infrastructure to maintain)
- Automatic rotation for RDS, Redshift, DocumentDB
- Integration with AWS services
- Pay-per-secret pricing ($0.40/month + API calls)

**Setup:**

```bash
# Install AWS CLI
aws configure

# Create secret
aws secretsmanager create-secret \
  --name mcp/perplexity-api-key \
  --secret-string '{"api_key":"pplx-xxxx"}'

# Create database secret with automatic rotation
aws secretsmanager create-secret \
  --name mcp/database-credentials \
  --secret-string '{"username":"mcp_admin","password":"xxxx"}' \
  --rotation-lambda-arn arn:aws:lambda:us-west-2:123456789:function:SecretsManagerRDS
```

**Integration with MCP:**

```javascript
// lib/aws-secrets-client.js
const AWS = require('aws-sdk');
const secretsManager = new AWS.SecretsManager({ region: 'us-west-2' });

async function getSecret(secretName) {
  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  return JSON.parse(data.SecretString);
}

// Usage
const { api_key } = await getSecret('mcp/perplexity-api-key');
```

### Option 3: Azure Key Vault

**Overview:**
- Managed secrets, keys, and certificates
- Hardware Security Module (HSM) backing
- Integration with Azure services
- RBAC and audit logging

**Setup:**

```bash
# Install Azure CLI
az login

# Create Key Vault
az keyvault create \
  --name mcp-secrets \
  --resource-group mcp-rg \
  --location westus2

# Store secret
az keyvault secret set \
  --vault-name mcp-secrets \
  --name perplexity-api-key \
  --value "pplx-xxxx"
```

**Integration with MCP:**

```javascript
// lib/azure-keyvault-client.js
const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

const client = new SecretClient(
  "https://mcp-secrets.vault.azure.net",
  new DefaultAzureCredential()
);

async function getSecret(secretName) {
  const secret = await client.getSecret(secretName);
  return secret.value;
}

// Usage
const apiKey = await getSecret('perplexity-api-key');
```

### Option 4: Doppler (Developer-Friendly)

**Overview:**
- Modern secrets management platform
- Excellent developer experience
- Multi-environment support
- CLI and API access

**Setup:**

```bash
# Install Doppler CLI
brew install dopplerhq/cli/doppler  # macOS
# or
curl -Ls https://cli.doppler.com/install.sh | sh  # Linux

# Login
doppler login

# Set up project
doppler setup

# Store secrets
doppler secrets set PERPLEXITY_API_KEY="pplx-xxxx"
doppler secrets set DATABASE_URL="postgresql://..."

# Run application with secrets
doppler run -- npm start
```

**Integration Benefits:**
- No code changes required
- Automatic .env file generation
- Secret versioning and rollback
- Team collaboration features

### Comparison Matrix

| Feature | Vault | AWS Secrets Manager | Azure Key Vault | Doppler |
|---------|-------|---------------------|-----------------|---------|
| **Cost** | Free (self-hosted) | $0.40/secret/month | $0.03/10k operations | $0/month (free tier) |
| **Dynamic Secrets** | ✅ Yes | ⚠️ Limited | ❌ No | ❌ No |
| **Auto-Rotation** | ✅ Yes | ✅ Yes (RDS, etc.) | ⚠️ Limited | ✅ Yes |
| **Audit Logging** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Encryption** | ✅ AES-256-GCM | ✅ AES-256-GCM | ✅ HSM-backed | ✅ AES-256-GCM |
| **Multi-Cloud** | ✅ Yes | ❌ AWS only | ❌ Azure only | ✅ Yes |
| **Developer UX** | ⚠️ Complex | ⚠️ Moderate | ⚠️ Moderate | ✅ Excellent |
| **Self-Hosted** | ✅ Yes | ❌ No | ❌ No | ❌ No |

**Recommendation:**
- **Small teams / Startups:** Doppler (easiest to set up)
- **AWS-based infrastructure:** AWS Secrets Manager
- **Azure-based infrastructure:** Azure Key Vault
- **Multi-cloud / Large enterprises:** HashiCorp Vault

---

## Credential Rotation Procedures

### Rotation Schedule

| Credential Type | Rotation Frequency | Automation Level |
|-----------------|-------------------|------------------|
| **API Keys** (Perplexity, etc.) | 90 days | Manual |
| **Database Passwords** | 90 days | Automated (Vault) |
| **JWT Secrets** | 90 days | Manual |
| **Service Accounts** | 90 days | Manual |
| **SSH Keys** | 180 days | Manual |
| **SSL/TLS Certificates** | Before expiry (Let's Encrypt: 90 days) | Automated (Certbot) |
| **OAuth Client Secrets** (Keycloak) | 90 days | Manual |

### Rotation Procedure: Perplexity API Key

**Preparation (1 week before):**

1. Schedule maintenance window
2. Notify team of upcoming rotation
3. Prepare new API key generation
4. Review access logs for anomalies

**Execution:**

```bash
# Step 1: Generate new API key in Perplexity dashboard
# https://www.perplexity.ai/settings/api
# Click "Create New API Key"
# Copy key: pplx-NEW_KEY_HERE

# Step 2: Update staging environment first
ssh staging-server
cd /opt/mcp/perplexity-mcp
nano .env
# Replace PERPLEXITY_API_KEY=old_key
# With:    PERPLEXITY_API_KEY=pplx-NEW_KEY_HERE

# Step 3: Restart service
sudo systemctl restart perplexity-mcp

# Step 4: Verify functionality
curl -H "Authorization: Bearer pplx-NEW_KEY_HERE" \
  https://api.perplexity.ai/chat/completions

# Step 5: Monitor for 24 hours in staging

# Step 6: Update production (if staging successful)
ssh production-server
cd /opt/mcp/perplexity-mcp
nano .env
# Update PERPLEXITY_API_KEY

# Step 7: Restart production service
sudo systemctl restart perplexity-mcp

# Step 8: Verify production
# Check logs: journalctl -u perplexity-mcp -f
# Check metrics: curl http://localhost:PORT/health

# Step 9: Revoke old API key in Perplexity dashboard
# https://www.perplexity.ai/settings/api
# Find old key and click "Revoke"

# Step 10: Document rotation
echo "$(date): Perplexity API key rotated" >> /var/log/credential-rotations.log
```

### Rotation Procedure: Database Password

**Using HashiCorp Vault (Automated):**

```bash
# Configure Vault database secrets engine
vault secrets enable database

vault write database/config/postgresql \
  plugin_name=postgresql-database-plugin \
  allowed_roles="mcp-role" \
  connection_url="postgresql://{{username}}:{{password}}@localhost:5432/mcp_ecosystem" \
  username="vault_admin" \
  password="vault_admin_password"

# Create role with 90-day rotation
vault write database/roles/mcp-role \
  db_name=postgresql \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; \
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
  default_ttl="2160h" \  # 90 days
  max_ttl="2160h"

# Vault will automatically rotate credentials
```

**Manual Database Rotation:**

```bash
# Step 1: Connect to database
psql -h localhost -U postgres -d mcp_ecosystem

# Step 2: Generate new password
NEW_PASSWORD=$(openssl rand -base64 24)
echo "New password: $NEW_PASSWORD"  # Save securely!

# Step 3: Update user password
ALTER USER mcp_admin WITH PASSWORD '$NEW_PASSWORD';

# Step 4: Update .env file (as shown above)
# Step 5: Restart services
# Step 6: Verify connectivity
# Step 7: Document rotation
```

### Rotation Procedure: JWT Secret

```bash
# Step 1: Generate new JWT secret
NEW_JWT_SECRET=$(openssl rand -hex 64)
echo "New JWT secret: $NEW_JWT_SECRET"

# Step 2: Update .env with BOTH secrets temporarily
JWT_SECRET=$NEW_JWT_SECRET
JWT_SECRET_OLD=$OLD_JWT_SECRET  # Keep old for token validation

# Step 3: Restart services (will issue new tokens with new secret)

# Step 4: Wait for all old tokens to expire (24 hours typical)

# Step 5: Remove JWT_SECRET_OLD from .env

# Step 6: Restart services again
```

### Emergency Rotation (Credential Compromise)

**If credentials are compromised, execute immediately:**

```bash
#!/bin/bash
# emergency-rotation.sh

set -e

echo "=== EMERGENCY CREDENTIAL ROTATION ==="
echo "Timestamp: $(date)"
echo "Initiated by: $USER"

# 1. Rotate Perplexity API key
echo "1. Rotating Perplexity API key..."
# (Generate new key in dashboard - manual step)
read -p "Enter new Perplexity API key: " NEW_PERPLEXITY_KEY
sed -i "s/PERPLEXITY_API_KEY=.*/PERPLEXITY_API_KEY=$NEW_PERPLEXITY_KEY/" /opt/mcp/perplexity-mcp/.env

# 2. Rotate database password
echo "2. Rotating database password..."
NEW_DB_PASSWORD=$(openssl rand -base64 24)
psql -U postgres -d mcp_ecosystem -c "ALTER USER mcp_admin WITH PASSWORD '$NEW_DB_PASSWORD';"
sed -i "s/DATABASE_URL=postgresql:\/\/mcp_admin:[^@]*/DATABASE_URL=postgresql:\/\/mcp_admin:$NEW_DB_PASSWORD/" /opt/mcp/*/.env

# 3. Rotate JWT secret
echo "3. Rotating JWT secret..."
NEW_JWT_SECRET=$(openssl rand -hex 64)
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$NEW_JWT_SECRET/" /opt/mcp/*/.env

# 4. Restart all services
echo "4. Restarting all MCP services..."
sudo systemctl restart perplexity-mcp soc-hub-mcp admin-panel

# 5. Verify services
echo "5. Verifying service health..."
sleep 5
curl -f http://localhost:3200/health || echo "SOC Hub failed!"
curl -f http://localhost:3100/health || echo "Admin Panel failed!"

# 6. Log rotation
echo "6. Logging rotation event..."
echo "$(date): EMERGENCY ROTATION - Initiated by $USER - Reason: Credential compromise" >> /var/log/credential-rotations.log

# 7. Notify team
echo "7. Notifying security team..."
# (Implement your notification method here - Slack, email, PagerDuty)

echo "=== ROTATION COMPLETE ==="
echo "Review access logs for unauthorized activity!"
echo "Update documentation with new credentials!"
```

---

## Emergency Incident Response

### Incident Response Plan

**Severity Levels:**

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **P0 - Critical** | Production credentials exposed publicly | Immediate (< 15 minutes) | Security team + Management |
| **P1 - High** | Staging credentials exposed or unauthorized access detected | < 1 hour | Security team |
| **P2 - Medium** | Development credentials exposed | < 4 hours | Team lead |
| **P3 - Low** | Weak passwords detected or expired certificates | < 24 hours | Team lead |

### P0 Critical Incident Procedure

**Scenario: Production API key found in public GitHub repository**

**Immediate Actions (< 15 minutes):**

1. **Revoke compromised credential immediately**
   ```bash
   # Revoke in service provider dashboard
   # (Perplexity, AWS, etc.)
   ```

2. **Notify security team**
   ```bash
   # Slack alert
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"🚨 P0 SECURITY INCIDENT: Production API key exposed in GitHub"}' \
     $SLACK_SECURITY_WEBHOOK
   ```

3. **Generate and deploy new credential**
   ```bash
   # Execute emergency rotation script
   sudo /opt/scripts/emergency-rotation.sh
   ```

4. **Review access logs**
   ```bash
   # Check for unauthorized usage
   grep "API_KEY_USAGE" /var/log/mcp/*.log | grep -v "10.0.0.0/8"
   ```

5. **Document incident**
   ```bash
   # Create incident report
   cat > /var/log/incidents/$(date +%Y%m%d-%H%M%S)-p0-api-key-exposure.md <<EOF
   # P0 Security Incident Report

   **Date:** $(date)
   **Severity:** P0 - Critical
   **Type:** Credential Exposure

   ## Summary
   Production Perplexity API key found in public GitHub commit.

   ## Timeline
   - XX:XX - Credential exposed in commit abc123
   - XX:XX - Incident detected by git-secrets scan
   - XX:XX - Key revoked
   - XX:XX - New key deployed

   ## Impact Analysis
   - [ ] Review access logs for unauthorized usage
   - [ ] Check billing for unexpected charges
   - [ ] Verify no data exfiltration occurred

   ## Root Cause
   Developer committed .env file to git instead of .env.example

   ## Action Items
   - [ ] Mandatory training on credential management
   - [ ] Enable pre-commit hooks for all team members
   - [ ] Implement git-secrets on all developer machines
   EOF
   ```

**Post-Incident Actions (< 24 hours):**

1. **Audit all repositories for similar exposures**
   ```bash
   # Scan all repos with truffleHog
   docker run --rm -it dxa4481/trufflehog:latest \
     --regex --entropy=True \
     https://github.com/YourOrg/repo
   ```

2. **Review and update access logs for 30 days prior**

3. **Conduct post-mortem meeting**

4. **Implement preventive measures**
   - Enable git-secrets for all team members
   - Mandatory credential management training
   - Enhanced monitoring and alerting

5. **Update incident response documentation**

### Incident Response Contacts

| Role | Contact | Availability |
|------|---------|--------------|
| **Security Lead** | security@yourdomain.com | 24/7 |
| **Infrastructure Lead** | infrastructure@yourdomain.com | Business hours |
| **On-Call Engineer** | PagerDuty | 24/7 |
| **Management** | management@yourdomain.com | Business hours |

---

## Production Deployment Security

### Pre-Deployment Security Checklist

**Required before any production deployment:**

```bash
#!/bin/bash
# pre-deployment-security-check.sh

echo "=== Pre-Deployment Security Checklist ==="

# 1. Check for .env files in git
echo "1. Checking for committed .env files..."
if git ls-files | grep -q "\.env$"; then
  echo "❌ FAIL: .env files found in git!"
  git ls-files | grep "\.env$"
  exit 1
fi
echo "✅ PASS: No .env files in git"

# 2. Check for hardcoded secrets
echo "2. Scanning for hardcoded secrets..."
if grep -r "api_key\s*=\s*['\"]" --include="*.js" --exclude-dir=node_modules .; then
  echo "❌ FAIL: Hardcoded API keys found!"
  exit 1
fi
echo "✅ PASS: No hardcoded secrets detected"

# 3. Check for production IPs in code
echo "3. Checking for hardcoded production IPs..."
if grep -r "154\.26\.158\.31\|46\.250\.243\.123" --include="*.js" --include="*.md" --exclude-dir=node_modules .; then
  echo "❌ FAIL: Production IPs found in code!"
  exit 1
fi
echo "✅ PASS: No production IPs in code"

# 4. Verify .env.example exists
echo "4. Verifying .env.example files..."
for service in perplexity-mcp soc-hub-mcp admin-panel; do
  if [ ! -f "release_dev/$service/.env.example" ]; then
    echo "❌ FAIL: Missing .env.example for $service"
    exit 1
  fi
done
echo "✅ PASS: All .env.example files present"

# 5. Check .gitignore coverage
echo "5. Verifying .gitignore coverage..."
if ! grep -q "^\.env$" .gitignore; then
  echo "❌ FAIL: .env not in .gitignore!"
  exit 1
fi
echo "✅ PASS: .gitignore properly configured"

# 6. Verify SSL/TLS in production configs
echo "6. Checking for HTTPS enforcement..."
if grep -r "http://" release_dev/*/README.md | grep -i production; then
  echo "⚠️  WARNING: HTTP URLs found in production docs"
fi
echo "✅ PASS: SSL/TLS checks complete"

echo ""
echo "=== SECURITY CHECKLIST COMPLETE ==="
echo "Status: Ready for deployment"
```

### Production .env Template Verification

**Verify all placeholders are replaced:**

```bash
#!/bin/bash
# verify-production-env.sh

ENV_FILE="/opt/mcp/perplexity-mcp/.env"

echo "=== Production .env Verification ==="

# Check for placeholder values
PLACEHOLDERS=(
  "YOUR_"
  "PLACEHOLDER"
  "EXAMPLE"
  "XXX"
  "admin/admin"
  "password123"
  "localhost"
)

for placeholder in "${PLACEHOLDERS[@]}"; do
  if grep -qi "$placeholder" "$ENV_FILE"; then
    echo "❌ FAIL: Placeholder found: $placeholder"
    grep -i "$placeholder" "$ENV_FILE"
    exit 1
  fi
done

# Verify required variables exist
REQUIRED_VARS=(
  "PERPLEXITY_API_KEY"
  "DATABASE_URL"
  "JWT_SECRET"
  "KEYCLOAK_CLIENT_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "^$var=" "$ENV_FILE"; then
    echo "❌ FAIL: Required variable missing: $var"
    exit 1
  fi

  # Check variable is not empty
  VALUE=$(grep "^$var=" "$ENV_FILE" | cut -d'=' -f2-)
  if [ -z "$VALUE" ]; then
    echo "❌ FAIL: Variable is empty: $var"
    exit 1
  fi
done

# Verify NODE_ENV=production
if ! grep -q "NODE_ENV=production" "$ENV_FILE"; then
  echo "❌ FAIL: NODE_ENV is not set to production!"
  exit 1
fi

# Verify HTTPS URLs (not HTTP)
if grep -E "^[A-Z_]+_URL=http://" "$ENV_FILE" | grep -v localhost; then
  echo "⚠️  WARNING: Non-HTTPS URLs detected in production!"
  grep -E "^[A-Z_]+_URL=http://" "$ENV_FILE"
fi

# Check password strength (minimum 20 chars for production)
while IFS= read -r line; do
  if [[ $line =~ PASSWORD=(.+) ]]; then
    PASSWORD="${BASH_REMATCH[1]}"
    if [ ${#PASSWORD} -lt 20 ]; then
      echo "❌ FAIL: Weak password detected (< 20 characters)"
      exit 1
    fi
  fi
done < "$ENV_FILE"

echo "✅ PASS: Production .env verified"
```

### Deployment Automation

**Secure deployment script:**

```bash
#!/bin/bash
# deploy-production.sh

set -e

echo "=== MCP Production Deployment ==="

# 1. Run security checks
./scripts/pre-deployment-security-check.sh || exit 1

# 2. Backup current .env
BACKUP_DIR="/opt/mcp/backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp /opt/mcp/*/.env "$BACKUP_DIR/"

# 3. Pull latest code
git fetch origin
git checkout production
git pull origin production

# 4. Install dependencies (production only)
cd /opt/mcp/perplexity-mcp
npm ci --production
cd /opt/mcp/soc-hub-mcp
npm ci --production

# 5. Run database migrations (if any)
# psql -U postgres -d mcp_ecosystem -f migrations/latest.sql

# 6. Verify .env file
./scripts/verify-production-env.sh || exit 1

# 7. Restart services (one at a time for zero-downtime)
sudo systemctl restart perplexity-mcp
sleep 5
curl -f http://localhost:PORT/health || (echo "Health check failed!" && exit 1)

sudo systemctl restart soc-hub-mcp
sleep 5
curl -f http://localhost:3200/health || (echo "Health check failed!" && exit 1)

# 8. Monitor for errors (5 minutes)
echo "Monitoring services for 5 minutes..."
timeout 300 journalctl -u perplexity-mcp -u soc-hub-mcp -f &
MONITOR_PID=$!
sleep 300
kill $MONITOR_PID 2>/dev/null || true

# 9. Success
echo "=== DEPLOYMENT COMPLETE ==="
echo "Backup location: $BACKUP_DIR"
echo "Verify functionality before closing!"
```

### SSL/TLS Configuration

**Nginx reverse proxy configuration:**

```nginx
# /etc/nginx/sites-available/mcp-production

# SOC Hub MCP
server {
  listen 443 ssl http2;
  server_name soc.yourdomain.com;

  # SSL certificates (Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/soc.yourdomain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/soc.yourdomain.com/privkey.pem;

  # SSL configuration (Mozilla Intermediate)
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
  ssl_prefer_server_ciphers off;

  # HSTS (2 years)
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

  # Security headers
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  # Proxy to SOC Hub
  location / {
    proxy_pass http://localhost:3200;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # WebSocket support
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}

# Redirect HTTP to HTTPS
server {
  listen 80;
  server_name soc.yourdomain.com;
  return 301 https://$server_name$request_uri;
}
```

**Let's Encrypt certificate automation:**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d soc.yourdomain.com

# Auto-renewal (cron job)
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

---

## Compliance & Audit Requirements

### Regulatory Frameworks

**Applicable compliance standards:**

| Framework | Requirement | MCP Implementation |
|-----------|-------------|-------------------|
| **GDPR** | Data encryption at rest/transit | ✅ SSL/TLS + database encryption |
| **GDPR** | Right to deletion | ✅ Data retention policies |
| **GDPR** | Breach notification (72 hours) | ✅ Incident response plan |
| **SOC 2 Type II** | Access control | ✅ RBAC + audit logging |
| **SOC 2 Type II** | Change management | ✅ Git-based deployments |
| **SOC 2 Type II** | Monitoring & alerting | ✅ Prometheus + Grafana |
| **ISO 27001** | Information security policy | ✅ This guide + policies |
| **ISO 27001** | Incident management | ✅ Response procedures |
| **PCI DSS** (if handling payments) | Encryption of cardholder data | N/A (no payment processing) |

### Audit Logging Requirements

**What to log:**

1. **Authentication Events**
   - Login attempts (successful and failed)
   - Logout events
   - Password changes
   - API key usage

2. **Authorization Events**
   - Access denied attempts
   - Role changes
   - Permission modifications

3. **Data Access**
   - Database queries (sensitive tables)
   - API endpoint access
   - File downloads (recordings, reports)

4. **Configuration Changes**
   - .env file modifications
   - Database schema changes
   - Service restarts

5. **Security Events**
   - Credential rotations
   - Failed authentication attempts (>3 in 5 minutes)
   - Suspicious activity patterns

**Log retention:**

| Log Type | Retention Period | Storage Location |
|----------|------------------|------------------|
| **Application logs** | 90 days | `/var/log/mcp/` |
| **Audit logs** | 1 year | PostgreSQL `audit_logs` table |
| **Security logs** | 2 years | SIEM (Wazuh/Elasticsearch) |
| **Credential rotations** | 7 years | `/var/log/credential-rotations.log` |

**Audit log format:**

```json
{
  "timestamp": "2025-11-15T10:30:00.000Z",
  "event_type": "credential_rotation",
  "user": "admin@acdev.com",
  "ip_address": "10.0.1.50",
  "service": "perplexity-mcp",
  "action": "rotate_api_key",
  "status": "success",
  "details": {
    "old_key_prefix": "pplx-REDACTED...",
    "new_key_prefix": "pplx-NewK...",
    "rotation_reason": "scheduled_90day"
  },
  "user_agent": "Mozilla/5.0..."
}
```

### Compliance Checklists

**Quarterly Security Audit (Every 90 days):**

- [ ] All credentials rotated in last 90 days
- [ ] No .env files committed to git (verify with git log search)
- [ ] All production services using HTTPS
- [ ] SSL/TLS certificates valid and auto-renewing
- [ ] Database backups tested (restore verification)
- [ ] Access logs reviewed for anomalies
- [ ] Security patches applied (OS + dependencies)
- [ ] Incident response plan tested (tabletop exercise)
- [ ] Team trained on latest security procedures
- [ ] Third-party security scan completed (if available)

**Annual Compliance Review:**

- [ ] GDPR compliance verified (data processing agreements)
- [ ] SOC 2 audit completed (if required)
- [ ] Penetration testing conducted
- [ ] Disaster recovery plan tested
- [ ] Business continuity plan updated
- [ ] All security policies reviewed and updated
- [ ] Vendor security assessments completed
- [ ] Insurance coverage verified (cyber liability)

---

## Development Workflow Security

### Git Pre-Commit Hooks

**Install git-secrets:**

```bash
# Install git-secrets
brew install git-secrets  # macOS
# or
git clone https://github.com/awslabs/git-secrets.git
cd git-secrets
make install

# Configure for MCP repository
cd /path/to/MCP-Bundle
git secrets --install
git secrets --register-aws  # Detects AWS keys

# Add custom patterns
git secrets --add 'pplx-[A-Za-z0-9]{40,}'  # Perplexity keys
git secrets --add 'postgresql://[^@]+:[^@]+@'  # Database URLs
git secrets --add '154\.26\.158\.\d+'  # Production IPs
git secrets --add '46\.250\.243\.\d+'  # Production IPs
git secrets --add 'mcp_secure_pass_\d+'  # Database passwords

# Test (should fail with dummy secrets)
echo "PERPLEXITY_API_KEY=pplx-test123..." > test.txt
git add test.txt
git commit -m "Test"  # Should be blocked!
```

**Custom pre-commit hook:**

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Running pre-commit security checks..."

# 1. Check for .env files
if git diff --cached --name-only | grep -q "\.env$"; then
  echo "❌ ERROR: Attempting to commit .env file!"
  echo "   Use .env.example for templates"
  exit 1
fi

# 2. Check for secrets with git-secrets
git secrets --pre_commit_hook -- "$@" || exit 1

# 3. Check for TODO markers with credentials
if git diff --cached | grep -i "TODO.*password\|TODO.*api.key"; then
  echo "⚠️  WARNING: TODO with potential credential reference"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "✅ Pre-commit checks passed"
```

### Code Review Guidelines

**Security-focused code review checklist:**

- [ ] No hardcoded credentials in code
- [ ] All API keys loaded from environment variables
- [ ] Database connections use environment URLs
- [ ] No production IPs or hostnames in code
- [ ] Sensitive data logged appropriately (not in debug logs)
- [ ] Input validation implemented for all user inputs
- [ ] SQL queries use parameterized statements (no string concatenation)
- [ ] Authentication/authorization checks present
- [ ] Error messages don't leak sensitive information
- [ ] Dependencies updated (no known vulnerabilities)

**Example: Bad vs Good**

```javascript
// ❌ BAD: Hardcoded credentials
const apiKey = 'pplx-REDACTED';
const dbUrl = 'postgresql://admin:password@154.26.158.31/db';

// ✅ GOOD: Environment variables
const apiKey = process.env.PERPLEXITY_API_KEY;
const dbUrl = process.env.DATABASE_URL;

// ❌ BAD: Logging sensitive data
logger.debug('API call', { apiKey, userPassword });

// ✅ GOOD: Redacted logging
logger.debug('API call', { apiKey: apiKey.substring(0, 10) + '...' });

// ❌ BAD: SQL injection vulnerability
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ✅ GOOD: Parameterized query
const query = 'SELECT * FROM users WHERE id = $1';
db.query(query, [userId]);
```

### Dependency Security

**Automated vulnerability scanning:**

```bash
# Install npm audit (built into npm 6+)
npm audit

# Fix vulnerabilities automatically
npm audit fix

# Install Snyk for advanced scanning
npm install -g snyk
snyk test

# Install Dependabot (GitHub)
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/release_dev/perplexity-mcp"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

**Dependency update policy:**

| Severity | Response Time | Approval Required |
|----------|---------------|-------------------|
| **Critical** (CVSS 9.0-10.0) | Immediate (< 24 hours) | Security team |
| **High** (CVSS 7.0-8.9) | < 7 days | Team lead |
| **Medium** (CVSS 4.0-6.9) | < 30 days | Automated |
| **Low** (CVSS 0.1-3.9) | Next sprint | Automated |

---

## Monitoring & Detection

### Credential Exposure Monitoring

**Automated scanning with truffleHog:**

```bash
# Install truffleHog
pip install truffleHog

# Scan git history
truffleHog --regex --entropy=True \
  file:///path/to/MCP-Bundle

# Scan specific commits
truffleHog --since_commit=abc123 \
  --max_depth=100 \
  file:///path/to/MCP-Bundle

# Automated daily scan (cron job)
0 2 * * * /usr/local/bin/truffleHog \
  --regex --entropy=True \
  file:///opt/MCP-Bundle \
  > /var/log/trufflehog-$(date +\%Y\%m\%d).log 2>&1
```

**GitHub secret scanning:**

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scanning

on:
  push:
    branches: [ main, develop, production ]
  pull_request:
    branches: [ main, develop, production ]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Full history

      - name: Run truffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
```

### Failed Authentication Monitoring

**Wazuh rules for credential-related events:**

```xml
<!-- /var/ossec/etc/rules/local_rules.xml -->

<!-- Detect multiple failed authentication attempts -->
<rule id="100100" level="10">
  <if_sid>5503</if_sid>  <!-- SSH authentication failed -->
  <same_source_ip />
  <frequency>5</frequency>
  <timeframe>300</timeframe>
  <description>Multiple failed SSH authentication attempts</description>
  <mitre>
    <id>T1110</id>  <!-- Brute Force -->
  </mitre>
</rule>

<!-- Detect API key usage from unusual IP -->
<rule id="100101" level="8">
  <decoded_as>json</decoded_as>
  <field name="api_key_used">\.+</field>
  <field name="ip_address">!^10\.0\.|!^192\.168\.</field>
  <description>API key used from external IP address</description>
</rule>

<!-- Detect .env file access -->
<rule id="100102" level="12">
  <if_sid>550</if_sid>  <!-- File access -->
  <match>\.env$</match>
  <description>Access to .env file detected</description>
  <mitre>
    <id>T1552.001</id>  <!-- Credentials in Files -->
  </mitre>
</rule>
```

### Anomaly Detection

**Elasticsearch query for unusual API usage:**

```json
POST /mcp-api-logs-*/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "range": {
            "@timestamp": {
              "gte": "now-1h"
            }
          }
        }
      ],
      "should": [
        {
          "term": {
            "response_status": 401
          }
        },
        {
          "range": {
            "request_count": {
              "gte": 100
            }
          }
        },
        {
          "term": {
            "source_ip_is_internal": false
          }
        }
      ],
      "minimum_should_match": 1
    }
  },
  "aggs": {
    "by_api_key": {
      "terms": {
        "field": "api_key_prefix.keyword",
        "size": 10
      },
      "aggs": {
        "total_requests": {
          "sum": {
            "field": "request_count"
          }
        }
      }
    }
  }
}
```

### Alert Configuration

**Prometheus alert rules:**

```yaml
# /etc/prometheus/rules/mcp-security.yml

groups:
  - name: mcp_security
    interval: 30s
    rules:
      # Alert on high rate of authentication failures
      - alert: HighAuthenticationFailureRate
        expr: rate(authentication_failures_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High authentication failure rate detected"
          description: "{{ $value }} authentication failures per second in the last 5 minutes"

      # Alert on API key used from unusual location
      - alert: APIKeyUnusualLocation
        expr: api_requests_by_country{country!~"AU|US"} > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API key used from unusual country"
          description: "API key used from {{ $labels.country }}"

      # Alert on expired credentials
      - alert: CredentialExpiringSoon
        expr: (credential_expiry_timestamp - time()) < 86400*7
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Credential expiring in less than 7 days"
          description: "{{ $labels.credential_type }} expires on {{ $value | humanizeTimestamp }}"
```

---

## Tools & Automation

### Recommended Security Tools

| Category | Tool | Purpose | Installation |
|----------|------|---------|--------------|
| **Secret Scanning** | git-secrets | Pre-commit hook | `brew install git-secrets` |
| **Secret Scanning** | truffleHog | Git history scanning | `pip install truffleHog` |
| **Secret Scanning** | Gitleaks | Fast secret detection | `brew install gitleaks` |
| **Dependency Scanning** | npm audit | Built-in Node.js scanner | Built-in |
| **Dependency Scanning** | Snyk | Advanced vulnerability scanning | `npm install -g snyk` |
| **Dependency Scanning** | Dependabot | Automated PRs for updates | GitHub integration |
| **Secrets Management** | HashiCorp Vault | Enterprise secrets | Docker or binary |
| **Secrets Management** | Doppler | Developer-friendly | `brew install dopplerhq/cli/doppler` |
| **Password Management** | 1Password CLI | Team password sharing | `brew install 1password-cli` |
| **Encryption** | OpenSSL | Password generation | Built-in (macOS/Linux) |
| **Monitoring** | Wazuh | SIEM / Security monitoring | Docker Compose |
| **Monitoring** | Elasticsearch | Log aggregation | Docker Compose |

### Automation Scripts

**Daily security scan (cron job):**

```bash
#!/bin/bash
# /opt/scripts/daily-security-scan.sh

LOG_FILE="/var/log/security-scans/$(date +%Y%m%d).log"
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo "=== Daily Security Scan: $(date) ==="

  # 1. Scan for secrets in git
  echo "1. Scanning git history for secrets..."
  truffleHog --regex --entropy=True file:///opt/MCP-Bundle || echo "⚠️  Secrets detected!"

  # 2. Check for .env files in git
  echo "2. Checking for .env files in git..."
  cd /opt/MCP-Bundle
  if git ls-files | grep -q "\.env$"; then
    echo "❌ .env files found in git!"
    git ls-files | grep "\.env$"
  fi

  # 3. Check for expired credentials
  echo "3. Checking for expired credentials..."
  # (Implement your credential expiry check here)

  # 4. Scan dependencies for vulnerabilities
  echo "4. Scanning dependencies..."
  cd /opt/MCP-Bundle/release_dev/perplexity-mcp
  npm audit --json > /tmp/npm-audit-perplexity.json
  cd /opt/MCP-Bundle/release_dev/soc-hub-mcp
  npm audit --json > /tmp/npm-audit-soc-hub.json

  # Parse and alert on critical vulnerabilities
  HIGH_VULNS=$(jq '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical' /tmp/npm-audit-*.json | paste -sd+ | bc)
  if [ "$HIGH_VULNS" -gt 0 ]; then
    echo "❌ $HIGH_VULNS high/critical vulnerabilities found!"
  fi

  # 5. Check file permissions on .env files
  echo "5. Checking .env file permissions..."
  find /opt/mcp -name ".env" -type f -exec ls -l {} \; | while read line; do
    PERMS=$(echo "$line" | awk '{print $1}')
    FILE=$(echo "$line" | awk '{print $NF}')
    if [[ ! "$PERMS" =~ ^-rw------- ]]; then
      echo "⚠️  Insecure permissions on $FILE: $PERMS"
    fi
  done

  echo "=== Scan Complete ==="
} | tee "$LOG_FILE"

# Email report if issues found
if grep -q "❌\|⚠️" "$LOG_FILE"; then
  mail -s "Security Scan Issues Detected - $(date +%Y-%m-%d)" \
    security@acdev.com < "$LOG_FILE"
fi
```

**Add to cron:**

```bash
# Run daily at 2 AM
0 2 * * * /opt/scripts/daily-security-scan.sh
```

### Password Manager Integration

**1Password CLI for team credential sharing:**

```bash
# Install 1Password CLI
brew install 1password-cli

# Sign in
op signin

# Store credential
op item create --category=login \
  --title="MCP Production Database" \
  --vault="Engineering" \
  --fields="username=mcp_admin,password=$(openssl rand -base64 24)"

# Retrieve credential in script
DB_PASSWORD=$(op item get "MCP Production Database" --fields password)

# Use in .env generation
cat > /opt/mcp/.env <<EOF
DATABASE_URL=postgresql://mcp_admin:$DB_PASSWORD@localhost/mcp_ecosystem
EOF
```

---

## Team Training & Awareness

### Mandatory Security Training

**New team member onboarding (Week 1):**

- [ ] Read this credential management guide
- [ ] Complete git-secrets installation
- [ ] Configure pre-commit hooks
- [ ] Review incident response procedures
- [ ] Complete password manager setup (1Password/Bitwarden)
- [ ] Practice credential rotation procedure (staging environment)

**Quarterly refresher training:**

- [ ] Review recent security incidents (anonymized)
- [ ] Updates to security policies
- [ ] New threats and attack vectors
- [ ] Hands-on credential rotation drill
- [ ] Incident response tabletop exercise

### Security Champions Program

**Designate security champions on each team:**

- Responsible for security awareness
- First point of contact for security questions
- Participate in monthly security meetings
- Review PRs for security issues
- Conduct lunch-and-learn sessions

### Phishing Awareness

**Credential phishing is the #1 attack vector:**

- Never enter credentials on suspicious sites
- Verify URLs before entering passwords
- Use password manager auto-fill (won't fill on phishing sites)
- Report suspicious emails immediately
- Use 2FA/MFA for all accounts

**Red flags:**
- Urgency ("Your account will be locked!")
- Suspicious sender (check email address, not display name)
- Generic greetings ("Dear user")
- Spelling/grammar errors
- Mismatched URLs (hover before clicking)

---

## Summary & Quick Reference

### Critical Rules (Print and Post)

```
┌─────────────────────────────────────────────────────────┐
│       MCP BUNDLE - CREDENTIAL SECURITY RULES            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ❌ NEVER commit .env files to git                      │
│  ❌ NEVER use default credentials (admin/admin)         │
│  ❌ NEVER share credentials via email/Slack             │
│  ❌ NEVER hardcode credentials in code                  │
│  ❌ NEVER use production credentials in development     │
│                                                          │
│  ✅ ALWAYS use .env.example templates                   │
│  ✅ ALWAYS use strong passwords (20+ characters)        │
│  ✅ ALWAYS rotate credentials every 90 days             │
│  ✅ ALWAYS use HTTPS in production                      │
│  ✅ ALWAYS enable 2FA/MFA where available               │
│                                                          │
│  🚨 IF CREDENTIALS COMPROMISED:                         │
│     1. Rotate immediately (< 15 minutes)                │
│     2. Notify security team                             │
│     3. Review access logs                               │
│     4. Document incident                                │
│                                                          │
│  Questions? security@acdev.com                          │
└─────────────────────────────────────────────────────────┘
```

### Emergency Contacts

| Scenario | Contact | Phone/Email |
|----------|---------|-------------|
| **Credential exposure in git** | Security team | security@acdev.com |
| **Unauthorized access detected** | On-call engineer | PagerDuty |
| **Service outage** | Infrastructure team | infrastructure@acdev.com |
| **General security questions** | Security champion | Ask in #security Slack |

### Useful Commands

```bash
# Generate strong password
openssl rand -base64 24

# Generate JWT secret
openssl rand -hex 64

# Check file permissions
ls -la .env

# Fix file permissions
chmod 600 .env

# Scan for secrets
truffleHog file://.

# Check for .env in git
git ls-files | grep "\.env$"

# Remove file from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch release_dev/perplexity-mcp/.env" \
  --prune-empty --tag-name-filter cat -- --all

# Rotate all credentials (emergency)
sudo /opt/scripts/emergency-rotation.sh
```

---

## Document Control

**Version History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-15 | ACDev Security Team | Initial release |

**Review Schedule:**
- **Quarterly:** Review for updates (every 90 days)
- **Post-Incident:** Update after any security incident
- **Annual:** Comprehensive review and update

**Distribution:**
- All developers with repository access
- Operations team
- Security team
- Management (summary version)

**Acknowledgment Required:**
All team members must acknowledge reading and understanding this guide.

---

**Document End**

For questions, clarifications, or suggestions, contact: security@acdev.com
