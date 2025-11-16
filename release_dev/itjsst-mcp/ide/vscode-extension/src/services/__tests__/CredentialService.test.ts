/**
 * Unit tests for CredentialService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CredentialService } from '../CredentialService';
import * as vscode from 'vscode';

describe('CredentialService', () => {
  let service: CredentialService;
  let mockContext: vscode.ExtensionContext;
  let mockLogger: vscode.OutputChannel;
  let mockSecrets: {
    get: ReturnType<typeof vi.fn>;
    store: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Create mock secrets storage
    mockSecrets = {
      get: vi.fn(),
      store: vi.fn(),
      delete: vi.fn(),
    };

    // Create mock context
    mockContext = {
      secrets: mockSecrets as unknown as vscode.SecretStorage,
      subscriptions: [],
      globalState: {} as vscode.Memento,
      workspaceState: {} as vscode.Memento,
      extensionPath: '/mock/path',
      storagePath: '/mock/storage',
      globalStoragePath: '/mock/global',
      logPath: '/mock/log',
    } as vscode.ExtensionContext;

    // Create mock logger
    mockLogger = {
      appendLine: vi.fn(),
      append: vi.fn(),
      clear: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    service = new CredentialService(mockContext, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCredential', () => {
    it('should retrieve existing credential', async () => {
      mockSecrets.get.mockResolvedValue('test-password');

      const result = await service.getCredential('db.test.password');

      expect(result).toBe('test-password');
      expect(mockSecrets.get).toHaveBeenCalledWith('db.test.password');
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        '[CredentialService] Retrieved credential: db.test.password'
      );
    });

    it('should prompt user if credential not found', async () => {
      mockSecrets.get.mockResolvedValue(undefined);
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('new-password');

      const result = await service.getCredential('db.test.password', {
        prompt: 'Enter database password',
        password: true,
      });

      expect(result).toBe('new-password');
      expect(vscode.window.showInputBox).toHaveBeenCalled();
      expect(mockSecrets.store).toHaveBeenCalledWith(
        'db.test.password',
        'new-password'
      );
    });

    it('should validate user input', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      const validateFn = vi.fn((value: string) => {
        if (value.length < 8) {
          return 'Password must be at least 8 characters';
        }
        return null;
      });

      vi.mocked(vscode.window.showInputBox).mockImplementation(
        async (options) => {
          // Simulate validation
          const result = options?.validateInput?.('short');
          expect(result).toBe('Password must be at least 8 characters');
          return 'validpassword123';
        }
      );

      const result = await service.getCredential('db.test.password', {
        validateFn,
      });

      expect(result).toBe('validpassword123');
    });

    it('should throw error if user cancels input', async () => {
      mockSecrets.get.mockResolvedValue(undefined);
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

      await expect(service.getCredential('db.test.password')).rejects.toThrow(
        'User cancelled credential input for: db.test.password'
      );
    });

    it('should handle empty input validation', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      vi.mocked(vscode.window.showInputBox).mockImplementation(
        async (options) => {
          // Simulate empty input validation
          const result = options?.validateInput?.('');
          expect(result).toBe('Value cannot be empty');
          return 'valid-input';
        }
      );

      await service.getCredential('test.key');
      expect(vscode.window.showInputBox).toHaveBeenCalled();
    });
  });

  describe('getCredentialSilent', () => {
    it('should return credential if exists', async () => {
      mockSecrets.get.mockResolvedValue('test-value');

      const result = await service.getCredentialSilent('test.key');

      expect(result).toBe('test-value');
      expect(mockSecrets.get).toHaveBeenCalledWith('test.key');
    });

    it('should return null if credential does not exist', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      const result = await service.getCredentialSilent('test.key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockSecrets.get.mockRejectedValue(new Error('Storage error'));

      const result = await service.getCredentialSilent('test.key');

      expect(result).toBeNull();
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Error retrieving credential')
      );
    });
  });

  describe('storeCredential', () => {
    it('should store credential successfully', async () => {
      mockSecrets.store.mockResolvedValue(undefined);

      await service.storeCredential('test.key', 'test-value');

      expect(mockSecrets.store).toHaveBeenCalledWith('test.key', 'test-value');
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        '[CredentialService] Stored credential: test.key'
      );
    });

    it('should throw error on storage failure', async () => {
      mockSecrets.store.mockRejectedValue(new Error('Storage error'));

      await expect(
        service.storeCredential('test.key', 'test-value')
      ).rejects.toThrow('Failed to store credential: test.key');
    });
  });

  describe('deleteCredential', () => {
    it('should delete credential successfully', async () => {
      mockSecrets.delete.mockResolvedValue(undefined);

      await service.deleteCredential('test.key');

      expect(mockSecrets.delete).toHaveBeenCalledWith('test.key');
      expect(mockLogger.appendLine).toHaveBeenCalledWith(
        '[CredentialService] Deleted credential: test.key'
      );
    });

    it('should throw error on deletion failure', async () => {
      mockSecrets.delete.mockRejectedValue(new Error('Deletion error'));

      await expect(service.deleteCredential('test.key')).rejects.toThrow(
        'Failed to delete credential: test.key'
      );
    });
  });

  describe('hasCredential', () => {
    it('should return true if credential exists', async () => {
      mockSecrets.get.mockResolvedValue('test-value');

      const result = await service.hasCredential('test.key');

      expect(result).toBe(true);
    });

    it('should return false if credential does not exist', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      const result = await service.hasCredential('test.key');

      expect(result).toBe(false);
    });
  });

  describe('clearAllCredentials', () => {
    it('should clear all credentials when confirmed', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        'Delete All' as any
      );
      mockSecrets.delete.mockResolvedValue(undefined);

      const keys = ['key1', 'key2', 'key3'];
      await service.clearAllCredentials(keys);

      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('3 stored credential(s)'),
        { modal: true },
        'Delete All'
      );
      expect(mockSecrets.delete).toHaveBeenCalledTimes(3);
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        'All credentials cleared'
      );
    });

    it('should not clear credentials when cancelled', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        undefined
      );

      const keys = ['key1', 'key2'];
      await service.clearAllCredentials(keys);

      expect(mockSecrets.delete).not.toHaveBeenCalled();
    });

    it('should continue deleting even if one fails', async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        'Delete All' as any
      );
      mockSecrets.delete
        .mockRejectedValueOnce(new Error('Delete error'))
        .mockResolvedValueOnce(undefined);

      const keys = ['key1', 'key2'];
      await service.clearAllCredentials(keys);

      expect(mockSecrets.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateCredential', () => {
    it('should update credential with new value', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('new-value');
      mockSecrets.store.mockResolvedValue(undefined);

      const result = await service.updateCredential('test.key');

      expect(result).toBe('new-value');
      expect(mockSecrets.store).toHaveBeenCalledWith('test.key', 'new-value');
    });

    it('should keep existing value if input is empty', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('');
      mockSecrets.get.mockResolvedValue('existing-value');

      const result = await service.updateCredential('test.key');

      expect(result).toBe('existing-value');
      expect(mockSecrets.store).not.toHaveBeenCalled();
    });

    it('should throw error if no existing credential and input empty', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('');
      mockSecrets.get.mockResolvedValue(undefined);

      await expect(service.updateCredential('test.key')).rejects.toThrow(
        'No existing credential found for: test.key'
      );
    });
  });

  describe('getDatabaseCredentials', () => {
    it('should retrieve both username and password', async () => {
      mockSecrets.get
        .mockResolvedValueOnce(undefined) // No existing username
        .mockResolvedValueOnce(undefined); // No existing password

      vi.mocked(vscode.window.showInputBox)
        .mockResolvedValueOnce('dbuser')
        .mockResolvedValueOnce('dbpass');

      const result = await service.getDatabaseCredentials('46.250.243.123');

      expect(result).toEqual({
        username: 'dbuser',
        password: 'dbpass',
      });
      expect(mockSecrets.store).toHaveBeenCalledWith(
        'db.46.250.243.123.username',
        'dbuser'
      );
      expect(mockSecrets.store).toHaveBeenCalledWith(
        'db.46.250.243.123.password',
        'dbpass'
      );
    });
  });

  describe('getSSHCredentials', () => {
    it('should retrieve username and optional password', async () => {
      mockSecrets.get
        .mockResolvedValueOnce(undefined) // No existing username
        .mockResolvedValueOnce('sshpass'); // Existing password

      vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('sshuser');

      const result = await service.getSSHCredentials('46.250.243.123');

      expect(result).toEqual({
        username: 'sshuser',
        password: 'sshpass',
      });
    });

    it('should return undefined password if not stored', async () => {
      mockSecrets.get
        .mockResolvedValueOnce(undefined) // No existing username
        .mockResolvedValueOnce(undefined); // No existing password

      vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('sshuser');

      const result = await service.getSSHCredentials('46.250.243.123');

      expect(result).toEqual({
        username: 'sshuser',
        password: undefined,
      });
    });
  });
});
