const path = require(node:path);

const root = process.env.MCP_BUNDLE_ROOT ?? /opt/mcp-bundle;
const buildPath = (...segments) => path.join(root, ...segments);

const sharedLogOptions = {
  time: true,
  merge_logs: true,
  log_date_format: YYYY-MM-DD
