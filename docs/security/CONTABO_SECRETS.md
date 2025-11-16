# Contabo Secrets Tool

This project now standardizes on the Contabo Secrets API for managing runtime
credentials (root SSH passwords, database users, WORM drop-zone access, etc.).
The helper CLI lives in `src/tools/contaboSecrets.ts` and is exposed through the
following npm scripts:

| Command                                      | Description                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run secrets:list`                       | Lists every secret currently stored in the Contabo tenant.                                                            |
| `npm run secrets:push`                       | Reads local environment variables and upserts them into Contabo.                                                      |
| `npm run secrets:pull -- --out .env.secrets` | Downloads the secrets we depend on and writes them to a `.env`-style file (defaults to stdout if `--out` is omitted). |

## Required environment variables

Set these before running any secrets command (see “Contabo Secrets API.pdf” for
the official control-panel steps):

```
export CONTABO_CLIENT_ID=...
export CONTABO_CLIENT_SECRET=...
export CONTABO_API_USER=admin@example.com   # your Contabo login email
export CONTABO_API_PASSWORD=...             # API password created in the portal
```

## Managed secret names

| Contabo Secret Name     | Exported env           | Purpose                                                  |
| ----------------------- | ---------------------- | -------------------------------------------------------- |
| `mcp-root-password`     | `MCP_ROOT_PASSWORD`    | Root credential for VMI01/VMI02D/VMI03 and the jump box. |
| `mcp-db-admin-password` | `DB_ADMIN_PASSWORD`    | PostgreSQL `mcp_admin` user password.                    |
| `mcp-db-repl-password`  | `DB_REPL_PASSWORD`     | PostgreSQL replication user password.                    |
| `worm-access-password`  | `WORM_ACCESS_PASSWORD` | `AccessService` SFTP drop-zone credential.               |
| `perplexity-api-key`    | `PERPLEXITY_API_KEY`   | Perplexity AI API key for search and research.           |

Add additional entries by editing `SECRET_DEFINITIONS` in
`src/tools/contaboSecrets.ts` and re-running `npm run secrets:push`.

## Typical workflow

1. **Push new credentials**  
   Export the env vars above along with the credentials you want to store
   (e.g., `export MCP_ROOT_PASSWORD=...`). Then run:

   ```
   npm run secrets:push
   ```

2. **Pull secrets for local automation**

   ```
   npm run secrets:pull -- --out .env.secrets
   source .env.secrets
   ```

   All integration scripts/tests now pick up `MCP_ROOT_PASSWORD`,
   `DB_ADMIN_PASSWORD`, etc. from the environment.

3. **Reference in docs & scripts**  
   Anywhere you previously saw “Vault secret …” should now reference the
   Contabo secret name plus the `npm run secrets:*` commands above.

This keeps sensitive values out of the repo while ensuring everyone (and every
automation step) uses the same Contabo-native store backed by OAuth2.
