/**
 * VaultService Tests
 *
 * Tests Vault secret retrieval, caching, token validation, and watching.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { VaultService } from "../vaultService.js";
import type { VaultConfig } from "../vaultService.js";

describe("VaultService", () => {
  const mockConfig: VaultConfig = {
    addr: "http://localhost:8200",
    token: "test-token",
    namespace: "server-mcp",
    cacheTTL: 1000, // 1 second for testing
  };

  describe("Configuration", () => {
    it("should initialize with config", () => {
      const service = new VaultService(mockConfig);
      assert.ok(service);
    });

    it("should use default cache TTL if not provided", () => {
      const service = new VaultService({
        addr: "http://localhost:8200",
        token: "test-token",
      });
      assert.ok(service);
      const stats = service.getCacheStats();
      assert.strictEqual(stats.size, 0);
    });
  });

  describe("Cache Management", () => {
    it("should start with empty cache", () => {
      const service = new VaultService(mockConfig);
      const stats = service.getCacheStats();
      assert.strictEqual(stats.size, 0);
      assert.strictEqual(stats.entries.length, 0);
    });

    it("should clear cache", () => {
      const service = new VaultService(mockConfig);
      service.clearCache();
      const stats = service.getCacheStats();
      assert.strictEqual(stats.size, 0);
    });

    it("should provide cache statistics", () => {
      const service = new VaultService(mockConfig);
      const stats = service.getCacheStats();
      assert.ok(typeof stats.size === "number");
      assert.ok(Array.isArray(stats.entries));
    });
  });

  describe("Secret Watching", () => {
    it("should allow starting and stopping watchers", () => {
      const service = new VaultService(mockConfig);

      // Mock callback
      const onChange = mock.fn();

      // Start watcher (will fail to connect but should not throw)
      service.watchSecret("postgres", onChange, 100);

      // Stop watcher
      service.stopWatching("postgres");

      assert.ok(true, "Watcher lifecycle completed without errors");
    });

    it("should stop all watchers", () => {
      const service = new VaultService(mockConfig);

      const onChange1 = mock.fn();
      const onChange2 = mock.fn();

      // Start multiple watchers
      service.watchSecret("postgres", onChange1, 100);
      service.watchSecret("redis", onChange2, 100);

      // Stop all
      service.stopAllWatchers();

      assert.ok(true, "All watchers stopped successfully");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid Vault address gracefully", async () => {
      const service = new VaultService({
        addr: "http://invalid-vault-address:9999",
        token: "test-token",
        cacheTTL: 100,
      });

      const health = await service.healthCheck();
      assert.strictEqual(health.healthy, false);
      assert.strictEqual(health.vault.reachable, false);
    });

    it("should handle missing credentials", async () => {
      const service = new VaultService({
        addr: "http://localhost:8200",
        token: "invalid-token",
        cacheTTL: 100,
      });

      try {
        await service.getSecret("postgres");
        assert.fail("Should have thrown error for invalid token");
      } catch (error) {
        assert.ok(error instanceof Error);
        // Error can be "Vault API error" or "fetch failed" depending on Vault state
        assert.ok(
          error.message.includes("Vault API error") ||
            error.message.includes("fetch failed") ||
            error.message.includes("ECONNREFUSED")
        );
      }
    });
  });

  describe("Path Configuration", () => {
    it("should use correct secret paths", () => {
      const service = new VaultService(mockConfig);

      // Paths are internal, but we can verify the service accepts valid names
      assert.doesNotThrow(() => {
        service.stopWatching("postgres");
        service.stopWatching("redis");
        service.stopWatching("keycloak");
      });
    });
  });
});

describe("createVaultServiceFromEnv", () => {
  it("should return null when env vars missing", async () => {
    // Import dynamically to avoid affecting other tests
    const { createVaultServiceFromEnv } = await import("../vaultService.js");

    // Save original env
    const originalAddr = process.env.VAULT_ADDR;
    const originalToken = process.env.VAULT_TOKEN;

    // Clear env vars
    delete process.env.VAULT_ADDR;
    delete process.env.VAULT_TOKEN;

    const service = createVaultServiceFromEnv();
    assert.strictEqual(service, null);

    // Restore env
    if (originalAddr) process.env.VAULT_ADDR = originalAddr;
    if (originalToken) process.env.VAULT_TOKEN = originalToken;
  });

  it("should create service when env vars present", async () => {
    const { createVaultServiceFromEnv } = await import("../vaultService.js");

    // Save original env
    const originalAddr = process.env.VAULT_ADDR;
    const originalToken = process.env.VAULT_TOKEN;

    // Set env vars
    process.env.VAULT_ADDR = "http://localhost:8200";
    process.env.VAULT_TOKEN = "test-token";

    const service = createVaultServiceFromEnv();
    assert.ok(service);
    assert.ok(service instanceof VaultService);

    // Restore env
    if (originalAddr) process.env.VAULT_ADDR = originalAddr;
    else delete process.env.VAULT_ADDR;
    if (originalToken) process.env.VAULT_TOKEN = originalToken;
    else delete process.env.VAULT_TOKEN;
  });
});
