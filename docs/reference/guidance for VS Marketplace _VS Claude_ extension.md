<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# guidance for VS Marketplace "VS Claude" extension combined with Sequential Thinking MCP and anything for long coding sessions for making MCP servers and Node based js applications and typescript then implementing over ssh to vps ubuntu servers

Perfect. Now I have comprehensive information. Let me compile a detailed guidance document for the user.

## Comprehensive Guidance: VS Claude + Sequential Thinking MCP for Long-Coding Sessions with SSH Deployment

### Architecture Overview and Setup Strategy

The most powerful setup combines **VS Claude extension** (Go-based MCP server integrated with VS Code), **Sequential Thinking MCP** for structured problem decomposition, and a **dedicated context management strategy** for multi-day coding sessions building Node.js/TypeScript applications and MCP servers, then deploying via SSH to Ubuntu VPS servers.[^1][^2][^3]

#### VS Claude Extension Installation

**Initial Setup Steps:**

1. **Install from VS Code Marketplace**: Search for "VS Claude" (published by the official maintainers) and install. This adds a dedicated button in your activity bar.[^2][^1]
2. **Install MCP Server Backend**: The extension prompts you to install the MCP server (written in Go). Click "Install" or run `VS Claude: Install MCP` from the command palette. For manual setup, follow the configuration instructions provided.[^1]
3. **API Key Configuration**: The extension automatically detects your Anthropic API key from environment variables or prompts you to configure it via settings. Set `ANTHROPIC_API_KEY` as an environment variable for team deployments.[^3][^4]
4. **Verify Installation**: Once installed, you'll see an MCP server indicator in the bottom-right corner of the input box when communicating with Claude. Click it to view available tools and resources.[^5]

#### Sequential Thinking MCP Configuration

Add Sequential Thinking to your MCP configuration for structured reasoning during complex development tasks:

**For Claude Desktop** (if using Claude Code CLI alongside VS Claude):

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

**For VS Code with VS Claude**:

Create or edit `.vscode/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

**Configuration File Locations:**

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Restart VS Claude after configuration changes to load the MCP servers.[^6][^7][^5]

### Long Coding Session Context Management Strategy

For sustained multi-hour or multi-day development sessions, implement hierarchical `CLAUDE.md` files to keep token usage efficient and context focused:[^8][^9][^10][^11]

**Directory Structure Pattern**:

```
~/.claude/CLAUDE.md                          # Global user preferences
~/projects/your-app/
├── CLAUDE.md                                 # Project-level guidelines
├── mcp-servers/
│   └── CLAUDE.md                            # MCP-specific patterns
├── backend/
│   └── CLAUDE.md                            # Backend Node/TS standards
└── deployment/
    └── CLAUDE.md                            # SSH/Ubuntu deployment notes
```

**Root CLAUDE.md** (Core Project Knowledge - Keep Under 2000 Tokens):

```markdown
# Project: Node.js/TypeScript MCP Server Deployment

## Quick Commands

- `npm run build`: Compile TypeScript to JavaScript
- `npm run dev`: Run with hot reload (tsx)
- `npm run test`: Run Jest test suite
- `npm run typecheck`: Run TypeScript type checking
- `npm run lint`: Check code style with ESLint
- `ssh deploy@your-vps-ip`: Connect to production server

## Code Standards

- Use ES modules (import/export), never CommonJS
- Destructure imports: `import { Server, Tool } from '@modelcontextprotocol/sdk/server'`
- Async/await for all I/O operations
- Always use TypeScript strict mode
- Prefer const for immutability; avoid var

## MCP Server Architecture

- Entry point: `src/index.ts`
- Tools defined in `src/tools/`
- Resources in `src/resources/`
- Use JSON-RPC 2.0 protocol
- Always implement proper error handling

## SSH Deployment

- Ubuntu 24.04 LTS target
- Deploy to `/opt/mcp-server/`
- Use systemd service for process management
- Environment file at `/etc/mcp-server/.env`
- Restart service: `systemctl restart mcp-server`

## Testing Against Production

- Run full test suite before deployment
- Always backup current version before SSH deploy
- Test SSH connectivity first: `ssh deploy@vps-ip 'echo test'`
```

**Backend/MCP-Specific CLAUDE.md** (Tool-Specific Context):

```markdown
# MCP Server Development Standards

## Tool Creation Pattern

1. Define tool schema in `InputSchema`
2. Implement handler with error catching
3. Add comprehensive JSDoc comments
4. Write unit tests in `__tests__/`

## Common Issues & Solutions

- "Tool not found": Verify tool is in `tools/list` response
- SSH timeout: Increase timeout in config, check network
- Missing dependencies: Always run `npm ci` before deploy
- Permission denied on VPS: Check SSH key permissions (600)

## Useful References

- See /backend-architecture.md for schema details
- SSH deployment steps: /deployment-guide.md
```

**Why This Matters**: Claude automatically reads hierarchical `CLAUDE.md` files, using specific guidance before general. A 2000-token cap across all CLAUDE.md files in your project hierarchy keeps Claude focused.[^11]

### Building MCP Servers for Node.js/TypeScript

**Optimal Project Structure** for production-ready MCP servers:

```
my-mcp-server/
├── src/
│   ├── index.ts              # Entry point with stdio transport
│   ├── tools/                # Tool implementations
│   │   ├── ssh-execute.ts    # SSH command execution
│   │   ├── file-transfer.ts  # SFTP operations
│   │   └── server-health.ts  # Health checks
│   ├── resources/            # MCP resources
│   └── utils/
│       ├── ssh-client.ts     # SSH connection pooling
│       └── error-handler.ts  # Standardized error handling
├── build/                     # Compiled JavaScript output
├── .github/workflows/         # CI/CD for auto-testing
├── package.json
├── tsconfig.json
└── mcp.json                   # Local dev MCP config
```

**Essential npm Scripts**:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/**/*.ts",
    "deploy": "npm run build && node scripts/deploy.js"
  }
}
```

**Template MCP Server Entry Point** (Typescript):

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Tool, TextContent } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  {
    name: 'my-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
const tools: Tool[] = [
  {
    name: 'execute-command',
    description: 'Execute a remote command via SSH',
    inputSchema: {
      type: 'object' as const,
      properties: {
        host: { type: 'string', description: 'SSH host' },
        command: { type: 'string', description: 'Command to execute' },
      },
      required: ['host', 'command'],
    },
  },
];

server.setRequestHandler('tools/list' as any, async () => ({
  tools,
}));

server.setRequestHandler('tools/call' as any, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    // Tool implementation logic
    const result = await executeCommand(args.host, args.command);
    return {
      content: [{ type: 'text' as const, text: result }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### SSH MCP Integration for Ubuntu VPS Deployment

**Add SSH-Enabled MCP Server to Your Configuration**:

```json
{
  "mcpServers": {
    "ssh-operations": {
      "command": "npx",
      "args": ["-y", "@aiondadotcom/mcp-ssh"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

**What This Enables**:

- List SSH hosts from `~/.ssh/config`
- Execute remote commands with timeout handling
- Upload/download files via SFTP
- Check server connectivity and health
- All invoked through Claude naturally: "Deploy the server to production"[^12][^13]

**SSH Key Setup** (One-Time on Your Machine):

```bash
# Generate SSH key if you don't have one
ssh-keygen -t ed25519 -f ~/.ssh/vps_deploy -C "claude-deployment"

# Copy public key to VPS
ssh-copy-id -i ~/.ssh/vps_deploy deploy@your-vps-ip

# Test connectivity
ssh deploy@your-vps-ip "echo 'Connected successfully'"

# Add to ~/.ssh/config for ease of use
cat >> ~/.ssh/config << EOF
Host mcp-vps
    HostName your-vps-ip
    User deploy
    IdentityFile ~/.ssh/vps_deploy
    StrictHostKeyChecking no
EOF
```

### Production Deployment Workflow with Claude

**Deployment Steps Using Claude Code with MCP**:

1. **Build \& Validate Locally**:
   - Ask Claude: "Build the TypeScript MCP server and run the full test suite"
   - Claude executes: `npm run build`, `npm run test`, `npm run typecheck`
2. **SSH Deploy** (Claude can execute these through MCP SSH):

```bash
# Create deployment directory on VPS (run once)
ssh deploy@mcp-vps "mkdir -p /opt/mcp-server && chmod 755 /opt/mcp-server"

# Upload build artifacts
scp -r build/* deploy@mcp-vps:/opt/mcp-server/

# Upload package.json and node_modules
scp package*.json deploy@mcp-vps:/opt/mcp-server/
scp -r node_modules deploy@mcp-vps:/opt/mcp-server/
```

3. **Start Service on Ubuntu**:

```bash
# Create systemd service file
ssh deploy@mcp-vps << 'EOFSERVICE'
sudo tee /etc/systemd/system/mcp-server.service > /dev/null << 'EOF'
[Unit]
Description=MCP Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/mcp-server
ExecStart=/usr/bin/node /opt/mcp-server/build/index.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mcp-server
sudo systemctl start mcp-server
EOFSERVICE
```

4. **Verify Deployment**:

```bash
ssh deploy@mcp-vps "systemctl status mcp-server"
ssh deploy@mcp-vps "journalctl -u mcp-server -f"  # View logs
```

### Context Management for Extended Sessions

**Token-Aware Session Pattern**:[^14][^15]

Claude Sonnet 4.5 and Haiku 4.5 include **context awareness**—they automatically track remaining token budget and inform Claude of capacity:

```
<budget:token_budget>200000</budget:token_budget>
```

**For Long Sessions (6+ Hours)**:

1. **Save Progress Periodically**: Ask Claude to write session progress to `.session-notes.md`:

```markdown
## Session Summary [Timestamp]

- Completed: Feature X, Tests for Y
- In Progress: Feature Z (80% done)
- Next: Deploy to VPS, monitor logs
- Context tokens used: ~120k/200k
```

2. **Use `/clear` Command**: When context approaches ~180k tokens:

```
/clear
```

Then start fresh session: "Read .session-notes.md and continue from where we left off" 3. **Sub-Agent Pattern**: For modular work (frontend MCP server, backend tools, deployment), ask Claude:

> "Create a subagent scoped to the `/backend` directory for backend work"

This isolates context per component.[^8] 4. **CLAUDE.md as Context Anchor**: Every session automatically loads your hierarchical CLAUDE.md files, giving Claude consistent context about your project patterns, tooling, and conventions.[^10]

### Remote SSH Development with VS Code Claude

If working entirely on your Ubuntu VPS via SSH:

1. **Install Remote SSH Extension**: Open VS Code locally, install "Remote - SSH"
2. **Connect to VPS**: Use Remote Explorer, add `ssh deploy@mcp-vps`
3. **Install VS Claude Remotely**: Once SSH connection active, install "VS Claude" extension on remote host (it will appear under Remote Installed)
4. **Configure MCP on Remote**: Edit `/home/deploy/.config/Claude/claude_desktop_config.json` on VPS with Sequential Thinking and local tools
5. **Develop Remotely**: Now VS Claude runs on your VPS with full access to local files and commands[^16]

### Performance Optimization Checklist for Long Sessions

- **Pre-build and Cache**: Compile TypeScript once, commit build artifacts to reduce per-session overhead
- **Database Indexing**: If MCP server queries databases, ensure indexes on frequently-queried fields for faster tool responses[^17]
- **Connection Pooling**: For SSH operations, use connection pooling via `ssh2` Node.js library to reuse connections[^17]
- **Input Validation**: Always validate MCP tool inputs to catch errors early and reduce token waste on debugging malformed requests[^17]
- **Monitoring \& Logging**: Set up structured logging (Winston/Pino) to track MCP tool execution, latency, and errors for production visibility[^17]

### Security Best Practices for Production

- **Environment Variables**: Never commit `.env` files. Use `dotenv` with `.env.example` templates[^17]
- **SSH Key Management**: Store private keys with `600` permissions; use SSH agent forwarding for multi-hop deployments
- **Rate Limiting**: Implement rate limiting in MCP tools to prevent abuse (e.g., max 10 SSH commands/minute)[^17]
- **HTTPS/TLS**: If exposing MCP over network, always use TLS certificates
- **Audit Logging**: Log all MCP tool invocations with user/timestamp for compliance and debugging[^17]

### Recommended Development Stack Summary

| Component         | Recommendation                | Why                                                          |
| :---------------- | :---------------------------- | :----------------------------------------------------------- |
| **IDE**           | VS Code + VS Claude Extension | Native MCP integration, Go backend is fast                   |
| **Reasoning**     | Sequential Thinking MCP       | Breaks down complex MCP server design into steps             |
| **Language**      | TypeScript + Node.js 20+ LTS  | Strong typing, extensive MCP SDKs, modern async              |
| **MCP Transport** | StdioServerTransport          | Local development, no network overhead                       |
| **Testing**       | Jest + TypeScript             | Full type safety across tests, mocking for SSH               |
| **Deployment**    | Ubuntu 24.04 + systemd        | LTS support, native Node.js, easy service management         |
| **SSH Tool**      | @aiondadotcom/mcp-ssh         | Official, well-maintained, integrates with Claude seamlessly |
| **Monitoring**    | systemctl logs + journalctl   | Built-in, no external dependencies                           |

This setup provides professional-grade context management for sustained development, integrates SSH deployment directly into Claude's workflow, and scales to complex multi-server Node.js/TypeScript architectures.
<span style="display:none">[^18][^19][^20][^21][^22][^23][^24][^25][^26][^27][^28][^29][^30][^31][^32][^33][^34][^35][^36][^37]</span>

<div align="center">⁂</div>

[^1]: https://marketplace.visualstudio.com/items?itemName=MarioZechner.vs-claude

[^2]: https://docs.claude.com/en/docs/claude-code/vs-code

[^3]: https://www.eesel.ai/blog/vs-code-claude-code

[^4]: https://skywork.ai/blog/how-to-set-up-claude-code-sdk-with-vs-code-in-10-minutes/

[^5]: https://modelcontextprotocol.io/docs/develop/connect-local-servers

[^6]: https://playbooks.com/mcp/anthropic-sequential-thinking

[^7]: https://modelcontextprotocol.info/docs/quickstart/user/

[^8]: https://www.anthropic.com/engineering/claude-code-best-practices

[^9]: https://blog.sshh.io/p/how-i-use-every-claude-code-feature

[^10]: https://www.siddharthbharath.com/claude-code-the-complete-guide/

[^11]: https://rosmur.github.io/claudecode-best-practices/

[^12]: https://github.com/AiondaDotCom/mcp-ssh

[^13]: https://github.com/mixelpixx/SSH-MCP

[^14]: https://docs.claude.com/en/docs/build-with-claude/context-windows

[^15]: https://www.anthropic.com/news/context-management

[^16]: https://code.visualstudio.com/docs/remote/ssh

[^17]: https://dev.to/sholajegede/build-a-production-ready-ai-native-mcp-server-in-typescript-2034

[^18]: https://www.reddit.com/r/ClaudeAI/comments/1o1kmgj/visual_studio_code_claudecode_chat_panel_setup/

[^19]: https://www.cometapi.com/managing-claude-codes-context/

[^20]: https://forum.cursor.com/t/claude-code-side-panel-chat-panel-setup-guide/136714

[^21]: https://docs.typingmind.com/model-context-protocol-(mcp)-in-typingmind/typingmind-mcp-sequential-thinking

[^22]: https://www.mintlify.com/blog/how-claudes-memory-and-mcp-work

[^23]: https://www.reddit.com/r/ClaudeAI/comments/1l1dele/is_it_possible_to_use_claude_code_vs_code/

[^24]: https://dev.to/gustavosbarreto/remote-ai-coding-with-claude-code-and-shellhub-25

[^25]: https://www.youtube.com/watch?v=TSi-643wvQg

[^26]: https://www.youtube.com/watch?v=K1wALM7hebE

[^27]: https://generect.com/blog/claude-mcp/

[^28]: https://simplescraper.io/blog/how-to-mcp

[^29]: https://www.hostinger.com/support/11970152-how-to-use-the-claude-code-vps-template/

[^30]: https://apidog.com/blog/how-to-quickly-build-a-mcp-server-for-claude-code/

[^31]: https://www.anthropic.com/engineering/code-execution-with-mcp

[^32]: https://www.anthropic.com/engineering/desktop-extensions

[^33]: https://www.reddit.com/r/ClaudeAI/comments/1ji8ruv/my_claude_workflow_guide_advanced_setup_with_mcp/

[^34]: https://lobehub.com/mcp/dimascior-claude_automation

[^35]: https://collabnix.com/how-to-build-mcp-server-using-typescript-from-scratch-complete-tutorial/

[^36]: https://www.reddit.com/r/ClaudeAI/comments/1lr6occ/tip_managing_large_claudemd_files_with_document/

[^37]: https://www.freecodecamp.org/news/how-to-build-a-to-do-list-mcp-server-using-typescript/
