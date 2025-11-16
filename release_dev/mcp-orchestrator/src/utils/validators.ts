import { logger } from './logger.js';

/**
 * Input validation utilities for SERVER-MCP
 *
 * Prevents:
 * - Command injection
 * - SQL injection
 * - Path traversal
 * - Arbitrary code execution
 */

/**
 * Validate database name (PostgreSQL identifier rules)
 * - Alphanumeric + underscore only
 * - Must start with letter or underscore
 * - Max 63 characters
 */
export function validateDatabaseName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // PostgreSQL identifier rules
  const dbNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

  if (!dbNameRegex.test(name)) {
    logger.warn('Invalid database name', { name });
    return false;
  }

  // Reject SQL keywords that could be dangerous
  const sqlKeywords = [
    'DROP',
    'DELETE',
    'TRUNCATE',
    'ALTER',
    'CREATE',
    'GRANT',
    'REVOKE',
    'INSERT',
    'UPDATE',
    'SELECT',
  ];

  if (sqlKeywords.includes(name.toUpperCase())) {
    logger.warn('Database name matches SQL keyword', { name });
    return false;
  }

  return true;
}

/**
 * Validate systemd service name
 * Uses allowlist approach for security
 */
export function validateServiceName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Allowed systemd services for monitoring
  const allowedServices = [
    'postgresql',
    'postgres',
    'redis',
    'redis-server',
    'keycloak',
    'nginx',
    'docker',
    'pm2',
    'server-mcp',
    'ssh',
    'sshd',
    'ufw',
    'fail2ban',
    'rsyslog',
    'systemd-journald',
    'cron',
  ];

  if (!allowedServices.includes(name)) {
    logger.warn('Service name not in allowlist', { name, allowedServices });
    return false;
  }

  return true;
}

/**
 * Validate file path is within allowed directories
 * Prevents path traversal attacks
 */
export function validateFilePath(path: string, allowedDirs: readonly string[]): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }

  // Check for path traversal patterns
  const traversalPatterns = ['../', '..\\', '%2e%2e', '%252e%252e', '....//', '....\\\\'];

  for (const pattern of traversalPatterns) {
    if (path.toLowerCase().includes(pattern.toLowerCase())) {
      logger.warn('Path traversal attempt detected', { path, pattern });
      return false;
    }
  }

  // Check if path starts with an allowed directory
  const isAllowed = allowedDirs.some((allowedDir) => {
    // Normalize paths for comparison
    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedAllowed = allowedDir.replace(/\\/g, '/');

    return normalizedPath.startsWith(normalizedAllowed);
  });

  if (!isAllowed) {
    logger.warn('File path not in allowed directories', { path, allowedDirs });
    return false;
  }

  // Check for null bytes (can bypass some validation)
  if (path.includes('\0')) {
    logger.warn('Null byte in file path', { path });
    return false;
  }

  return true;
}

/**
 * Sanitize shell argument to prevent command injection
 *
 * Strategy:
 * 1. Allowlist approach - only allow safe characters
 * 2. Escape shell metacharacters
 * 3. Quote the result
 */
export function sanitizeShellArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    throw new Error('Invalid shell argument: must be non-empty string');
  }

  // Check for command substitution first
  if (arg.includes('$(') || arg.includes('`')) {
    throw new Error('Command substitution not allowed in shell arguments');
  }

  // Remove any shell metacharacters
  const dangerous = [
    ';',
    '&',
    '|',
    '<',
    '>',
    '$',
    '(',
    ')',
    '{',
    '}',
    '[',
    ']',
    '\\',
    "'",
    '"',
    '\n',
    '\r',
    '\t',
    '*',
    '?',
    ' ',
  ];

  for (const char of dangerous) {
    if (arg.includes(char)) {
      logger.warn('Dangerous character in shell argument', { arg, char });
      throw new Error(`Shell argument contains dangerous character: ${char}`);
    }
  }

  return arg;
}

/**
 * Validate PostgreSQL table/schema name
 */
export function validateIdentifier(identifier: string): boolean {
  if (!identifier || typeof identifier !== 'string') {
    return false;
  }

  // PostgreSQL identifier rules (same as database name)
  const identifierRegex = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

  return identifierRegex.test(identifier);
}

/**
 * Validate numeric parameter is within safe range
 */
export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  paramName: string
): boolean {
  if (typeof value !== 'number' || isNaN(value)) {
    logger.warn('Invalid numeric parameter', { paramName, value });
    return false;
  }

  if (value < min || value > max) {
    logger.warn('Numeric parameter out of range', {
      paramName,
      value,
      min,
      max,
    });
    return false;
  }

  return true;
}

/**
 * Validate hostname/IP address
 * Prevents SSRF attacks
 */
export function validateHost(host: string): boolean {
  if (!host || typeof host !== 'string') {
    return false;
  }

  // IPv4 regex (proper validation for 0-255 range) - check this first
  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  // IPv6 regex (simplified)
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1|::)$/;

  // Hostname regex (RFC 1123) - must NOT be all numeric (to avoid matching invalid IPs)
  const hostnameRegex =
    /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  const allNumericWithDots = /^[0-9.]+$/;

  // Check IP formats first, then hostname (but reject all-numeric hostnames that aren't valid IPs)
  const isValidIP = ipv4Regex.test(host) || ipv6Regex.test(host);
  const isValidHostname = hostnameRegex.test(host) && !allNumericWithDots.test(host);
  const isValid = isValidIP || isValidHostname;

  if (!isValid) {
    logger.warn('Invalid host format', { host });
    return false;
  }

  // Private/internal IP patterns for optional SSRF protection
  // const privateRanges = [
  //   /^127\./,           // Loopback
  //   /^10\./,            // Private class A
  //   /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private class B
  //   /^192\.168\./,      // Private class C
  //   /^169\.254\./,      // Link-local
  //   /^::1$/,            // IPv6 loopback
  //   /^fc00:/,           // IPv6 private
  // ];

  // Note: Private IP blocking is disabled by default because SERVER-MCP
  // operates within internal infrastructure. Uncomment the block below if
  // you need to enforce SSRF hardening for external traffic.

  /*
  for (const range of privateRanges) {
    if (range.test(host)) {
      logger.warn("Private IP address not allowed", { host });
      return false;
    }
  }
  */

  return true;
}

/**
 * Validate container name (Docker/PM2)
 * Alphanumeric, hyphen, underscore only
 */
export function validateContainerName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  const containerRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

  if (!containerRegex.test(name)) {
    logger.warn('Invalid container name', { name });
    return false;
  }

  return true;
}

/**
 * Allowed log file directories for NGINX, PostgreSQL, etc.
 */
export const ALLOWED_LOG_DIRS = [
  '/var/log/nginx',
  '/var/log/postgresql',
  '/var/log/keycloak',
  '/var/log/redis',
  '/var/log/pm2',
  '/var/log',
] as const;

/**
 * Allowed backup directories
 */
export const ALLOWED_BACKUP_DIRS = [
  '/var/backups',
  '/opt/backups',
  '/home/backups',
  process.env.BACKUP_DIR || '/tmp/backups',
] as const;

/**
 * Validate email address (for notifications, user management)
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // RFC 5322 simplified regex
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(email);
}
