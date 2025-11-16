# Secrets Import Instructions

This guide will help you import existing secrets from `.env` files into the Contabo Secrets API and clean up hardcoded credentials from the repository.

## What Gets Imported

The following secrets will be extracted and imported:

| Secret | Source | Contabo Name |
|--------|--------|--------------|
| **PERPLEXITY_API_KEY** | `release_dev/perplexity-mcp/.env` | `perplexity-api-key` |
| **DB_ADMIN_PASSWORD** | `release_dev/perplexity-mcp/.env` (from DATABASE_URL) | `mcp-db-admin-password` |
| **MCP_ROOT_PASSWORD** | Set manually if needed | `mcp-root-password` |
| **DB_REPL_PASSWORD** | Set manually if needed | `mcp-db-repl-password` |
| **WORM_ACCESS_PASSWORD** | Set manually if needed | `worm-access-password` |

## Prerequisites

1. **Contabo API Credentials**: You need your Contabo API credentials. See `docs/Contabo Secrets API.pdf` for setup instructions.

2. **Required Environment Variables**:
   ```bash
   export CONTABO_CLIENT_ID=...
   export CONTABO_CLIENT_SECRET=...
   export CONTABO_API_USER=admin@example.com
   export CONTABO_API_PASSWORD=...
   ```

3. **Optional Secrets**: If you have additional secrets to import:
   ```bash
   export MCP_ROOT_PASSWORD=...        # Root SSH password for VMs
   export DB_REPL_PASSWORD=...          # PostgreSQL replication password
   export WORM_ACCESS_PASSWORD=...      # SFTP drop-zone password
   ```

## Quick Start (Automated)

The easiest way to import all secrets is to use the provided script:

```bash
# 1. Set Contabo API credentials
export CONTABO_CLIENT_ID=your_client_id
export CONTABO_CLIENT_SECRET=your_client_secret
export CONTABO_API_USER=your_email@example.com
export CONTABO_API_PASSWORD=your_api_password

# 2. Optionally set additional secrets
export MCP_ROOT_PASSWORD=your_root_password
export DB_REPL_PASSWORD=your_repl_password
export WORM_ACCESS_PASSWORD=your_worm_password

# 3. Run the import script
./import-secrets.sh
```

The script will:
1. ✅ Add `PERPLEXITY_API_KEY` to the secrets tool
2. ✅ Extract secrets from `.env` files
3. ✅ Upload secrets to Contabo
4. ✅ Update `.env` files to reference Contabo Secrets
5. ✅ Create backups of modified files

## Manual Import (Step-by-Step)

If you prefer to do this manually:

### Step 1: Update Secrets Tool

First, add the PERPLEXITY_API_KEY definition to `src/tools/contaboSecrets.ts`:

```bash
# Fix ownership if needed
sudo chown $(whoami):staff src/tools/contaboSecrets.ts
```

Add this to the `SECRET_DEFINITIONS` array (before the closing `]`):

```typescript
  {
    envVar: 'PERPLEXITY_API_KEY',
    name: 'perplexity-api-key',
    type: 'password',
    description: 'Perplexity AI API key for search and research capabilities.',
  },
```

### Step 2: Extract Secrets

From `release_dev/perplexity-mcp/.env`:

```bash
# Extract API key
export PERPLEXITY_API_KEY=pplx-REDACTED

# Extract DB password
export DB_ADMIN_PASSWORD=mcp_secure_pass_2024
```

### Step 3: Push to Contabo

```bash
npm run secrets:push
```

### Step 4: Verify

```bash
npm run secrets:list
```

You should see:
```
┌─────────┬───────────────────────┬──────────┬────────────────────────────────────────┐
│ (index) │          id           │   type   │             description                 │
├─────────┼───────────────────────┼──────────┼────────────────────────────────────────┤
│    0    │ 'uuid-123...'         │ password │ 'Root credential for VMI01/VMI02D...'  │
│    1    │ 'uuid-456...'         │ password │ 'PostgreSQL mcp_admin user password.'  │
│    2    │ 'uuid-789...'         │ password │ 'Perplexity AI API key for search...'  │
└─────────┴───────────────────────┴──────────┴────────────────────────────────────────┘
```

### Step 5: Update .env Files

Replace `release_dev/perplexity-mcp/.env` with:

```bash
# Perplexity MCP Server Configuration
# Production configuration for ACDev

# ======================
# API Configuration
# ======================

# Perplexity API Key
# Managed via Contabo Secrets: npm run secrets:pull -- --out .env.secrets
PERPLEXITY_API_KEY=${PERPLEXITY_API_KEY}

# ======================
# Database Configuration
# ======================

# PostgreSQL Connection String
# Password managed via Contabo Secrets (DB_ADMIN_PASSWORD)
DATABASE_URL=postgresql://mcp_admin:${DB_ADMIN_PASSWORD}@localhost:5432/mcp_ecosystem

# ... rest of config ...
```

## Using Secrets in Development

After importing, pull secrets when you need them:

```bash
# Pull all secrets to a file
npm run secrets:pull -- --out .env.secrets

# Source them into your environment
source .env.secrets

# Now you can run services that need these secrets
cd release_dev/perplexity-mcp
npm run dev
```

## Using Secrets in Production

On production servers:

```bash
# Pull secrets and source them
npm run secrets:pull -- --out /etc/mcp/.env.secrets
source /etc/mcp/.env.secrets

# Or add to systemd service files:
# EnvironmentFile=/etc/mcp/.env.secrets
```

## Files Modified

The import process will modify/create:

| File | Action |
|------|--------|
| `src/tools/contaboSecrets.ts` | ✏️ Add PERPLEXITY_API_KEY definition |
| `release_dev/perplexity-mcp/.env` | ✏️ Replace hardcoded secrets with references |
| `release_dev/perplexity-mcp/.env.backup` | 📄 Backup of original |
| `src/tools/contaboSecrets.ts.bak` | 📄 Backup of original |

## Cleanup After Successful Import

Once you've verified everything works:

```bash
# Remove backup files
rm release_dev/perplexity-mcp/.env.backup
rm src/tools/contaboSecrets.ts.bak

# The import script and these instructions can be deleted or archived
# git rm import-secrets.sh SECRETS_IMPORT_INSTRUCTIONS.md
```

## Verification Checklist

- [ ] Contabo API credentials are set
- [ ] Ran `./import-secrets.sh` successfully
- [ ] `npm run secrets:list` shows all expected secrets
- [ ] Can pull secrets: `npm run secrets:pull`
- [ ] `.env` file no longer contains hardcoded secrets
- [ ] Services still work after pulling secrets from Contabo
- [ ] Backups created for modified files

## Troubleshooting

### "Missing Contabo credentials" Error

Make sure all four environment variables are set:
```bash
echo $CONTABO_CLIENT_ID
echo $CONTABO_CLIENT_SECRET
echo $CONTABO_API_USER
echo $CONTABO_API_PASSWORD
```

### "Failed to obtain Contabo access token"

Check your credentials are correct. See `docs/Contabo Secrets API.pdf` for setup.

### "Permission denied" on src/tools/contaboSecrets.ts

Fix ownership:
```bash
sudo chown $(whoami):staff src/tools/contaboSecrets.ts
```

### Services can't find secrets

Make sure you pulled and sourced the secrets first:
```bash
npm run secrets:pull -- --out .env.secrets
source .env.secrets
```

## Security Notes

⚠️ **Important**:
- The `.env.backup` files contain the original secrets - delete them after verification
- Never commit `.env.secrets` to git (already in .gitignore)
- Rotate the secrets in Contabo if they were ever committed to git
- The import script temporarily holds secrets in environment variables - run in a secure environment

## Next Steps

After import:
1. Test that services work with pulled secrets
2. Update deployment scripts to pull secrets from Contabo
3. Rotate any secrets that were previously committed to git
4. Document the Contabo secrets workflow for team members
5. Add secret rotation schedule to maintenance tasks

## Support

For issues with:
- **Contabo API**: See `docs/Contabo Secrets API.pdf`
- **MCP Services**: See `CLAUDE.md` and `release_dev/shared/docs/`
- **Secrets tool**: See `docs/CONTABO_SECRETS.md`
