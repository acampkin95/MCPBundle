# SERVER-MCP Vault Policy
#
# This policy grants SERVER-MCP read-only access to its secrets
# and allows token self-renewal.
#
# Apply with:
#   vault policy write server-mcp server-mcp-policy.hcl

# Read SERVER-MCP secrets
path "secret/data/server-mcp/*" {
  capabilities = ["read", "list"]
}

# List secret metadata
path "secret/metadata/server-mcp/*" {
  capabilities = ["list", "read"]
}

# Allow token renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Allow token lookup (for validation)
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

# Deny all other paths
path "*" {
  capabilities = ["deny"]
}
