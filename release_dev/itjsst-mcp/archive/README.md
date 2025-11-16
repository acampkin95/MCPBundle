# Archive Directory

This directory contains archived files from IT-MCP development that are no longer actively used but kept for reference.

## Contents

### `/databases/`

Development and test database files from earlier runs:

- `mcp_audit.db` - Audit trail database (archived)
- `mcp_command_queue.db` - Command queue database (archived)
- `mcp_plan.db` - Structured thinking database (archived)
- `*.db-shm`, `*.db-wal` - SQLite journal files

**Note**: Production databases are regenerated on server startup and should not be committed to git.

### `/test-artifacts/`

Test database files from unit tests:

- `test-mcp.db` - Test MCP database
- `test-structured-thinking.db` - Test structured thinking database

### `/docs/`

Historical documentation files superseded by current docs:

- Policy enforcement implementation guides
- Progress scan reports
- Keycloak setup guides
- Integration readiness reviews
- Earlier project documentation

## Current Active Documentation

The following files in the project root are actively maintained:

- `README.md` - Main project documentation
- `CLAUDE.md` - Claude Code integration guide
- `AGENTS.md` - Agent coordination architecture

## Cleanup Policy

Files are archived when:

- They are superseded by newer documentation
- They represent temporary development artifacts
- They contain historical snapshots no longer relevant to current development

To restore archived files, simply copy them back to the project root.

---

**Last Updated**: November 3, 2025
