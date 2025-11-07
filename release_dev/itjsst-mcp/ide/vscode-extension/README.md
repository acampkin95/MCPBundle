# VS Code Extension Stub

This extension exposes a lightweight IT-MCP companion for VS Code. It relies on the workspace checkout of the MCP server so it can shell out to the local CLI.

## Commands

- `IT MCP: Show Tool Catalog` &mdash; calls the `tool-metadata` CLI endpoint and displays tool info with required capabilities.
- `IT MCP: Run Mac Permissions Audit` &mdash; runs `mac-permissions audit` and streams the JSON results into an output channel.

## Development

```
cd ide/vscode-extension
npm install
npm run compile
```

Launch the extension host (Run -> "Launch Extension") with the workspace open. The extension expects `npm run build` (or `dist/cli/itMcpCli.js`) to succeed so the CLI commands are available.
