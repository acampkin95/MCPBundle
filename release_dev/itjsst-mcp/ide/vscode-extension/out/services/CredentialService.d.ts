/**
 * CredentialService - Secure credential storage using VSCode SecretStorage API
 */
import * as vscode from 'vscode';
export interface StoredCredential {
    readonly value: string;
    readonly storedAt: string;
}
export declare class CredentialService {
    private readonly secretStorage;
    private readonly logger;
    constructor(context: vscode.ExtensionContext, logger: vscode.OutputChannel);
    /**
     * Get credential, prompting user if not found
     */
    getCredential(key: string, options?: {
        prompt?: string;
        password?: boolean;
        validateFn?: (value: string) => string | null;
    }): Promise<string>;
    /**
     * Get credential without prompting (returns null if not found)
     */
    getCredentialSilent(key: string): Promise<string | null>;
    /**
     * Store credential
     */
    storeCredential(key: string, value: string): Promise<void>;
    /**
     * Delete credential
     */
    deleteCredential(key: string): Promise<void>;
    /**
     * Check if credential exists
     */
    hasCredential(key: string): Promise<boolean>;
    /**
     * Clear all credentials (use with caution)
     */
    clearAllCredentials(keys: readonly string[]): Promise<void>;
    /**
     * Update existing credential
     */
    updateCredential(key: string, options?: {
        prompt?: string;
        password?: boolean;
    }): Promise<string>;
    /**
     * Get database credentials
     */
    getDatabaseCredentials(host: string): Promise<{
        username: string;
        password: string;
    }>;
    /**
     * Get SSH credentials
     */
    getSSHCredentials(host: string): Promise<{
        username: string;
        password?: string;
    }>;
}
//# sourceMappingURL=CredentialService.d.ts.map