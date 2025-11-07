module.exports = {
  apps: [
    {
      name: "server-mcp",
      script: "./dist/index.js",
      cwd: "/opt/server-mcp",

      // Instances and execution mode
      instances: 1,
      exec_mode: "fork", // Use fork mode for MCP stdio transport

      // Environment
      env: {
        NODE_ENV: "production",
        SERVER_MCP_LOG_LEVEL: "info",
        SERVER_MCP_SQLITE_PATH: "/var/lib/server-mcp/mcp_cache.db",
        SERVER_MCP_QUEUE_PATH: "/var/lib/server-mcp/mcp_command_queue.db",
      },

      // Environment file (overrides env above)
      env_file: "/etc/server-mcp/server-mcp.env",

      // Restart configuration
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,

      // Watch and ignore patterns
      watch: false,
      ignore_watch: ["node_modules", "*.log", "*.db", "*.db-shm", "*.db-wal"],

      // Logging
      error_file: "/var/log/server-mcp/error.log",
      out_file: "/var/log/server-mcp/output.log",
      log_file: "/var/log/server-mcp/combined.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Advanced features
      time: true, // Prefix logs with timestamp
      kill_timeout: 5000, // Time to wait for graceful shutdown
      wait_ready: false, // Don't wait for ready signal (stdio-based)
      listen_timeout: 10000,
      shutdown_with_message: true,

      // Resource limits (optional)
      max_memory_restart: "2G",

      // Cron restart (optional - restart daily at 3 AM for memory cleanup)
      // cron_restart: "0 3 * * *",

      // User/Group (if PM2 running as root)
      // uid: "mcp-agent",
      // gid: "mcp-agent",

      // Source map support
      source_map_support: true,

      // Metadata
      vizion: false, // Disable git metadata
      autorestart: true,

      // Health monitoring
      // max_memory_restart: "2G",
      // min_uptime: "10s",
    },
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: "deploy",
      host: "server.acdev.host",
      ref: "origin/main",
      repo: "git@github.com:yourusername/SERVER-MCP.git",
      path: "/opt/server-mcp",
      "post-deploy": "npm install && npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-deploy-local": "echo 'Deploying to production server'",
    },
  },
};
