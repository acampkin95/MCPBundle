/**
 * Unit tests for validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  validateDatabaseName,
  validateServiceName,
  validateFilePath,
  sanitizeShellArg,
  validateIdentifier,
  validateNumericRange,
  validateHost,
  validateContainerName,
  validateEmail,
  ALLOWED_LOG_DIRS,
  ALLOWED_BACKUP_DIRS,
} from '../../../src/utils/validators.js';

describe('validators', () => {
  describe('validateDatabaseName', () => {
    it('should accept valid database names', () => {
      expect(validateDatabaseName('my_database')).toBe(true);
      expect(validateDatabaseName('test123')).toBe(true);
      expect(validateDatabaseName('_underscore_start')).toBe(true);
      expect(validateDatabaseName('MixedCase_123')).toBe(true);
    });

    it('should reject invalid database names', () => {
      expect(validateDatabaseName('123invalid')).toBe(false); // Starts with number
      expect(validateDatabaseName('has-dash')).toBe(false); // Contains dash
      expect(validateDatabaseName('has spaces')).toBe(false); // Contains spaces
      expect(validateDatabaseName('has.dot')).toBe(false); // Contains dot
      expect(validateDatabaseName('a'.repeat(64))).toBe(false); // Too long (>63 chars)
    });

    it('should reject SQL keywords', () => {
      expect(validateDatabaseName('DROP')).toBe(false);
      expect(validateDatabaseName('delete')).toBe(false);
      expect(validateDatabaseName('SELECT')).toBe(false);
      expect(validateDatabaseName('insert')).toBe(false);
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateDatabaseName('')).toBe(false);
      expect(validateDatabaseName(null as any)).toBe(false);
      expect(validateDatabaseName(undefined as any)).toBe(false);
      expect(validateDatabaseName(123 as any)).toBe(false);
    });
  });

  describe('validateServiceName', () => {
    it('should accept services in the allowlist', () => {
      expect(validateServiceName('postgresql')).toBe(true);
      expect(validateServiceName('postgres')).toBe(true);
      expect(validateServiceName('redis')).toBe(true);
      expect(validateServiceName('nginx')).toBe(true);
      expect(validateServiceName('docker')).toBe(true);
    });

    it('should reject services not in the allowlist', () => {
      expect(validateServiceName('malicious-service')).toBe(false);
      expect(validateServiceName('apache')).toBe(false);
      expect(validateServiceName('random')).toBe(false);
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateServiceName('')).toBe(false);
      expect(validateServiceName(null as any)).toBe(false);
      expect(validateServiceName(undefined as any)).toBe(false);
    });
  });

  describe('validateFilePath', () => {
    it('should accept paths within allowed directories', () => {
      expect(validateFilePath('/var/log/nginx/access.log', ['/var/log'])).toBe(true);
      expect(validateFilePath('/opt/backups/db.sql', ['/opt/backups'])).toBe(true);
      expect(validateFilePath('/home/user/file.txt', ['/home/user', '/tmp'])).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(validateFilePath('/var/log/../../../etc/passwd', ['/var/log'])).toBe(false);
      expect(validateFilePath('/var/log/..\\..\\windows\\system32', ['/var/log'])).toBe(false);
      expect(validateFilePath('/var/log/%2e%2e/etc/passwd', ['/var/log'])).toBe(false);
      expect(validateFilePath('/var/log/%252e%252e/secret', ['/var/log'])).toBe(false);
      expect(validateFilePath('/var/log/....//..//etc/passwd', ['/var/log'])).toBe(false);
    });

    it('should reject paths not in allowed directories', () => {
      expect(validateFilePath('/etc/passwd', ['/var/log'])).toBe(false);
      expect(validateFilePath('/tmp/file.txt', ['/var/log', '/opt'])).toBe(false);
    });

    it('should reject null bytes', () => {
      expect(validateFilePath('/var/log/file.txt\0malicious', ['/var/log'])).toBe(false);
    });

    it('should handle Windows-style paths', () => {
      expect(validateFilePath('C:\\backups\\db.sql', ['C:\\backups'])).toBe(true);
      expect(validateFilePath('C:\\Windows\\System32\\evil.dll', ['C:\\backups'])).toBe(false);
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateFilePath('', ['/var/log'])).toBe(false);
      expect(validateFilePath(null as any, ['/var/log'])).toBe(false);
      expect(validateFilePath(123 as any, ['/var/log'])).toBe(false);
    });
  });

  describe('sanitizeShellArg', () => {
    it('should accept safe arguments', () => {
      expect(sanitizeShellArg('safename')).toBe('safename');
      expect(sanitizeShellArg('file123')).toBe('file123');
      expect(sanitizeShellArg('name_with_underscore')).toBe('name_with_underscore');
    });

    it('should reject command substitution', () => {
      expect(() => sanitizeShellArg('$(whoami)')).toThrow(
        'Command substitution not allowed'
      );
      expect(() => sanitizeShellArg('`whoami`')).toThrow(
        'Command substitution not allowed'
      );
    });

    it('should reject dangerous characters', () => {
      expect(() => sanitizeShellArg('name; rm -rf /')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name & ls')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name | cat')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name < file')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name > file')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name $VAR')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name (test)')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name {test}')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name [test]')).toThrow('dangerous character');
      expect(() => sanitizeShellArg("name 'quoted'")).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name "quoted"')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name\nwith\nnewlines')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name\twith\ttabs')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name*wildcard')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name?wildcard')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name with spaces')).toThrow('dangerous character');
      expect(() => sanitizeShellArg('name\\escaped')).toThrow('dangerous character');
    });

    it('should reject empty or non-string inputs', () => {
      expect(() => sanitizeShellArg('')).toThrow('must be non-empty string');
      expect(() => sanitizeShellArg(null as any)).toThrow('must be non-empty string');
      expect(() => sanitizeShellArg(undefined as any)).toThrow('must be non-empty string');
    });
  });

  describe('validateIdentifier', () => {
    it('should accept valid identifiers', () => {
      expect(validateIdentifier('my_table')).toBe(true);
      expect(validateIdentifier('schema_name')).toBe(true);
      expect(validateIdentifier('_underscore')).toBe(true);
      expect(validateIdentifier('Table123')).toBe(true);
    });

    it('should reject invalid identifiers', () => {
      expect(validateIdentifier('123table')).toBe(false); // Starts with number
      expect(validateIdentifier('table-name')).toBe(false); // Contains dash
      expect(validateIdentifier('table.name')).toBe(false); // Contains dot
      expect(validateIdentifier('a'.repeat(64))).toBe(false); // Too long
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateIdentifier('')).toBe(false);
      expect(validateIdentifier(null as any)).toBe(false);
      expect(validateIdentifier(123 as any)).toBe(false);
    });
  });

  describe('validateNumericRange', () => {
    it('should accept values within range', () => {
      expect(validateNumericRange(5, 0, 10, 'port')).toBe(true);
      expect(validateNumericRange(0, 0, 100, 'percentage')).toBe(true);
      expect(validateNumericRange(100, 0, 100, 'max')).toBe(true);
      expect(validateNumericRange(-5, -10, 10, 'offset')).toBe(true);
    });

    it('should reject values outside range', () => {
      expect(validateNumericRange(-1, 0, 10, 'port')).toBe(false);
      expect(validateNumericRange(11, 0, 10, 'port')).toBe(false);
      expect(validateNumericRange(101, 0, 100, 'percentage')).toBe(false);
    });

    it('should reject non-numeric values', () => {
      expect(validateNumericRange(NaN, 0, 10, 'test')).toBe(false);
      expect(validateNumericRange('5' as any, 0, 10, 'test')).toBe(false);
      expect(validateNumericRange(null as any, 0, 10, 'test')).toBe(false);
      expect(validateNumericRange(undefined as any, 0, 10, 'test')).toBe(false);
    });
  });

  describe('validateHost', () => {
    it('should accept valid IPv4 addresses', () => {
      expect(validateHost('192.168.1.1')).toBe(true);
      expect(validateHost('10.0.0.1')).toBe(true);
      expect(validateHost('172.16.0.1')).toBe(true);
      expect(validateHost('127.0.0.1')).toBe(true);
      expect(validateHost('0.0.0.0')).toBe(true);
      expect(validateHost('255.255.255.255')).toBe(true);
    });

    it('should reject invalid IPv4 addresses', () => {
      expect(validateHost('256.1.1.1')).toBe(false); // Out of range
      expect(validateHost('1.1.1.256')).toBe(false); // Out of range
      expect(validateHost('1.1.1')).toBe(false); // Incomplete
      expect(validateHost('1.1.1.1.1')).toBe(false); // Too many octets
    });

    it('should accept valid IPv6 addresses', () => {
      expect(validateHost('::1')).toBe(true); // Loopback
      expect(validateHost('::')).toBe(true); // All zeros
      expect(validateHost('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe(true);
    });

    it('should accept valid hostnames', () => {
      expect(validateHost('example.com')).toBe(true);
      expect(validateHost('subdomain.example.com')).toBe(true);
      expect(validateHost('my-server.local')).toBe(true);
      expect(validateHost('api-v2.service.internal')).toBe(true);
      expect(validateHost('localhost')).toBe(true);
    });

    it('should reject all-numeric hostnames that are not valid IPs', () => {
      expect(validateHost('1.2.3')).toBe(false); // All numeric but not valid IP
      expect(validateHost('999.999.999.999')).toBe(false); // Invalid IP
    });

    it('should reject invalid hostnames', () => {
      expect(validateHost('-invalid.com')).toBe(false); // Starts with dash
      expect(validateHost('invalid-.com')).toBe(false); // Ends with dash
      expect(validateHost('invalid..com')).toBe(false); // Double dot
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateHost('')).toBe(false);
      expect(validateHost(null as any)).toBe(false);
      expect(validateHost(123 as any)).toBe(false);
    });
  });

  describe('validateContainerName', () => {
    it('should accept valid container names', () => {
      expect(validateContainerName('my-container')).toBe(true);
      expect(validateContainerName('app_name')).toBe(true);
      expect(validateContainerName('service.v2')).toBe(true);
      expect(validateContainerName('container123')).toBe(true);
    });

    it('should reject invalid container names', () => {
      expect(validateContainerName('-invalid')).toBe(false); // Starts with dash
      expect(validateContainerName('_invalid')).toBe(false); // Starts with underscore
      expect(validateContainerName('.invalid')).toBe(false); // Starts with dot
      expect(validateContainerName('invalid!')).toBe(false); // Contains exclamation
      expect(validateContainerName('a'.repeat(129))).toBe(false); // Too long (>128 chars)
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateContainerName('')).toBe(false);
      expect(validateContainerName(null as any)).toBe(false);
      expect(validateContainerName(123 as any)).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@example.com')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
      expect(validateEmail('user123@sub.example.com')).toBe(true);
      expect(validateEmail('user@example.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid')).toBe(false); // No @
      expect(validateEmail('@example.com')).toBe(false); // No local part
      expect(validateEmail('user@')).toBe(false); // No domain
      expect(validateEmail('user@.com')).toBe(false); // Invalid domain
      expect(validateEmail('user..name@example.com')).toBe(false); // Double dot
      expect(validateEmail('user@example')).toBe(false); // No TLD (actually valid per RFC, but this regex rejects it)
    });

    it('should reject empty or non-string inputs', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail(null as any)).toBe(false);
      expect(validateEmail(123 as any)).toBe(false);
    });
  });

  describe('ALLOWED_LOG_DIRS', () => {
    it('should be a readonly array', () => {
      expect(Array.isArray(ALLOWED_LOG_DIRS)).toBe(true);
      expect(ALLOWED_LOG_DIRS.length).toBeGreaterThan(0);
    });

    it('should include common log directories', () => {
      expect(ALLOWED_LOG_DIRS).toContain('/var/log/nginx');
      expect(ALLOWED_LOG_DIRS).toContain('/var/log/postgresql');
      expect(ALLOWED_LOG_DIRS).toContain('/var/log');
    });
  });

  describe('ALLOWED_BACKUP_DIRS', () => {
    it('should be a readonly array', () => {
      expect(Array.isArray(ALLOWED_BACKUP_DIRS)).toBe(true);
      expect(ALLOWED_BACKUP_DIRS.length).toBeGreaterThan(0);
    });

    it('should include common backup directories', () => {
      expect(ALLOWED_BACKUP_DIRS).toContain('/var/backups');
      expect(ALLOWED_BACKUP_DIRS).toContain('/opt/backups');
    });
  });
});
