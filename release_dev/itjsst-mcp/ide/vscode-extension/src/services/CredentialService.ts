/**
 * CredentialService - Secure credential storage using VSCode SecretStorage API
 */

import * as vscode from 'vscode';
import { CredentialError } from '../types';

export interface StoredCredential {
  readonly value: string;
  readonly storedAt: string;
}

export class CredentialService {
  private readonly secretStorage: vscode.SecretStorage;
  private readonly logger: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext, logger: vscode.OutputChannel) {
    this.secretStorage = context.secrets;
    this.logger = logger;
  }

  /**
   * Get credential, prompting user if not found
   */
  public async getCredential(
    key: string,
    options: {
      prompt?: string;
      password?: boolean;
      validateFn?: (value: string) => string | null; // Returns error message if invalid
    } = {}
  ): Promise<string> {
    try {
      // Try to retrieve existing credential
      const stored = await this.secretStorage.get(key);

      if (stored) {
        this.logger.appendLine(`[CredentialService] Retrieved credential: ${key}`);
        return stored;
      }

      // Credential not found, prompt user
      const promptText =
        options.prompt ??
        `Enter ${key.replace(/\./g, ' ')} (will be stored securely)`;

      const input = await vscode.window.showInputBox({
        prompt: promptText,
        password: options.password ?? true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Value cannot be empty';
          }

          if (options.validateFn) {
            return options.validateFn(value);
          }

          return null;
        },
      });

      if (!input) {
        throw new CredentialError(`User cancelled credential input for: ${key}`, key);
      }

      // Store credential
      await this.secretStorage.store(key, input);
      this.logger.appendLine(`[CredentialService] Stored credential: ${key}`);

      return input;
    } catch (error) {
      if (error instanceof CredentialError) {
        throw error;
      }

      this.logger.appendLine(
        `[CredentialService] Error getting credential ${key}: ${String(error)}`
      );
      throw new CredentialError(
        `Failed to get credential: ${key}`,
        key
      );
    }
  }

  /**
   * Get credential without prompting (returns null if not found)
   */
  public async getCredentialSilent(key: string): Promise<string | null> {
    try {
      const stored = await this.secretStorage.get(key);
      return stored ?? null;
    } catch (error) {
      this.logger.appendLine(
        `[CredentialService] Error retrieving credential ${key}: ${String(error)}`
      );
      return null;
    }
  }

  /**
   * Store credential
   */
  public async storeCredential(key: string, value: string): Promise<void> {
    try {
      await this.secretStorage.store(key, value);
      this.logger.appendLine(`[CredentialService] Stored credential: ${key}`);
    } catch (error) {
      this.logger.appendLine(
        `[CredentialService] Error storing credential ${key}: ${String(error)}`
      );
      throw new CredentialError(
        `Failed to store credential: ${key}`,
        key
      );
    }
  }

  /**
   * Delete credential
   */
  public async deleteCredential(key: string): Promise<void> {
    try {
      await this.secretStorage.delete(key);
      this.logger.appendLine(`[CredentialService] Deleted credential: ${key}`);
    } catch (error) {
      this.logger.appendLine(
        `[CredentialService] Error deleting credential ${key}: ${String(error)}`
      );
      throw new CredentialError(
        `Failed to delete credential: ${key}`,
        key
      );
    }
  }

  /**
   * Check if credential exists
   */
  public async hasCredential(key: string): Promise<boolean> {
    const value = await this.getCredentialSilent(key);
    return value !== null;
  }

  /**
   * Clear all credentials (use with caution)
   */
  public async clearAllCredentials(
    keys: readonly string[]
  ): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
      `This will delete ${keys.length} stored credential(s). This action cannot be undone.`,
      { modal: true },
      'Delete All'
    );

    if (confirmed !== 'Delete All') {
      return;
    }

    for (const key of keys) {
      try {
        await this.deleteCredential(key);
      } catch {
        // Continue deleting other credentials even if one fails
      }
    }

    void vscode.window.showInformationMessage('All credentials cleared');
  }

  /**
   * Update existing credential
   */
  public async updateCredential(
    key: string,
    options: {
      prompt?: string;
      password?: boolean;
    } = {}
  ): Promise<string> {
    const promptText =
      options.prompt ??
      `Update ${key.replace(/\./g, ' ')} (leave blank to keep current)`;

    const input = await vscode.window.showInputBox({
      prompt: promptText,
      password: options.password ?? true,
      ignoreFocusOut: true,
    });

    if (!input || input.trim().length === 0) {
      // User wants to keep current value
      const current = await this.getCredentialSilent(key);
      if (!current) {
        throw new CredentialError(`No existing credential found for: ${key}`, key);
      }
      return current;
    }

    await this.storeCredential(key, input);
    return input;
  }

  /**
   * Get database credentials
   */
  public async getDatabaseCredentials(host: string): Promise<{
    username: string;
    password: string;
  }> {
    const username = await this.getCredential(`db.${host}.username`, {
      prompt: `PostgreSQL username for ${host}`,
      password: false,
    });

    const password = await this.getCredential(`db.${host}.password`, {
      prompt: `PostgreSQL password for ${host}`,
      password: true,
    });

    return { username, password };
  }

  /**
   * Get SSH credentials
   */
  public async getSSHCredentials(host: string): Promise<{
    username: string;
    password?: string;
  }> {
    const username = await this.getCredential(`ssh.${host}.username`, {
      prompt: `SSH username for ${host}`,
      password: false,
    });

    // SSH password is optional (can use key-based auth)
    const password = await this.getCredentialSilent(`ssh.${host}.password`);

    return {
      username,
      password: password ?? undefined,
    };
  }
}
