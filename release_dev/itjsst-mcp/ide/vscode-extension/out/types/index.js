"use strict";
/**
 * Core type definitions for Structural Thinking Manager extension
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialError = exports.MCPConnectionError = exports.DatabaseConnectionError = void 0;
/**
 * Error types
 */
class DatabaseConnectionError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'DatabaseConnectionError';
    }
}
exports.DatabaseConnectionError = DatabaseConnectionError;
class MCPConnectionError extends Error {
    serverName;
    cause;
    constructor(message, serverName, cause) {
        super(message);
        this.serverName = serverName;
        this.cause = cause;
        this.name = 'MCPConnectionError';
    }
}
exports.MCPConnectionError = MCPConnectionError;
class CredentialError extends Error {
    credentialKey;
    constructor(message, credentialKey) {
        super(message);
        this.credentialKey = credentialKey;
        this.name = 'CredentialError';
    }
}
exports.CredentialError = CredentialError;
//# sourceMappingURL=index.js.map