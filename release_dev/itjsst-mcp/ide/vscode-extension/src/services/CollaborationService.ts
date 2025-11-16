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

export class CollaborationService {
  private readonly config: CollaborationConfig;
  private readonly outputChannel: vscode.OutputChannel;
  private connected = false;
  private activeUsers: User[] = [];

  constructor(
    config: Partial<CollaborationConfig>,
    outputChannel: vscode.OutputChannel
  ) {
    this.config = {
      enabled: config.enabled ?? false,
      wsUrl: config.wsUrl ?? 'ws://46.250.243.123:3000',
      reconnectInterval: config.reconnectInterval ?? 5000,
    };
    this.outputChannel = outputChannel;

    if (this.config.enabled) {
      this.outputChannel.appendLine(
        '[CollaborationService] Collaboration features are enabled but not yet implemented'
      );
    }
  }

  /**
   * Connect to collaboration server (STUB)
   */
  public async connect(sessionId: string): Promise<void> {
    if (!this.config.enabled) {
      this.outputChannel.appendLine(
        '[CollaborationService] Collaboration disabled in config'
      );
      return;
    }

    this.outputChannel.appendLine(
      `[CollaborationService] STUB: Would connect to ${this.config.wsUrl} for session ${sessionId}`
    );

    // Future implementation:
    // - Establish WebSocket connection
    // - Authenticate with JWT
    // - Subscribe to session events
    // - Handle reconnection logic

    this.connected = false; // Not actually connected
  }

  /**
   * Disconnect from collaboration server (STUB)
   */
  public async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.outputChannel.appendLine('[CollaborationService] STUB: Would disconnect');

    // Future implementation:
    // - Clean disconnect from WebSocket
    // - Clear presence
    // - Unsubscribe from events

    this.connected = false;
    this.activeUsers = [];
  }

  /**
   * Get active users in current session (STUB)
   */
  public getActiveUsers(): readonly User[] {
    // Future implementation would return real users from WebSocket
    return this.activeUsers;
  }

  /**
   * Broadcast thought update to other users (STUB)
   */
  public async broadcastThoughtUpdate(
    sessionId: string,
    thoughtId: string,
    _content: string
  ): Promise<void> {
    this.outputChannel.appendLine(
      `[CollaborationService] STUB: Would broadcast update for thought ${thoughtId} in session ${sessionId}`
    );

    // Future implementation:
    // - Send update via WebSocket
    // - Include user identification
    // - Handle delivery confirmation
  }

  /**
   * Handle incoming thought update from other user (STUB)
   */
  public onThoughtUpdate(
    _callback: (update: {
      sessionId: string;
      thoughtId: string;
      content: string;
      userId: string;
    }) => void
  ): void {
    this.outputChannel.appendLine(
      '[CollaborationService] STUB: Registered thought update handler'
    );

    // Future implementation:
    // - Listen to WebSocket events
    // - Invoke callback when updates received
    // - Handle update conflicts
  }

  /**
   * Handle presence updates (STUB)
   */
  public onPresenceUpdate(_callback: (update: PresenceUpdate) => void): void {
    this.outputChannel.appendLine(
      '[CollaborationService] STUB: Registered presence update handler'
    );

    // Future implementation:
    // - Listen to presence events
    // - Update active users list
    // - Invoke callback with user changes
  }

  /**
   * Check connection status
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get collaboration configuration
   */
  public getConfig(): CollaborationConfig {
    return this.config;
  }

  /**
   * Show collaboration status in status bar
   */
  public createStatusBarItem(): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    if (this.config.enabled && this.connected) {
      item.text = `$(radio-tower) ${this.activeUsers.length} users`;
      item.tooltip = `Connected to collaboration server\n${this.activeUsers.map((u) => u.username).join(', ')}`;
    } else if (this.config.enabled) {
      item.text = '$(radio-tower) Offline';
      item.tooltip = 'Collaboration enabled but not connected';
    } else {
      item.text = '$(radio-tower) Disabled';
      item.tooltip = 'Collaboration features disabled';
    }

    return item;
  }
}

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
