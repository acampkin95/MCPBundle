# MCP Enterprise Bundle

Production-ready distributed MCP ecosystem for enterprise operations.

## Quick Start

```bash
# Development
cd release_dev/<mcp-name>/
npm install && npm run dev

# Build test package
./deploy.sh → Option 1

# Deploy to production
./deploy.sh → Option 3
```

## Documentation

All documentation located in `release_dev/shared/docs/`:

- `WORKFLOW_QUICKSTART.md` - Daily workflow guide
- `FOLDER_STRUCTURE.md` - Complete structure reference
- `TESTING.md` - Testing and performance guide
- `DIAGNOSTIC_SYSTEM.md` - Diagnostics integration
- `PHASE_COMPLETION_SUMMARY.md` - Current phase status

## Folder Structure

```
release_dev/        Development source (git tracked)
devtestready/       Test builds (gitignored)
final/              Production releases (git tracked)
deploy.sh           Deployment manager
```

## Version

Current: `0.1`

See `release_dev/shared/docs/` for complete documentation.
