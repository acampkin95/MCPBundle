/**
 * Vault Secret Path Configuration
 *
 * Maps logical secret names to Vault KV v2 paths.
 * All paths are under secret/data/server-mcp/ prefix.
 */

export const VAULT_SECRET_PATHS = {
  postgres: "secret/data/server-mcp/postgres",
  redis: "secret/data/server-mcp/redis",
  keycloak: "secret/data/server-mcp/keycloak",
} as const;

export type VaultSecretName = keyof typeof VAULT_SECRET_PATHS;

/**
 * Expected credential structure for each secret type
 */
export interface PostgresCredentials {
  readonly host: string;
  readonly port: string;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

export interface RedisCredentials {
  readonly host: string;
  readonly port: string;
  readonly password: string;
}

export interface KeycloakCredentials {
  readonly server_url: string;
  readonly realm: string;
  readonly client_id: string;
  readonly client_secret: string;
}

export type VaultCredentials = PostgresCredentials | RedisCredentials | KeycloakCredentials;
