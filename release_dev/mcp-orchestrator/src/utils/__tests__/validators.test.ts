import { describe, it } from "node:test";
import assert from "node:assert";
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
} from "../validators.js";

describe("validators", () => {
  describe("validateDatabaseName", () => {
    it("should accept valid database names", () => {
      assert.strictEqual(validateDatabaseName("mydb"), true);
      assert.strictEqual(validateDatabaseName("my_database_123"), true);
      assert.strictEqual(validateDatabaseName("_private"), true);
    });

    it("should reject invalid database names", () => {
      assert.strictEqual(validateDatabaseName(""), false);
      assert.strictEqual(validateDatabaseName("123db"), false); // starts with number
      assert.strictEqual(validateDatabaseName("my-db"), false); // hyphen not allowed
      assert.strictEqual(validateDatabaseName("my.db"), false); // dot not allowed
      assert.strictEqual(validateDatabaseName("DROP"), false); // SQL keyword
      assert.strictEqual(validateDatabaseName("delete"), false); // SQL keyword
    });

    it("should reject names longer than 63 characters", () => {
      const longName = "a".repeat(64);
      assert.strictEqual(validateDatabaseName(longName), false);
    });
  });

  describe("validateServiceName", () => {
    it("should accept allowed service names", () => {
      assert.strictEqual(validateServiceName("postgresql"), true);
      assert.strictEqual(validateServiceName("nginx"), true);
      assert.strictEqual(validateServiceName("redis"), true);
      assert.strictEqual(validateServiceName("pm2"), true);
    });

    it("should reject disallowed service names", () => {
      assert.strictEqual(validateServiceName("malicious"), false);
      assert.strictEqual(validateServiceName("../etc/passwd"), false);
      assert.strictEqual(validateServiceName(""), false);
    });
  });

  describe("validateFilePath", () => {
    it("should accept paths in allowed directories", () => {
      assert.strictEqual(
        validateFilePath("/var/log/nginx/access.log", ALLOWED_LOG_DIRS),
        true,
      );
      assert.strictEqual(
        validateFilePath("/var/log/postgresql/postgresql.log", ALLOWED_LOG_DIRS),
        true,
      );
    });

    it("should reject path traversal attempts", () => {
      assert.strictEqual(
        validateFilePath("/var/log/../etc/passwd", ALLOWED_LOG_DIRS),
        false,
      );
      assert.strictEqual(
        validateFilePath("/var/log/nginx/../../etc/shadow", ALLOWED_LOG_DIRS),
        false,
      );
      assert.strictEqual(
        validateFilePath("/var/log/nginx/%2e%2e/etc/passwd", ALLOWED_LOG_DIRS),
        false,
      );
    });

    it("should reject paths outside allowed directories", () => {
      assert.strictEqual(
        validateFilePath("/etc/passwd", ALLOWED_LOG_DIRS),
        false,
      );
      assert.strictEqual(
        validateFilePath("/tmp/malicious.log", ALLOWED_LOG_DIRS),
        false,
      );
    });

    it("should reject null byte injection", () => {
      assert.strictEqual(
        validateFilePath("/var/log/nginx/access.log\0.txt", ALLOWED_LOG_DIRS),
        false,
      );
    });
  });

  describe("sanitizeShellArg", () => {
    it("should accept safe arguments", () => {
      assert.strictEqual(sanitizeShellArg("mydb"), "mydb");
      assert.strictEqual(sanitizeShellArg("my_database"), "my_database");
      assert.strictEqual(sanitizeShellArg("123"), "123");
    });

    it("should reject dangerous characters", () => {
      assert.throws(() => sanitizeShellArg("rm -rf /"), /dangerous character/);
      assert.throws(() => sanitizeShellArg("test; rm -rf /"), /dangerous character/);
      assert.throws(() => sanitizeShellArg("$(whoami)"), /Command substitution/);
      assert.throws(() => sanitizeShellArg("`whoami`"), /Command substitution/);
      assert.throws(() => sanitizeShellArg("test | cat"), /dangerous character/);
    });
  });

  describe("validateIdentifier", () => {
    it("should accept valid identifiers", () => {
      assert.strictEqual(validateIdentifier("my_table"), true);
      assert.strictEqual(validateIdentifier("schema1"), true);
      assert.strictEqual(validateIdentifier("_private"), true);
    });

    it("should reject invalid identifiers", () => {
      assert.strictEqual(validateIdentifier("123table"), false);
      assert.strictEqual(validateIdentifier("my-table"), false);
      assert.strictEqual(validateIdentifier(""), false);
    });
  });

  describe("validateNumericRange", () => {
    it("should accept numbers within range", () => {
      assert.strictEqual(validateNumericRange(50, 0, 100, "test"), true);
      assert.strictEqual(validateNumericRange(0, 0, 100, "test"), true);
      assert.strictEqual(validateNumericRange(100, 0, 100, "test"), true);
    });

    it("should reject numbers outside range", () => {
      assert.strictEqual(validateNumericRange(-1, 0, 100, "test"), false);
      assert.strictEqual(validateNumericRange(101, 0, 100, "test"), false);
      assert.strictEqual(validateNumericRange(NaN, 0, 100, "test"), false);
    });
  });

  describe("validateHost", () => {
    it("should accept valid hostnames", () => {
      assert.strictEqual(validateHost("localhost"), true);
      assert.strictEqual(validateHost("example.com"), true);
      assert.strictEqual(validateHost("sub.example.com"), true);
      assert.strictEqual(validateHost("my-server"), true);
    });

    it("should accept valid IPv4 addresses", () => {
      assert.strictEqual(validateHost("127.0.0.1"), true);
      assert.strictEqual(validateHost("192.168.1.1"), true);
      assert.strictEqual(validateHost("10.0.0.1"), true);
    });

    it("should accept valid IPv6 addresses", () => {
      assert.strictEqual(validateHost("::1"), true);
      assert.strictEqual(validateHost("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), true);
    });

    it("should reject invalid hosts", () => {
      assert.strictEqual(validateHost(""), false);
      assert.strictEqual(validateHost("invalid_host!"), false);
      assert.strictEqual(validateHost("999.999.999.999"), false);
    });
  });

  describe("validateContainerName", () => {
    it("should accept valid container names", () => {
      assert.strictEqual(validateContainerName("my-container"), true);
      assert.strictEqual(validateContainerName("app_1"), true);
      assert.strictEqual(validateContainerName("nginx-proxy.v2"), true);
    });

    it("should reject invalid container names", () => {
      assert.strictEqual(validateContainerName(""), false);
      assert.strictEqual(validateContainerName("-invalid"), false);
      assert.strictEqual(validateContainerName("invalid!"), false);
    });
  });

  describe("validateEmail", () => {
    it("should accept valid email addresses", () => {
      assert.strictEqual(validateEmail("user@example.com"), true);
      assert.strictEqual(validateEmail("test.user+tag@domain.co.uk"), true);
    });

    it("should reject invalid email addresses", () => {
      assert.strictEqual(validateEmail(""), false);
      assert.strictEqual(validateEmail("notanemail"), false);
      assert.strictEqual(validateEmail("@example.com"), false);
      assert.strictEqual(validateEmail("user@"), false);
    });
  });
});
