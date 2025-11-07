# Repository Guidelines

## Project Structure & Module Organization
The TypeScript source lives in `src/`. `src/index.ts` wires services into the MCP server, while `src/services/...` hosts command wrappers (e.g. `systemInfo`, `networkDiagnostics`) and `src/utils/` holds shared helpers (`CommandRunner`, `logger`, `ExecutionRouter`). Tool registration stays in `src/tools/`; configuration defaults in `src/config/`. Compiled JavaScript lands in `dist/`—regenerate via `npm run build`, never edit by hand.

## Build, Test, and Development Commands
Install dependencies with `npm install` (Node >= 18.18). `npm run dev` boots the stdio server through `ts-node`. `npm run build` compiles to ES modules in `dist/`, and `npm run build:watch` keeps the compiler hot during feature work. `npm start` runs the compiled server for production-style checks. `npm run lint` must succeed before opening a pull request.

## Coding Style & Naming Conventions
The project targets strict TypeScript with ECMAScript modules. Use two-space indentation, trailing semicolons, and `readonly` modifiers for immutables. Export one domain concept per module; service classes use PascalCase, helpers remain camelCase. Declare explicit return types on async APIs and route shell access through `CommandRunner`. Resolve promises or intentionally `void` them to satisfy `@typescript-eslint/no-floating-promises`.

## Testing Guidelines
An automated test harness is not yet checked in. When introducing tests, add TypeScript-based integration checks named `*.test.ts` alongside the feature (e.g. `src/services/__tests__/networkDiagnostics.test.ts`) and wire a `npm test` script that invokes Node’s built-in `node --test` or your chosen runner. Until that lands, list manual smoke steps in the PR body, covering both `npm run dev` calls and compiled `npm start` runs.

## Commit & Pull Request Guidelines
This snapshot ships without VCS history, so align on Conventional Commits (`feat:`, `fix:`, `chore:`); example: `feat(services): extend firewall toolkit coverage`. Each PR should include a concise summary, linked issue or context, manual verification notes (commands, sample inputs), and screenshots or log excerpts for user-visible changes. Request review before merging and wait for lint/build green lights.

## Security & Configuration Tips
The server often shells out with elevated rights. Keep environment variables (`IT_MCP_ALLOW_SUDO=false`, `IT_MCP_CAPTURE_DIR=/secure/path`) scoped per test run and avoid committing secrets or packet captures. Validate that remote tooling (`m365`, `ssh`) is authenticated locally before enabling new automations.
