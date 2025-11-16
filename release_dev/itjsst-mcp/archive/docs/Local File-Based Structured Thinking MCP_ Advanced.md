<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Local File-Based Structured Thinking MCP: Advanced Planning Architecture

This guide details how to establish a completely local, file-based Model Context Protocol (MCP) system supporting advanced structured planning. It leverages a SQLite database with jsonb-emulating capabilities and FTS5 (for near-GIN speeds) for all persistent state, rooted at the workspace. The system bootstraps from user and workspace `.md` knowledge resources, ensuring planning is both systematic and fully local and auditable.[^1][^2][^3][^4][^5][^6]

---

## Architecture Overview

The local MCP stack centers on three core principles:

- **Local-only state**: All planning data (thoughts, plan objects, reasoning state, file metadata) is persisted in a local SQLite file (e.g., `mcp_plan.db`) at the workspace root.
- **Systematic bootstrap**: On initialization, the agent scans the workspace for all `.md` resources (such as `agents.md`, `CLAUDE.md`, architecture docs), auto-parses them, and encodes summaries/metadata for structured query.
- **Advanced planning focus**: The system is designed for medium and long-term project planning; prompt-level short-term thinking should be filtered out. Each stored plan object is structured as a JSON blob, referencing the source `.md` files and maintaining full auditability.

---

## Local Server Deployment

### SQLite MCP Server

Deploy a SQLite MCP server using the Node.js or Python implementations:[^2][^4]

- Add to your project via a configuration file (e.g., `.vscode/mcp.json`, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "mcp-server-sqlite-npx", "${workspaceFolder}/mcp_plan.db"],
      "type": "stdio"
    }
  }
}
```

- This ensures all queries and persisted state are local, with zero cloud dependency.

---

## Workspace Bootstrapping Workflow

1. **File Discovery**:
   - Agent uses filesystem MCP or native server tools to enumerate `*.md` files in the workspace root.[^7][^5][^8]
2. **Markdown Parsing**:
   - Each `.md` file is parsed by section and key metadata is extracted (e.g., filename, title, update time, tags).
   - Parsed content and outlines are stored as JSON documents in SQLite database for rapid semantic access.
3. **Systematic Review**:
   - Agent creates structured summaries for each imported `.md` file, tagging resources for traceability and reasoning.[^6]
4. **Structured Agent Initialization**:
   - Agent uses both the parsed `.md` resources and user-provided input to synthesize new planning objects.[^9][^5][^8]
   - These objects explicitly encode:
     - Planning horizon (medium/long-term)
     - Stage/context (e.g., upgrade roadmap, change window)
     - Linked evidence from workspace files
     - Reasoning score for metacognitive feedback
5. **Plan Storage**:
   - Each plan/reasoning object is stored as a JSON document in the local database.
   - Audit trail includes links to all referenced `.md` resources and encoded user/system input.

---

## JSON Schema for Thought Object

```json
{
  "thought_id": "uuid",
  "type": "planning",
  "horizon": "medium-term|long-term",
  "topic": "Infrastructure upgrade roadmap",
  "inputs": {
    "user": "Alex Campkin",
    "resources": ["agents.md", "CLAUDE.md"]
  },
  "imported_md": {
    "agents.md": {
      "title": "Agent Decision Logic",
      "sections": ["Goals", "Stages", "Criteria"],
      "tags": ["planning", "ops", "automation"],
      "latest_update": "2025-10-29T15:00:00Z"
    }
  },
  "context": {
    "stage": "Advanced Planning",
    "domain": "devops",
    "window": "2025 Q4 - 2026 Q3"
  },
  "plan_details": {
    "objectives": ["Upgrade", "Risk mitigation", "Automate"],
    "subgoals": ["Test resilience", "Document runbooks"],
    "review": "Synthesis of .md docs and user priorities"
  },
  "links": ["./agents.md#logic", "./network.md#roadmap"],
  "score": 0.92
}
```

---

## Advanced Planning Stages Supported

- **Objective Cataloging**: Extract projects and goals from all workspace docs.
- **Constraint Analysis**: Parse operational/compliance constraints from `infrastructure.md`, `security.md`, etc.
- **Milestone Planning**: Encode and track major deliverables/milestones.
- **Branching/Revision**: Use MCP branching tools to model alternative strategies and what-if scenarios.[^5][^9]
- **Audit/Traceability**: Capture all logic, file provenance, and decision reviews for downstream or compliance checks.

---

## Database Management Notes

- SQLite’s `json` and `fts5` modules allow efficient index/query, giving near-GIN performance for local setups.[^4][^2]
- Ensure that `mcp_plan.db` is always at workspace root for portability and rapid sharing/versioning.
- Back up local plans manually if needed—no state is sent to the cloud by default.[^5]
- Protect database location via strict OS/FS permissions and MCP server config: restrict tool access to just the workspace.

---

## Bootstrap and Best Practices

- On each agent run, parse and catalog all `.md` files for structured review.[^7][^6][^5]
- Only permit workspace-folder access when configuring your MCP server—never expose system directories by default.
- Each advanced plan must reference `.md` origin data in its JSON structure for proper lineage and audit.
- Score and tag all plans for review and future upgrades.
- Use native MCP query and search tools to dynamically update, review, and branch plans as new files or requirements are added.

---

**Version**: 1.0
**Last Updated**: 2025-10-29
**Maintainer**: Workspace Owner
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^19][^20]</span>

<div align="center">⁂</div>

[^1]: https://skywork.ai/skypage/en/unlocking-local-data-sqlite-explorer/1978663309412704256

[^2]: https://github.com/makeralchemy/claude-desktop-mcp-sqlite

[^3]: https://github.com/cnosuke/mcp-sqlite

[^4]: https://playbooks.com/mcp/johnnyoshika-sqlite-npx

[^5]: https://skywork.ai/skypage/en/unlocking-structured-ai-reasoning/1977642632387035136

[^6]: https://taoofmac.com/space/blog/2025/10/04/1111

[^7]: https://skywork.ai/skypage/en/mark3labs%2Fmcp-filesystem-server: A Deep Dive for AI Engineers/1971095480809418752

[^8]: https://playbooks.com/mcp/safurrier-filesystem

[^9]: https://github.com/Promptly-Technologies-LLC/mcp-structured-thinking

[^10]: https://skywork.ai/skypage/en/sqlite-mcp-server-guide-ai-engineers/1977629649939787776

[^11]: https://playbooks.com/mcp/isaac-gounton-sqlite

[^12]: https://skywork.ai/skypage/en/cheny-alf-secure-filesystem-mcp-server/1977922670831783936

[^13]: https://mcpservers.org/servers/panasenco/mcp-sqlite

[^14]: https://skywork.ai/skypage/en/phillips-think-tool-ai-engineers-guide/1977622899914641408

[^15]: https://n8n.io/workflows/3632-build-your-own-sqlite-mcp-server/

[^16]: https://modelcontextprotocol.io/examples

[^17]: https://github.com/modelcontextprotocol/servers

[^18]: https://dev.to/copilotkit/30-mcp-ideas-with-complete-source-code-d8e

[^19]: https://github.com/apappascs/mcp-servers-hub

[^20]: https://www.reddit.com/r/ClaudeAI/comments/1jf4hnt/setting_up_mcp_servers_in_claude_code_a_tech/
