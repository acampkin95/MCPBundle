/**
 * Server-Sent Events (SSE) Client for Real-Time Updates
 *
 * Provides real-time streaming of panel data updates from the Cloudflare MCP server
 */

'use client';

export type SSEEventType = 'heartbeat' | 'agent-status' | 'log-entry' | 'metric-update' | 'error';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
}

export type SSEEventHandler<T = unknown> = (event: SSEEvent<T>) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private readonly handlers = new Map<SSEEventType, Set<SSEEventHandler>>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelay = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly url: string) {}

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      return;
    }

    try {
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => {
        console.log('[SSEClient] Connected to', this.url);
        this.reconnectAttempts = 0;
      };

      this.eventSource.onerror = (error) => {
        console.error('[SSEClient] Connection error', error);
        this.handleDisconnect();
      };

      // Register message handlers for each event type
      const eventTypes: SSEEventType[] = [
        'heartbeat',
        'agent-status',
        'log-entry',
        'metric-update',
        'error',
      ];

      eventTypes.forEach((type) => {
        this.eventSource?.addEventListener(type, (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            this.emit(type, {
              type,
              data,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error(`[SSEClient] Failed to parse ${type} event`, error);
          }
        });
      });
    } catch (error) {
      console.error('[SSEClient] Failed to create EventSource', error);
      this.handleDisconnect();
    }
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      console.log('[SSEClient] Disconnected');
    }
  }

  /**
   * Subscribe to specific event type
   */
  on<T = unknown>(type: SSEEventType, handler: SSEEventHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)?.add(handler as SSEEventHandler);
  }

  /**
   * Unsubscribe from specific event type
   */
  off<T = unknown>(type: SSEEventType, handler: SSEEventHandler<T>): void {
    this.handlers.get(type)?.delete(handler as SSEEventHandler);
  }

  /**
   * Emit event to all registered handlers
   */
  private emit<T = unknown>(type: SSEEventType, event: SSEEvent<T>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[SSEClient] Handler error for ${type}`, error);
        }
      });
    }
  }

  /**
   * Handle disconnection with exponential backoff reconnection
   */
  private handleDisconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSEClient] Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`[SSEClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}
