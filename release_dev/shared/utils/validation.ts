/**
 * Input Validation Utilities
 * Shared validation functions for security-critical operations
 */

/**
 * ValidationError for invalid input
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate and quote a PostgreSQL identifier (table, schema, column name)
 * Prevents SQL injection by ensuring identifiers contain only safe characters
 *
 * @param identifier - The identifier to validate
 * @param context - Optional context for error messages (e.g., "schema", "table")
 * @returns Quoted identifier safe for SQL queries
 * @throws ValidationError if identifier is invalid
 */
export function validatePostgresIdentifier(identifier: string, context = 'identifier'): string {
  // PostgreSQL identifier rules:
  // - Must start with letter or underscore
  // - Can contain letters, digits, underscores, and dollar signs
  // - Maximum length is 63 characters
  // - Case insensitive unless quoted

  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new ValidationError(`${context} must be a non-empty string`);
  }

  if (identifier.length > 63) {
    throw new ValidationError(`${context} exceeds maximum length of 63 characters: ${identifier}`);
  }

  // Allow alphanumeric, underscore, and dollar sign (PostgreSQL standard)
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(identifier)) {
    throw new ValidationError(
      `${context} contains invalid characters. Must start with letter or underscore, ` +
      `and contain only alphanumeric, underscore, or dollar sign: ${identifier}`
    );
  }

  // Check for SQL reserved keywords (add more as needed)
  const reservedKeywords = [
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'PROCEDURE', 'FUNCTION',
    'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'UNION', 'WHERE', 'FROM'
  ];

  if (reservedKeywords.includes(identifier.toUpperCase())) {
    // Reserved keywords should be quoted
    return `"${identifier}"`;
  }

  // Quote identifier to handle case-sensitivity and special characters
  return `"${identifier}"`;
}

/**
 * Validate database name
 * More restrictive than general identifiers
 */
export function validateDatabaseName(dbName: string): string {
  if (typeof dbName !== 'string' || dbName.length === 0) {
    throw new ValidationError('Database name must be a non-empty string');
  }

  if (dbName.length > 63) {
    throw new ValidationError(`Database name exceeds maximum length of 63 characters: ${dbName}`);
  }

  // Database names: lowercase alphanumeric and underscores only
  if (!/^[a-z][a-z0-9_]*$/.test(dbName)) {
    throw new ValidationError(
      `Database name must start with lowercase letter and contain only ` +
      `lowercase alphanumeric and underscores: ${dbName}`
    );
  }

  return dbName;
}

/**
 * Validate schema name (schema.table format)
 */
export function validateSchemaTableName(schemaTable: string): { schema: string; table: string } {
  const parts = schemaTable.split('.');

  if (parts.length !== 2) {
    throw new ValidationError(
      `Schema.table must be in format "schema.table": ${schemaTable}`
    );
  }

  return {
    schema: validatePostgresIdentifier(parts[0]!, 'schema'),
    table: validatePostgresIdentifier(parts[1]!, 'table')
  };
}

/**
 * Validate port number
 */
export function validatePort(port: number | string, context = 'port'): number {
  const portNum = typeof port === 'string' ? parseInt(port, 10) : port;

  if (isNaN(portNum)) {
    throw new ValidationError(`${context} must be a valid number: ${port}`);
  }

  if (portNum < 1 || portNum > 65535) {
    throw new ValidationError(`${context} must be between 1 and 65535: ${portNum}`);
  }

  return portNum;
}

/**
 * Validate hostname or IP address
 */
export function validateHost(host: string, context = 'host'): string {
  if (typeof host !== 'string' || host.length === 0) {
    throw new ValidationError(`${context} must be a non-empty string`);
  }

  // Check for IPv4 address
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(host)) {
    // Validate IPv4 octets
    const octets = host.split('.').map(Number);
    if (octets.some(octet => octet > 255)) {
      throw new ValidationError(`${context} is not a valid IPv4 address: ${host}`);
    }
    return host;
  }

  // Check for IPv6 address
  if (host.includes(':')) {
    // Basic IPv6 validation
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ipv6Regex.test(host)) {
      throw new ValidationError(`${context} is not a valid IPv6 address: ${host}`);
    }
    return host;
  }

  // Check for hostname
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!hostnameRegex.test(host)) {
    throw new ValidationError(
      `${context} is not a valid hostname or IP address: ${host}`
    );
  }

  return host;
}

/**
 * Validate email address
 */
export function validateEmail(email: string): string {
  if (typeof email !== 'string' || email.length === 0) {
    throw new ValidationError('Email must be a non-empty string');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError(`Invalid email format: ${email}`);
  }

  if (email.length > 254) {
    throw new ValidationError('Email exceeds maximum length of 254 characters');
  }

  return email.toLowerCase();
}

/**
 * Validate UUID
 */
export function validateUUID(uuid: string, context = 'UUID'): string {
  if (typeof uuid !== 'string') {
    throw new ValidationError(`${context} must be a string`);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ValidationError(`${context} is not a valid UUID: ${uuid}`);
  }

  return uuid.toLowerCase();
}

/**
 * Sanitize string for logging (remove sensitive data patterns)
 */
export function sanitizeForLog(str: string): string {
  // Remove potential passwords, tokens, secrets
  return str
    .replace(/password[=:]\s*['"]?[^'"&\s]+['"]?/gi, 'password=***')
    .replace(/token[=:]\s*['"]?[^'"&\s]+['"]?/gi, 'token=***')
    .replace(/secret[=:]\s*['"]?[^'"&\s]+['"]?/gi, 'secret=***')
    .replace(/api[_-]?key[=:]\s*['"]?[^'"&\s]+['"]?/gi, 'api_key=***')
    .replace(/bearer\s+[^\s]+/gi, 'bearer ***')
    .replace(/authorization:\s*[^\s]+/gi, 'authorization: ***');
}

/**
 * Validate and sanitize user input string
 * Prevents XSS and injection attacks
 */
export function sanitizeUserInput(input: string, maxLength = 1000): string {
  if (typeof input !== 'string') {
    throw new ValidationError('Input must be a string');
  }

  if (input.length > maxLength) {
    throw new ValidationError(`Input exceeds maximum length of ${maxLength} characters`);
  }

  // Remove null bytes
  const sanitized = input.replace(/\0/g, '');

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers
    /<iframe/i,
    /eval\(/i,
    /expression\(/i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      throw new ValidationError('Input contains potentially dangerous content');
    }
  }

  return sanitized;
}

/**
 * Validate integer within range
 */
export function validateInteger(
  value: number | string,
  min: number,
  max: number,
  context = 'value'
): number {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;

  if (isNaN(num) || !Number.isInteger(num)) {
    throw new ValidationError(`${context} must be an integer: ${value}`);
  }

  if (num < min || num > max) {
    throw new ValidationError(`${context} must be between ${min} and ${max}: ${num}`);
  }

  return num;
}

/**
 * Validate array of strings
 */
export function validateStringArray(
  arr: unknown,
  maxLength = 100,
  itemMaxLength = 1000,
  context = 'array'
): string[] {
  if (!Array.isArray(arr)) {
    throw new ValidationError(`${context} must be an array`);
  }

  if (arr.length > maxLength) {
    throw new ValidationError(`${context} exceeds maximum length of ${maxLength} items`);
  }

  const validated: string[] = [];
  for (const item of arr) {
    if (typeof item !== 'string') {
      throw new ValidationError(`${context} must contain only strings`);
    }
    validated.push(sanitizeUserInput(item, itemMaxLength));
  }

  return validated;
}
