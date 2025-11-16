/**
 * CollaborationService - Real-time multi-user collaboration (STUB)
 *
 * Future features:
 * - WebSocket connection to VMI01 for real-time updates
 * - Active users viewing same thinking session
 * - Live cursor positions (optional)
 * - Conflict resolution for concurrent edits
 * - Presence indicators
 * - Chat integration for team discussions
 *
 * Note: This is a stub implementation. Full WebSocket server required on VMI01.
 */
import * as vscode from 'vscode';
interface CollaborationConfig {
    readonly enabled: boolean;
    readonly wsUrl: string;
    readonly reconnectInterval: number;
}
interface User {
    readonly userId: string;
    readonly username: string;
    readonly color: string;
}
interface PresenceUpdate {
    readonly sessionId: string;
    readonly users: readonly User[];
    readonly timestamp: Date;
}
export declare class CollaborationService {
    private readonly config;
    private readonly outputChannel;
    private connected;
    private activeUsers;
    constructor(config: Partial<CollaborationConfig>, outputChannel: vscode.OutputChannel);
    /**
     * Connect to collaboration server (STUB)
     */
    connect(sessionId: string): Promise<void>;
    /**
     * Disconnect from collaboration server (STUB)
     */
    disconnect(): Promise<void>;
    /**
     * Get active users in current session (STUB)
     */
    getActiveUsers(): readonly User[];
    /**
     * Broadcast thought update to other users (STUB)
     */
    broadcastThoughtUpdate(sessionId: string, thoughtId: string, _content: string): Promise<void>;
    /**
     * Handle incoming thought update from other user (STUB)
     */
    onThoughtUpdate(_callback: (update: {
        sessionId: string;
        thoughtId: string;
        content: string;
        userId: string;
    }) => void): void;
    /**
     * Handle presence updates (STUB)
     */
    onPresenceUpdate(_callback: (update: PresenceUpdate) => void): void;
    /**
     * Check connection status
     */
    isConnected(): boolean;
    /**
     * Get collaboration configuration
     */
    getConfig(): CollaborationConfig;
    /**
     * Show collaboration status in status bar
     */
    createStatusBarItem(): vscode.StatusBarItem;
}
export {};
/**
 * Integration requirements for full implementation:
 *
 * 1. WebSocket Server on VMI01:
 *    - Endpoint: ws://46.250.243.123:3000
 *    - Socket.io or native WebSocket server
 *    - Authentication via JWT (from Keycloak)
 *    - Room-based architecture (one room per session)
 *
 * 2. Protocol Messages:
 *    - connect: { sessionId, token }
 *    - presence: { sessionId, users[] }
 *    - thought:update: { sessionId, thoughtId, content, userId }
 *    - thought:conflict: { sessionId, thoughtId, versions[] }
 *    - disconnect: { sessionId, userId }
 *
 * 3. Client Implementation (this file):
 *    - npm install socket.io-client
 *    - Implement connection lifecycle
 *    - Handle reconnection with exponential backoff
 *    - Implement conflict resolution strategies
 *    - Show presence indicators in UI
 *
 * 4. Conflict Resolution Strategies:
 *    - Last-write-wins (simple)
 *    - Operational Transform (OT) for real-time editing
 *    - Three-way merge with user prompts
 *    - Version locking with exclusive edit rights
 *
 * 5. UI Components:
 *    - Presence avatars in tree view
 *    - Live cursor indicators in ThoughtEditor
 *    - Conflict resolution dialog
 *    - Chat panel (optional)
 *
 * 6. Security Considerations:
 *    - Validate JWT tokens on server
 *    - Rate limiting per user
 *    - Input sanitization
 *    - Audit log of all changes
 *
 * 7. Performance Optimizations:
 *    - Debounce updates (300ms)
 *    - Batch multiple changes
 *    - Delta compression for large thoughts
 *    - Connection pooling on server
 */
//# sourceMappingURL=CollaborationService.d.ts.map