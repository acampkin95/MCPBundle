/**
 * Event System v2.0
 *
 * Centralized event management for orchestrator:
 * - Type-safe event emission and handling
 * - Event history tracking
 * - Event filtering and search
 * - Event replay capability
 */

import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import type { EventConfig } from '../config/orchestrator.config.js';
import type { AgentMetadata, AgentStatus } from './agentRegistry.js';
import type { DeadLetterItem } from './deadLetterQueue.js';
import type { QueueItem } from './priorityQueue.js';

/**
 * All orchestrator event types
 */
export type OrchestratorEventType =
  | 'agent:registered'
  | 'agent:unregistered'
  | 'agent:status_changed'
  | 'agent:heartbeat_failed'
  | 'agent:degraded'
  | 'agent:recovered'
  | 'command:queued'
  | 'command:executing'
  | 'command:completed'
  | 'command:failed'
  | 'command:retry'
  | 'command:dead_letter'
  | 'queue:sla_breach'
  | 'queue:sla_warning'
  | 'queue:size_limit'
  | 'system:started'
  | 'system:stopped'
  | 'system:error';

/**
 * Event data structures
 */
export interface OrchestratorEvent {
  readonly id: string;
  readonly type: OrchestratorEventType;
  readonly timestamp: Date;
  readonly data: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentRegisteredEvent extends OrchestratorEvent {
  readonly type: 'agent:registered';
  readonly data: AgentMetadata;
}

export interface AgentStatusChangedEvent extends OrchestratorEvent {
  readonly type: 'agent:status_changed';
  readonly data: {
    agentId: string;
    oldStatus: AgentStatus;
    newStatus: AgentStatus;
    reason?: string;
  };
}

export interface CommandQueuedEvent extends OrchestratorEvent {
  readonly type: 'command:queued';
  readonly data: QueueItem;
}

export interface CommandDeadLetterEvent extends OrchestratorEvent {
  readonly type: 'command:dead_letter';
  readonly data: {
    commandId: string;
    item: DeadLetterItem;
  };
}

export interface QueueSLABreachEvent extends OrchestratorEvent {
  readonly type: 'queue:sla_breach';
  readonly data: {
    item: QueueItem;
    waitTime: number;
    sla: number;
    breach: number;
  };
}

/**
 * Event filter options
 */
export interface EventFilter {
  readonly types?: OrchestratorEventType[];
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly limit?: number;
}

/**
 * Event system statistics
 */
export interface EventStats {
  totalEvents: number;
  byType: Record<OrchestratorEventType, number>;
  oldestEvent?: Date;
  newestEvent?: Date;
  historySize: number;
}

/**
 * Centralized event system
 */
export class EventSystem extends EventEmitter {
  private readonly config: EventConfig;
  private readonly eventHistory: OrchestratorEvent[] = [];
  private eventCounter = 0;

  public constructor(config: EventConfig) {
    super();
    this.config = config;

    // Increase max listeners to prevent warnings
    this.setMaxListeners(100);

    logger.info('EventSystem initialized', {
      enabled: config.enabled,
      maxHistorySize: config.maxHistorySize,
    });
  }

  /**
   * Emit event with automatic history tracking
   */
  public emitEvent(type: OrchestratorEventType, data: unknown, metadata?: Record<string, unknown>): void {
    if (!this.config.enabled) {
      return;
    }

    const event: OrchestratorEvent = {
      id: `evt-${++this.eventCounter}`,
      type,
      timestamp: new Date(),
      data,
      metadata,
    };

    // Add to history
    this.addToHistory(event);

    // Emit to listeners
    this.emit(type, event);
    this.emit('event', event); // Global event listener

    logger.debug('Event emitted', {
      id: event.id,
      type: event.type,
    });
  }

  /**
   * Get event history with optional filtering
   */
  public getHistory(filter?: EventFilter): OrchestratorEvent[] {
    let events = [...this.eventHistory];

    // Filter by type
    if (filter?.types && filter.types.length > 0) {
      events = events.filter((event) => filter.types!.includes(event.type));
    }

    // Filter by date range
    if (filter?.startDate) {
      events = events.filter((event) => event.timestamp >= filter.startDate!);
    }

    if (filter?.endDate) {
      events = events.filter((event) => event.timestamp <= filter.endDate!);
    }

    // Apply limit
    if (filter?.limit) {
      events = events.slice(-filter.limit);
    }

    return events;
  }

  /**
   * Get events by type
   */
  public getEventsByType(type: OrchestratorEventType, limit?: number): OrchestratorEvent[] {
    return this.getHistory({ types: [type], limit });
  }

  /**
   * Get recent events
   */
  public getRecentEvents(count = 100): OrchestratorEvent[] {
    return this.eventHistory.slice(-count);
  }

  /**
   * Search events by data content
   */
  public searchEvents(searchTerm: string): OrchestratorEvent[] {
    const term = searchTerm.toLowerCase();

    return this.eventHistory.filter((event) => {
      const dataStr = JSON.stringify(event.data).toLowerCase();
      return dataStr.includes(term);
    });
  }

  /**
   * Get event statistics
   */
  public getStats(): EventStats {
    const byType: Record<OrchestratorEventType, number> = {
      'agent:registered': 0,
      'agent:unregistered': 0,
      'agent:status_changed': 0,
      'agent:heartbeat_failed': 0,
      'agent:degraded': 0,
      'agent:recovered': 0,
      'command:queued': 0,
      'command:executing': 0,
      'command:completed': 0,
      'command:failed': 0,
      'command:retry': 0,
      'command:dead_letter': 0,
      'queue:sla_breach': 0,
      'queue:sla_warning': 0,
      'queue:size_limit': 0,
      'system:started': 0,
      'system:stopped': 0,
      'system:error': 0,
    };

    let oldestEvent: Date | undefined;
    let newestEvent: Date | undefined;

    for (const event of this.eventHistory) {
      byType[event.type]++;

      if (!oldestEvent || event.timestamp < oldestEvent) {
        oldestEvent = event.timestamp;
      }

      if (!newestEvent || event.timestamp > newestEvent) {
        newestEvent = event.timestamp;
      }
    }

    return {
      totalEvents: this.eventHistory.length,
      byType,
      oldestEvent,
      newestEvent,
      historySize: this.eventHistory.length,
    };
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    const count = this.eventHistory.length;
    this.eventHistory.length = 0;
    this.eventCounter = 0;

    logger.info('Event history cleared', { eventsRemoved: count });
  }

  /**
   * Purge old events based on retention policy
   */
  public purgeOldEvents(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const initialCount = this.eventHistory.length;

    // Remove events older than retention period
    for (let i = this.eventHistory.length - 1; i >= 0; i--) {
      if (this.eventHistory[i].timestamp < cutoffDate) {
        this.eventHistory.splice(i, 1);
      }
    }

    const purgedCount = initialCount - this.eventHistory.length;

    if (purgedCount > 0) {
      logger.info('Purged old events', {
        purgedCount,
        retentionDays: this.config.retentionDays,
      });
    }

    return purgedCount;
  }

  /**
   * Add event to history with size management
   */
  private addToHistory(event: OrchestratorEvent): void {
    this.eventHistory.push(event);

    // Maintain max history size
    if (this.eventHistory.length > this.config.maxHistorySize) {
      const removeCount = this.eventHistory.length - this.config.maxHistorySize;
      this.eventHistory.splice(0, removeCount);

      logger.debug('Event history trimmed', {
        removedCount: removeCount,
        maxSize: this.config.maxHistorySize,
      });
    }
  }

  /**
   * Export events as JSON
   */
  public exportEvents(filter?: EventFilter): string {
    const events = this.getHistory(filter);
    return JSON.stringify(events, null, 2);
  }

  /**
   * Get event count by type
   */
  public getEventCount(type?: OrchestratorEventType): number {
    if (!type) {
      return this.eventHistory.length;
    }

    return this.eventHistory.filter((event) => event.type === type).length;
  }
}
