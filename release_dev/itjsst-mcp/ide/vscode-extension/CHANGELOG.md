# Changelog

All notable changes to the Structural Thinking Manager extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-11-14

### Added - Phase 2 Features

#### Perplexity MCP Deep Research Integration
- Rich webview-based research panel with sidebar navigation
- Support for three research modes: Quick, Deep, and Business Intelligence
- Context-aware research with automatic editor context extraction
- Query history and favorites management
- Response caching for improved performance
- Sources display with clickable links
- Save research results directly to thinking sessions
- Real-time progress indicators during research

#### Session Export Capabilities
- Export thinking sessions to JSON format (machine-readable)
- Export thinking sessions to Markdown format (human-readable)
- Configurable export options:
  - Include/exclude metadata and timestamps
  - Group thoughts by cognitive stage or chronologically
  - Prettified JSON output
- Interactive save dialog with file format filters
- Optional auto-open exported files
- Export individual thoughts or complete sessions

#### Advanced Search and Filtering
- Full-text search across all thoughts
- PostgreSQL tsvector support for production deployments
- SQLite FTS5 virtual tables for local mode
- Multi-criteria filtering:
  - Session ID, Project ID, Cognitive Stage
  - Quality score range
  - Importance level
  - Tags
  - Date ranges
  - Parent/child thought relationships
- Real-time search result updates
- Execution time tracking
- Filter persistence across sessions

#### Enhanced Services Architecture
- **ResearchService**: Manages Perplexity MCP integration with query caching
- **ExportService**: Handles JSON/Markdown generation and file operations
- **SearchService**: Provides advanced filtering with dual-database support
- Automatic FTS5 initialization for SQLite databases
- Efficient database query optimization

### Improved

#### Database Layer
- Enhanced error handling with detailed logging
- Connection pooling optimization
- Automatic fallback from PostgreSQL to SQLite
- FTS5 triggers for automatic search index updates
- Parameterized queries to prevent SQL injection

#### MCP Client Service
- Improved type safety with generic tool invocation
- Better error messages and connection status tracking
- Support for both local stdio and remote SSH transports
- Structured content parsing from MCP responses

#### User Experience
- Comprehensive command palette integration
- Context-aware command availability
- Improved tree view interactions
- Better error messages and user feedback
- Loading indicators for long-running operations

### Fixed
- TypeScript strict mode compliance (zero compilation errors)
- Unused variable warnings eliminated
- Type safety improvements throughout codebase
- Memory leak prevention in webview panels
- Proper disposal of resources on extension deactivation

### Security
- All user inputs sanitized before database queries
- XSS prevention in webview HTML generation
- Nonce-based Content Security Policy for webviews
- No credential logging or exposure
- Secure credential storage via VSCode SecretStorage API

### Performance
- Query result caching in ResearchService
- Debounced tree view refresh operations
- Lazy loading of webview content
- Efficient database indexing
- Connection pooling for PostgreSQL

### Developer Experience
- Comprehensive JSDoc documentation
- Type-safe interfaces throughout
- Separation of concerns (services, providers, webviews)
- Consistent error handling patterns
- Clear code organization

## [0.1.0] - 2025-11-14

### Added - Phase 1 Foundation

- Initial VSCode extension scaffold
- Dual-mode database support (PostgreSQL + SQLite)
- MCP client service with SSH transport
- Hierarchical tree view for thinking processes
- Basic CRUD operations:
  - Create thinking sessions
  - View thought details
  - Delete thoughts
  - Refresh tree view
- Health dashboard for MCP ecosystem monitoring
- Credential service with secure storage
- Configuration management via VSCode settings
- Output channel for diagnostic logging

### Architecture
- Service layer pattern with dependency injection
- Provider-based tree view implementation
- Webview support for rich UI components
- Automatic connection management and cleanup

---

## Upcoming Features

### Phase 3 (Planned)
- Thought editing with live markdown preview
- Collaborative thinking sessions
- AI-assisted thought refinement
- Advanced analytics dashboard
- Custom visualization options
- Wazuh SIEM integration for security monitoring

### Phase 4 (Planned)
- Real-time collaboration features
- Version control integration
- Custom cognitive stage definitions
- Automated backup and sync
- Mobile companion app support
