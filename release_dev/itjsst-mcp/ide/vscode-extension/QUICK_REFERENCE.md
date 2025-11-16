# VSCode Structural Thinking Manager - Quick Reference

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Create New Session | `Cmd+Shift+N` | `Ctrl+Shift+N` |
| Open Research | `Cmd+Shift+R` | `Ctrl+Shift+R` |
| Export Session | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| Show Analytics | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Refresh View | `Cmd+Shift+F5` | `Ctrl+Shift+F5` |

## Thought Editor Shortcuts

| Action | Shortcut |
|--------|----------|
| Save | `Cmd+S` / `Ctrl+S` |
| Save and Close | `Cmd+Enter` / `Ctrl+Enter` |

## 8 Cognitive Stages

1. **Problem Definition** - Define the problem, constraints, and goals
2. **Research** - Gather information and explore existing solutions
3. **Analysis** - Break down the problem and identify patterns
4. **Synthesis** - Combine insights and design solutions
5. **Conclusion** - Finalize decisions and document rationale
6. **Reflection** - Review outcomes and learn from the process
7. **Implementation** - Execute the planned solution
8. **Validation** - Test and verify the implementation

## Database Modes

- **SQLite** - Local, offline-first (default)
- **PostgreSQL** - Production, team collaboration
- **Auto** - Tries PostgreSQL, falls back to SQLite (recommended)

## File Locations

- **SQLite Database**: `~/.vscode/structural-thinking/mcp_plan.db`
- **Extension Log**: View → Output → Structural Thinking
- **Configuration**: Preferences → Settings → Structural Thinking

## Commands (Command Palette)

Search "Structural Thinking" in Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- Structural Thinking: Create New Session
- Structural Thinking: Open Research Panel
- Structural Thinking: Show Analytics Dashboard
- Structural Thinking: Export Current Session
- Structural Thinking: Refresh Tree View
- Structural Thinking: Edit Thought
- Structural Thinking: Show Health Status

## Context Menu Actions

**Right-click on Session**:
- Export Session (JSON/Markdown)
- Refresh Session
- Delete Session

**Right-click on Thought**:
- Edit Thought (opens advanced editor)
- Delete Thought
- Copy Content
- Research Related Topics

## Extension Settings

```json
{
  "structuralThinking.database.mode": "auto",
  "structuralThinking.database.postgresql.host": "46.250.243.123",
  "structuralThinking.database.postgresql.port": 5432,
  "structuralThinking.database.postgresql.database": "mcp_orchestrator",
  "structuralThinking.treeView.refreshInterval": 5000,
  "structuralThinking.treeView.maxThoughtsPerSession": 100,
  "structuralThinking.logging.level": "info"
}
```

## Quick Start

1. Click brain icon in Activity Bar
2. Click `+` button or press `Cmd+Shift+N` / `Ctrl+Shift+N`
3. Enter session name
4. Start adding thoughts to stages
5. Edit thoughts with live markdown preview
6. View analytics with `Cmd+Shift+A` / `Ctrl+Shift+A`

## Troubleshooting

**No thoughts appearing?**
- Check database connection (View → Output → Structural Thinking)
- Try manual refresh (`Cmd+Shift+F5` / `Ctrl+Shift+F5`)
- Verify database mode in settings

**PostgreSQL connection failed?**
- Extension falls back to SQLite automatically
- Check credentials in settings
- Verify network connectivity to database server

**Keyboard shortcuts not working?**
- Check for conflicts: Preferences → Keyboard Shortcuts
- Search for "Structural Thinking" to view all bindings

## Advanced Features

### Live Markdown Preview
- Edit thoughts with split-pane editor
- Supports all markdown syntax
- Syntax-highlighted code blocks
- Auto-saves after 2 seconds of inactivity

### Analytics Dashboard
- Sessions over time (30 days)
- Stage distribution visualization
- Quality scores by stage (radar chart)
- Tag frequency analysis
- Export to JSON

### Metadata Tagging
- Comma-separated tags (e.g., "bug, urgent, frontend")
- Importance levels: low, medium, high, critical
- Quality scores: 0-100

## Support

- **Documentation**: See PHASE3_COMPLETION_SUMMARY.md
- **Issues**: GitHub repository
- **Output Log**: View → Output → Structural Thinking

## Version

Current Version: 0.1.0
Phase: 3 (Advanced Features & UX)
Status: Production Ready
