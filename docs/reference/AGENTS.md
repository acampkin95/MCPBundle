# Repository Guidelines

## Project Structure & Module Organization

- `release_dev/` hosts every active MCP package; see Agent Overview for responsibilities.
- Shared presets stay in `release_dev/shared/` (config, docs, scripts) and drive common tooling.
- Promotion pipeline: develop in `release_dev/`, stage artifacts with `deploy.sh` into `devtestready/`, then publish from `final/`.

## Agent Overview

- `perplexity-mcp`: Business-intelligence agent; needs Perplexity API keys in `.env` plus optional Redis/Postgres wiring.
- `mcp-orchestrator`: Ubuntu operator for PostgreSQL, Redis, Keycloak, and NGINX; reuse health checks in `src/services/` and vault bindings in `src/config/`.
- `itjsst-mcp`: macOS automation layer with the CLI entry at `src/cli/itMcpCli.ts`; handles diagnostics and sqlite-backed policy state.

## Build, Test, and Development Commands

- Run `npm install` inside the target package first.
- `perplexity-mcp`: `npm run dev` (tsx loop), `npm run ci` (type/lint/test/security), `npm run docker:run` (container smoke).
- `mcp-orchestrator`: `npm run dev` (ts-node), `npm run build` (emit `dist/` for systemd), `npm run test` (Jest).
- `itjsst-mcp`: `npm run dev`, `npm run cli`, `npm run build`.

## Coding Style & Naming Conventions

- TypeScript + ES modules across the repo. Prettier (`.prettierrc.json`) sets two-space indentation, 100-character lines, single quotes, and required semicolons.
- ESLint (`.eslintrc.json`) enables `@typescript-eslint`, `node`, and `security` rules; resolve `no-floating-promises`, `no-misused-promises`, and `security/detect-unsafe-regex` before pushing.
- Name files and folders in kebab-case, export classes in PascalCase, and keep functions/constants in camelCase. Reuse the existing `zod` validators for input checks.

## Testing Guidelines

- `perplexity-mcp` uses Vitest with suites in `tests/unit`, `tests/integration`, and `tests/security`; maintain ≥90 % coverage and run `npm run test:coverage` before merges.
- `mcp-orchestrator` uses Jest with colocated `__tests__`; mock infrastructure via the existing service stubs.
- `itjsst-mcp` keeps specs in `tests/test-*.ts`; run package `npm run test` plus root `npm run pre-commit` before submitting.

## Commit & Pull Request Guidelines

- Use semver-prefixed release summaries (for example `Release v0.2.0: Security hardening and dependency updates`) and Conventional Commits (`feat:`, `fix:`, `chore:`) so `CHANGELOG.md` stays aligned.
- Each PR should include a problem statement, implementation notes, evidence from `npm run test` or coverage, relevant issue links, and screenshots or logs for user-facing changes; flag security reviewers whenever `security:` scripts report findings.

## Security & Configuration Tips

- Store secrets in per-package `.env` files and rotate them through the orchestrator’s Vault hooks; rerun `npm run security:scan` inside `perplexity-mcp` and `npm run security:semgrep` at the workspace root after dependency updates.
- Follow `release_dev/perplexity-mcp/SECURITY_CHECKLIST.md` and `release_dev/shared/docs/TESTING.md` whenever you prepare a release with `deploy.sh`.
