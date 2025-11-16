# MCP Admin Panel v2.0

Next.js 15 dashboard that provides comprehensive monitoring and management for the MCP Bundle infrastructure. Features include real-time heartbeat monitoring, credential management, structured thinking timelines, and full mcp-orchestrator integration.

## Getting Started

```bash
cd release_dev/admin-panel
cp .env.example .env.local
npm install
npm run dev # http://localhost:3100
```

### Required environment variables

| Variable                 | Description                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `PANEL_API_BASE_URL`     | Base URL of the Cloudflare MCP heartbeat server (defaults to `http://localhost:3003`). |
| `ORCHESTRATOR_API_URL`   | **NEW** Base URL of mcp-orchestrator (defaults to `http://localhost:9090`).           |
| `LOG_LEVEL`              | **NEW** Winston log level: debug, info, warn, error (defaults to `info`).             |
| `AUTH_SECRET`            | Random 32+ character hex/string for NextAuth JWT signing.                              |
| `KEYCLOAK_BASE_URL`      | Base URL of your Keycloak instance (e.g., `https://sso.example.com`).                  |
| `KEYCLOAK_REALM`         | Realm that hosts the admin-panel client.                                               |
| `KEYCLOAK_CLIENT_ID`     | Keycloak client configured for public/browser access.                                  |
| `KEYCLOAK_CLIENT_SECRET` | Client secret (use a confidential client).                                             |

The middleware enforces Keycloak login for **all** routes (UI + `/api/panel`). After authentication the dashboard pulls live data from the Cloudflare MCP feeds.

## Key Features

### Dashboard (/)
- **Mesh Status** - Real-time statistics on agent count and status
- **Credential Printout** - Agent credentials with heartbeat tracking
- **Structured Thought Timeline** - View cognitive processing across the mesh
- Server-side rendering for optimal performance

### Monitoring (/monitoring) **NEW in v2.0**
- **Orchestrator Health** - Real-time health status of mcp-orchestrator services
- **Agent Registry** - Complete registry of all MCP agents with status tracking
- **System Metrics** - Performance metrics and command queue statistics
- **Auto-Refresh** - Updates every 5 seconds
- **SSE Support** - Ready for real-time streaming when available

## Key Pages

- `/` – Dashboard with mesh stats, credentials, and structured thinking
- `/monitoring` – Real-time orchestrator monitoring and agent registry
- `app/api/panel` – Proxy for Cloudflare MCP panel feeds
- `app/api/orchestrator/status` – Proxy for mcp-orchestrator status

## Scripts

- `npm run dev` – Start development server on port 3100
- `npm run build` – Build production bundle
- `npm run start` – Start production server
- `npm run test` – Run Vitest test suite
- `npm run test:watch` – Run tests in watch mode
- `npm run test:coverage` – Run tests with coverage report
- `npm run test:e2e` – **NEW** Run Playwright E2E tests (when implemented)
- `npm run lint` – Run ESLint
- `npm run lint:fix` – Auto-fix linting issues
- `npm run typecheck` – TypeScript type checking
- `npm run format` – Format code with Prettier
- `npm run audit:check` – **NEW** Check for security vulnerabilities
- `npm run panel:snapshot` – CLI helper for panel snapshot MCP tool

## What's New in v2.0

### Security
- ✅ All critical Next.js CVEs patched (3 critical vulnerabilities eliminated)
- ✅ Updated to Next.js 15.0.4
- ✅ Updated to React 19
- ✅ Next-Auth v5 (beta) with improved security

### Features
- ✅ **Real-time Monitoring Dashboard** - Full orchestrator visibility
- ✅ **Agent Registry** - Track all MCP agents across the infrastructure
- ✅ **SSE Client** - Ready for real-time event streaming
- ✅ **Enhanced Navigation** - Tab-based navigation between sections
- ✅ **Improved UI/UX** - Responsive design, better accessibility

### Developer Experience
- ✅ **Comprehensive Test Suite** - Vitest + React Testing Library
- ✅ **TypeScript Strict Mode** - Enhanced type safety
- ✅ **Structured Logging** - Winston logger with file rotation
- ✅ **Shared Libraries** - Integration with @mcp-bundle/resilience
- ✅ **Better Error Handling** - Graceful fallbacks and error states

### Documentation
- ✅ **Upgrade Report** - See `UPGRADE_V2.0_REPORT.md` for detailed changes
- ✅ **Updated README** - Current feature documentation
- ✅ **Test Coverage** - 45% coverage with path to 70%+

## Deployment Notes

1. Build with `npm run build` → `.next/` artifacts (remember to add to deployment package if bundling).
2. Deploy via the new `admin-panel.service` systemd unit (see `release_dev/admin-panel/systemd/`) or PM2 equivalent.
3. Ensure HAProxy routes 3100/tcp traffic to the host and that the Keycloak realm/client referenced in `.env` exists before exposing the UI.
