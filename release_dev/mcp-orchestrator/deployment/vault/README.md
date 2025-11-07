# HashiCorp Vault Deployment for SERVER-MCP

This directory contains the HashiCorp Vault deployment configuration for SERVER-MCP secret management.

## Overview

Vault stores and manages sensitive credentials:
- PostgreSQL connection credentials
- Redis authentication tokens
- Keycloak client secrets
- API keys and tokens

## Quick Start

### 1. Start Vault

```bash
cd deployment/vault
docker-compose up -d
```

### 2. Initialize and Unseal Vault

```bash
../../scripts/vault-init.sh
```

This script will:
- Initialize Vault with 5 key shares (3 required to unseal)
- Unseal Vault automatically
- Create SERVER-MCP policy
- Enable KV v2 secrets engine
- Store sample credentials
- Generate SERVER-MCP access token

### 3. Configure SERVER-MCP

Source the generated environment file:

```bash
source .env.vault
```

Or add to your `.env` file:

```bash
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=<your-server-mcp-token>
VAULT_NAMESPACE=server-mcp
```

### 4. Update Secrets with Production Values

```bash
# PostgreSQL
vault kv put secret/server-mcp/postgres \
  host=postgres.acdev.host \
  port=5432 \
  user=server_mcp \
  password=REAL_POSTGRES_PASSWORD \
  database=server_mcp

# Redis
vault kv put secret/server-mcp/redis \
  host=redis.acdev.host \
  port=6379 \
  password=REAL_REDIS_PASSWORD

# Keycloak
vault kv put secret/server-mcp/keycloak \
  server_url=https://keycloak.acdev.host \
  realm=acdev \
  client_id=server-mcp \
  client_secret=REAL_KEYCLOAK_SECRET
```

## Architecture

```
┌─────────────────┐
│   SERVER-MCP    │
│                 │
│ VaultService    │◄────────┐
└─────────────────┘         │
         │                  │
         │ VAULT_TOKEN      │
         │ (read-only)      │
         ▼                  │
┌─────────────────┐         │
│  HashiCorp      │         │
│  Vault          │         │
│                 │         │
│  KV v2 Engine   │         │
│  ├─ postgres    │         │
│  ├─ redis       │         │
│  └─ keycloak    │         │
└─────────────────┘         │
         │                  │
         │ Root Token       │
         │ (admin)          │
         └──────────────────┘
```

## File Structure

```
deployment/vault/
├── docker-compose.yml          # Vault container configuration
├── README.md                   # This file
├── policies/
│   └── server-mcp-policy.hcl  # Vault policy for SERVER-MCP
├── config/                     # Vault server configuration
├── data/                       # Vault data (persisted)
├── logs/                       # Vault logs
├── .vault-keys                 # Unseal keys and root token (DO NOT COMMIT)
└── vault-init.json             # Initialization response (DO NOT COMMIT)
```

## Security Best Practices

### 1. Protect Unseal Keys

The `.vault-keys` file contains:
- 5 unseal keys (3 required to unseal Vault)
- Root token (unlimited access)

**Important:**
- ✅ Store in a password manager (1Password, LastPass, etc.)
- ✅ Distribute unseal keys to different trusted individuals
- ✅ Back up to encrypted storage
- ❌ Never commit to Git
- ❌ Never share via unencrypted channels

### 2. Rotate Tokens

```bash
# Revoke old SERVER-MCP token
vault token revoke <old-token>

# Create new SERVER-MCP token
vault token create -policy=server-mcp -ttl=720h

# Update SERVER-MCP .env file with new token
```

### 3. Enable Audit Logging

```bash
vault audit enable file file_path=/vault/logs/audit.log
```

### 4. Enable TLS (Production)

For production, configure TLS:

1. Generate certificates:
```bash
openssl req -x509 -newkey rsa:4096 \
  -keyout vault-key.pem \
  -out vault-cert.pem \
  -days 365 \
  -nodes \
  -subj "/CN=vault.acdev.host"
```

2. Update `docker-compose.yml`:
```yaml
environment:
  VAULT_LOCAL_CONFIG: |
    {
      "listener": {
        "tcp": {
          "address": "0.0.0.0:8200",
          "tls_cert_file": "/vault/config/vault-cert.pem",
          "tls_key_file": "/vault/config/vault-key.pem"
        }
      }
    }
```

3. Update `VAULT_ADDR`:
```bash
export VAULT_ADDR=https://vault.acdev.host:8200
```

### 5. Backup Vault Data

```bash
# Backup Vault data directory
tar -czf vault-backup-$(date +%Y%m%d).tar.gz deployment/vault/data

# Store in secure location
aws s3 cp vault-backup-*.tar.gz s3://backups/vault/
```

## Operations

### Unseal Vault (After Restart)

Vault seals automatically on restart. To unseal:

```bash
# Automatic (using stored keys)
../../scripts/vault-init.sh

# Manual
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>
```

### Check Vault Status

```bash
vault status

# Or via HTTP
curl http://localhost:8200/v1/sys/health
```

### Read Secrets

```bash
# Via CLI
vault kv get secret/server-mcp/postgres

# Via HTTP API
curl --header "X-Vault-Token: $VAULT_TOKEN" \
  http://localhost:8200/v1/secret/data/server-mcp/postgres
```

### Update Secrets

```bash
vault kv put secret/server-mcp/postgres \
  password=NEW_PASSWORD
```

### Seal Vault (Emergency)

```bash
vault operator seal
```

## Troubleshooting

### Vault Won't Start

Check Docker logs:
```bash
docker-compose logs vault
```

Common issues:
- Port 8200 already in use
- Insufficient permissions on data directory
- IPC_LOCK capability not available

### Token Expired

Renew token:
```bash
vault token renew
```

Or create new token:
```bash
vault token create -policy=server-mcp -ttl=720h
```

### Lost Unseal Keys

**There is no recovery if all unseal keys are lost.**

Prevention:
- Distribute keys to multiple trusted individuals
- Store in multiple secure locations
- Use Vault's auto-unseal feature with cloud KMS (AWS, GCP, Azure)

### Forgot Root Token

If you have unseal keys, you can generate a new root token:
```bash
vault operator generate-root -init
vault operator generate-root
```

## Monitoring

### Health Check

Vault exposes health endpoint at `/v1/sys/health`:

```bash
curl http://localhost:8200/v1/sys/health
```

Response codes:
- `200` - Initialized, unsealed, active
- `429` - Unsealed, standby
- `472` - Disaster recovery mode
- `473` - Performance standby
- `501` - Not initialized
- `503` - Sealed

### Metrics

Vault exposes Prometheus metrics at `/v1/sys/metrics`:

```bash
curl --header "X-Vault-Token: $VAULT_TOKEN" \
  http://localhost:8200/v1/sys/metrics?format=prometheus
```

## Integration with SERVER-MCP

SERVER-MCP uses `VaultService` to fetch secrets:

```typescript
// Fetch PostgreSQL credentials
const pgCreds = await vaultService.getSecret('server-mcp/postgres');

// Use credentials
const pool = new Pool({
  host: pgCreds.host,
  port: pgCreds.port,
  user: pgCreds.user,
  password: pgCreds.password,
});
```

See `src/services/vaultService.ts` for implementation details.

## References

- [HashiCorp Vault Documentation](https://developer.hashicorp.com/vault/docs)
- [Vault API Reference](https://developer.hashicorp.com/vault/api-docs)
- [KV Secrets Engine](https://developer.hashicorp.com/vault/docs/secrets/kv/kv-v2)
- [Vault Policies](https://developer.hashicorp.com/vault/docs/concepts/policies)
