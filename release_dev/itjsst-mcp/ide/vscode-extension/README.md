# Structural Thinking Manager for VSCode

Enterprise-grade VSCode extension for the MCP Bundle's Structural Thinking Framework. Provides comprehensive tools for managing distributed thinking processes, deep research integration, and MCP ecosystem monitoring.

![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-blue.svg)
![VSCode](https://img.shields.io/badge/VSCode-1.84+-green.svg)

## Features

### ⚡ Dual-Mode Database Support
- **PostgreSQL** (Production): Connect to distributed MCP infrastructure
- **SQLite** (Local/Offline): Automatic fallback for offline resilience
- **Auto Mode**: Seamless switching with connection health monitoring
- Secure credential storage via VSCode SecretStorage API

### 🔬 Perplexity MCP Deep Research
- **Three Research Modes**: Quick, Deep, and Business Intelligence
- **Context-Aware**: Auto-extract context from active editor
- **Query Management**: History, favorites, and response caching
- **Session Integration**: Save research directly to thinking sessions
- **Rich UI**: Markdown rendering with source links

### 📤 Session Export & Sharing
- **JSON Export**: Machine-readable format for integration
- **Markdown Export**: Human-readable documentation
- **Flexible Options**: Metadata, timestamps, stage grouping
- **Interactive Dialogs**: Choose format and save location

### 🔍 Advanced Search & Filtering
- **Full-Text Search**: PostgreSQL tsvector or SQLite FTS5
- **Multi-Criteria Filtering**: Stage, quality, importance, tags, dates
- **Performance**: Indexed queries with execution time tracking

### 🌳 Thinking Process Tree View
- **Hierarchical Visualization**: Sessions → Stages → Thoughts
- **Context Menus**: Quick actions (view, edit, delete, export)
- **Auto-Refresh**: Configurable refresh interval
- **Visual Indicators**: Badges for counts and status

### 📊 MCP Ecosystem Health Dashboard
- **Database Status**: Connection mode, health, metrics
- **MCP Servers**: Connection status monitoring
- **Real-Time Updates**: Live status indicators

## Quick Start

### Installation
1. Download `.vsix` from releases
2. VSCode → Extensions → Install from VSIX
3. Reload VSCode

### Configuration
```json
{
  "structuralThinking.database.mode": "auto",
  "structuralThinking.database.postgresql.host": "46.250.243.123",
  "structuralThinking.mcp.remoteMode": true
}
```

### First Use
1. Open Structural Thinking sidebar (brain icon)
2. Click `+` to create session
3. Right-click session → Research with Perplexity
4. Export when ready

## Commands

- `Structural Thinking: Refresh Thinking Processes`
- `Structural Thinking: Create New Thinking Session`
- `Structural Thinking: Research with Perplexity`
- `Structural Thinking: Export Session to JSON/Markdown`
- `Structural Thinking: Open MCP Health Dashboard`

## Development

```bash
npm install
npm run compile
npm test
npm run package
```

## License

MIT License

## Version

**0.2.0** - Phase 2 Complete
- Perplexity integration
- Export capabilities
- Advanced search
- Enhanced performance
