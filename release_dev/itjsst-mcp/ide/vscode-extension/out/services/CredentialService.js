"use strict";
/**
 * CredentialService - Secure credential storage using VSCode SecretStorage API
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialService = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("../types");
class CredentialService {
    secretStorage;
    logger;
    constructor(context, logger) {
        this.secretStorage = context.secrets;
        this.logger = logger;
    }
    /**
     * Get credential, prompting user if not found
     */
    async getCredential(key, options = {}) {
        try {
            // Try to retrieve existing credential
            const stored = await this.secretStorage.get(key);
            if (stored) {
                this.logger.appendLine(`[CredentialService] Retrieved credential: ${key}`);
                return stored;
            }
            // Credential not found, prompt user
            const promptText = options.prompt ??
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
                throw new types_1.CredentialError(`User cancelled credential input for: ${key}`, key);
            }
            // Store credential
            await this.secretStorage.store(key, input);
            this.logger.appendLine(`[CredentialService] Stored credential: ${key}`);
            return input;
        }
        catch (error) {
            if (error instanceof types_1.CredentialError) {
                throw error;
            }
            this.logger.appendLine(`[CredentialService] Error getting credential ${key}: ${String(error)}`);
            throw new types_1.CredentialError(`Failed to get credential: ${key}`, key);
        }
    }
    /**
     * Get credential without prompting (returns null if not found)
     */
    async getCredentialSilent(key) {
        try {
            const stored = await this.secretStorage.get(key);
            return stored ?? null;
        }
        catch (error) {
            this.logger.appendLine(`[CredentialService] Error retrieving credential ${key}: ${String(error)}`);
            return null;
        }
    }
    /**
     * Store credential
     */
    async storeCredential(key, value) {
        try {
            await this.secretStorage.store(key, value);
            this.logger.appendLine(`[CredentialService] Stored credential: ${key}`);
        }
        catch (error) {
            this.logger.appendLine(`[CredentialService] Error storing credential ${key}: ${String(error)}`);
            throw new types_1.CredentialError(`Failed to store credential: ${key}`, key);
        }
    }
    /**
     * Delete credential
     */
    async deleteCredential(key) {
        try {
            await this.secretStorage.delete(key);
            this.logger.appendLine(`[CredentialService] Deleted credential: ${key}`);
        }
        catch (error) {
            this.logger.appendLine(`[CredentialService] Error deleting credential ${key}: ${String(error)}`);
            throw new types_1.CredentialError(`Failed to delete credential: ${key}`, key);
        }
    }
    /**
     * Check if credential exists
     */
    async hasCredential(key) {
        const value = await this.getCredentialSilent(key);
        return value !== null;
    }
    /**
     * Clear all credentials (use with caution)
     */
    async clearAllCredentials(keys) {
        const confirmed = await vscode.window.showWarningMessage(`This will delete ${keys.length} stored credential(s). This action cannot be undone.`, { modal: true }, 'Delete All');
        if (confirmed !== 'Delete All') {
            return;
        }
        for (const key of keys) {
            try {
                await this.deleteCredential(key);
            }
            catch {
                // Continue deleting other credentials even if one fails
            }
        }
        void vscode.window.showInformationMessage('All credentials cleared');
    }
    /**
     * Update existing credential
     */
    async updateCredential(key, options = {}) {
        const promptText = options.prompt ??
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
                throw new types_1.CredentialError(`No existing credential found for: ${key}`, key);
            }
            return current;
        }
        await this.storeCredential(key, input);
        return input;
    }
    /**
     * Get database credentials
     */
    async getDatabaseCredentials(host) {
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
    async getSSHCredentials(host) {
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
exports.CredentialService = CredentialService;
//# sourceMappingURL=CredentialService.js.map