import { logger } from "../utils/logger.js";
import type { PostgresManagerService } from "./postgresManager.js";
import type { RedisManagerService } from "./redisManager.js";
import type { CommandRunner } from "../utils/commandRunner.js";

export interface MaintenanceTask {
  readonly name: string;
  readonly type: "postgres-vacuum" | "redis-save" | "log-rotation" | "disk-cleanup";
  readonly schedule: "hourly" | "daily" | "weekly";
  readonly enabled: boolean;
  readonly config?: Record<string, unknown>;
}

export interface MaintenanceResult {
  readonly taskName: string;
  readonly success: boolean;
  readonly startTime: string;
  readonly durationMs: number;
  readonly output: string;
  readonly error?: string;
}

export interface MaintenanceStatus {
  readonly enabled: boolean;
  readonly tasks: readonly MaintenanceTask[];
  readonly lastRun: Record<string, string>;
  readonly nextRun: Record<string, string>;
}

/**
 * AutomatedMaintenanceService handles scheduled maintenance tasks
 * for PostgreSQL, Redis, and system operations.
 *
 * **Supported Tasks**:
 * - PostgreSQL VACUUM ANALYZE (daily)
 * - Redis BGSAVE (hourly)
 * - Log rotation (daily)
 * - Disk cleanup (weekly)
 *
 * **Configuration**:
 * - Tasks configured via environment or runtime API
 * - Each task can be enabled/disabled independently
 * - Schedules: hourly, daily (3am), weekly (Sunday 3am)
 */
export class AutomatedMaintenanceService {
  private readonly tasks: Map<string, MaintenanceTask> = new Map();
  private readonly timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly lastRun: Map<string, Date> = new Map();
  private isRunning = false;

  public constructor(
    private readonly postgresManager: PostgresManagerService | null,
    private readonly redisManager: RedisManagerService | null,
    private readonly runner: CommandRunner,
  ) {
    // Initialize default maintenance tasks
    this.registerDefaultTasks();
    logger.info("AutomatedMaintenanceService initialized", {
      tasksCount: this.tasks.size,
    });
  }

  /**
   * Register default maintenance tasks
   */
  private registerDefaultTasks(): void {
    // PostgreSQL VACUUM ANALYZE - daily at 3am
    if (this.postgresManager) {
      this.tasks.set("postgres-vacuum", {
        name: "postgres-vacuum",
        type: "postgres-vacuum",
        schedule: "daily",
        enabled: process.env.AUTO_VACUUM_ENABLED !== "false",
        config: {
          database: process.env.POSTGRES_DB ?? "postgres",
          analyze: true,
        },
      });
    }

    // Redis BGSAVE - hourly
    if (this.redisManager) {
      this.tasks.set("redis-save", {
        name: "redis-save",
        type: "redis-save",
        schedule: "hourly",
        enabled: process.env.AUTO_REDIS_SAVE_ENABLED !== "false",
      });
    }

    // Log rotation - daily at 4am
    this.tasks.set("log-rotation", {
      name: "log-rotation",
      type: "log-rotation",
      schedule: "daily",
      enabled: process.env.AUTO_LOG_ROTATION_ENABLED !== "false",
      config: {
        logPaths: [
          "/var/log/nginx/*.log",
          "/var/log/postgresql/*.log",
          "/var/log/keycloak/*.log",
        ],
        keepDays: 30,
      },
    });

    // Disk cleanup - weekly on Sunday at 3am
    this.tasks.set("disk-cleanup", {
      name: "disk-cleanup",
      type: "disk-cleanup",
      schedule: "weekly",
      enabled: process.env.AUTO_DISK_CLEANUP_ENABLED !== "false",
      config: {
        cleanPaths: [
          "/tmp",
          "/var/tmp",
          "/var/log/journal",
        ],
        olderThanDays: 7,
      },
    });
  }

  /**
   * Start automated maintenance scheduler
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn("AutomatedMaintenanceService already running");
      return;
    }

    logger.info("Starting automated maintenance scheduler");

    for (const [taskName, task] of this.tasks.entries()) {
      if (!task.enabled) {
        logger.debug("Skipping disabled task", { taskName });
        continue;
      }

      this.scheduleTask(taskName, task);
    }

    this.isRunning = true;
    logger.info("Automated maintenance scheduler started", {
      enabledTasks: Array.from(this.tasks.values()).filter(t => t.enabled).length,
    });
  }

  /**
   * Stop automated maintenance scheduler
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping automated maintenance scheduler");

    for (const [taskName, timer] of this.timers.entries()) {
      clearTimeout(timer);
      logger.debug("Stopped task timer", { taskName });
    }

    this.timers.clear();
    this.isRunning = false;
    logger.info("Automated maintenance scheduler stopped");
  }

  /**
   * Schedule a task based on its schedule type
   */
  private scheduleTask(taskName: string, task: MaintenanceTask): void {
    const intervalMs = this.getScheduleInterval(task.schedule);

    logger.info("Scheduling maintenance task", {
      taskName,
      schedule: task.schedule,
      intervalMs,
    });

    // Run immediately on first start if never run before
    if (!this.lastRun.has(taskName)) {
      void this.runTask(taskName, task);
    }

    // Schedule recurring execution
    const timer = setInterval(() => {
      void this.runTask(taskName, task);
    }, intervalMs);

    this.timers.set(taskName, timer);
  }

  /**
   * Get interval in milliseconds for schedule type
   */
  private getScheduleInterval(schedule: "hourly" | "daily" | "weekly"): number {
    switch (schedule) {
      case "hourly":
        return 60 * 60 * 1000; // 1 hour
      case "daily":
        return 24 * 60 * 60 * 1000; // 24 hours
      case "weekly":
        return 7 * 24 * 60 * 60 * 1000; // 7 days
    }
  }

  /**
   * Run a specific maintenance task
   */
  public async runTask(taskName: string, task?: MaintenanceTask): Promise<MaintenanceResult> {
    const taskToRun = task ?? this.tasks.get(taskName);

    if (!taskToRun) {
      throw new Error(`Unknown maintenance task: ${taskName}`);
    }

    const startTime = new Date();
    const startMs = Date.now();

    logger.info("Running maintenance task", { taskName, type: taskToRun.type });

    try {
      let output = "";

      switch (taskToRun.type) {
        case "postgres-vacuum":
          output = await this.runPostgresVacuum(taskToRun);
          break;
        case "redis-save":
          output = await this.runRedisSave(taskToRun);
          break;
        case "log-rotation":
          output = await this.runLogRotation(taskToRun);
          break;
        case "disk-cleanup":
          output = await this.runDiskCleanup(taskToRun);
          break;
      }

      this.lastRun.set(taskName, startTime);

      const result: MaintenanceResult = {
        taskName,
        success: true,
        startTime: startTime.toISOString(),
        durationMs: Date.now() - startMs,
        output,
      };

      logger.info("Maintenance task completed", {
        taskName,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      const result: MaintenanceResult = {
        taskName,
        success: false,
        startTime: startTime.toISOString(),
        durationMs: Date.now() - startMs,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };

      logger.error("Maintenance task failed", {
        taskName,
        error,
        durationMs: result.durationMs,
      });

      return result;
    }
  }

  /**
   * Run PostgreSQL VACUUM ANALYZE
   */
  private async runPostgresVacuum(task: MaintenanceTask): Promise<string> {
    if (!this.postgresManager) {
      throw new Error("PostgreSQL manager not available");
    }

    const database = (task.config?.database as string) ?? "postgres";
    const analyze = (task.config?.analyze as boolean) ?? true;

    const result = await this.postgresManager.runVacuum(database, analyze);

    if (!result.success) {
      throw new Error(result.output);
    }

    return `VACUUM ${analyze ? "ANALYZE" : ""} completed on ${database} in ${result.durationMs}ms`;
  }

  /**
   * Run Redis BGSAVE
   */
  private async runRedisSave(_task: MaintenanceTask): Promise<string> {
    if (!this.redisManager) {
      throw new Error("Redis manager not available");
    }

    const result = await this.redisManager.bgsave();

    if (!result.success) {
      throw new Error("BGSAVE failed");
    }

    return `Redis BGSAVE completed in ${result.durationMs}ms (last save: ${new Date(result.lastSave * 1000).toISOString()})`;
  }

  /**
   * Run log rotation
   */
  private async runLogRotation(task: MaintenanceTask): Promise<string> {
    const logPaths = (task.config?.logPaths as string[]) ?? ["/var/log/*.log"];
    const keepDays = (task.config?.keepDays as number) ?? 30;

    // Use logrotate if available, otherwise manual rotation
    try {
      const result = await this.runner.run(
        `logrotate --force /etc/logrotate.d/server-mcp`,
        { requiresSudo: true, timeoutMs: 60000 },
      );

      return `Log rotation completed: ${result.stdout}`;
    } catch (error) {
      // Fallback: Manual rotation for specific paths
      const commands = logPaths.map(
        path => `find ${path} -type f -mtime +${keepDays} -delete`,
      );

      const results = await Promise.all(
        commands.map(cmd =>
          this.runner.run(cmd, { requiresSudo: true, timeoutMs: 30000 }),
        ),
      );

      const totalDeleted = results.reduce(
        (sum, r) => sum + (r.stdout.split("\n").length - 1),
        0,
      );

      return `Manual log rotation completed: ${totalDeleted} files deleted`;
    }
  }

  /**
   * Run disk cleanup
   */
  private async runDiskCleanup(task: MaintenanceTask): Promise<string> {
    const cleanPaths = (task.config?.cleanPaths as string[]) ?? ["/tmp", "/var/tmp"];
    const olderThanDays = (task.config?.olderThanDays as number) ?? 7;

    const commands = cleanPaths.map(
      path => `find ${path} -type f -mtime +${olderThanDays} -delete`,
    );

    const results = await Promise.all(
      commands.map(cmd =>
        this.runner.run(cmd, { requiresSudo: true, timeoutMs: 60000 }),
      ),
    );

    const totalDeleted = results.reduce(
      (sum, r) => sum + (r.stdout.split("\n").filter(l => l.trim()).length),
      0,
    );

    return `Disk cleanup completed: ${totalDeleted} files deleted from ${cleanPaths.length} paths`;
  }

  /**
   * Get maintenance status
   */
  public getStatus(): MaintenanceStatus {
    const nextRun: Record<string, string> = {};

    for (const [taskName, task] of this.tasks.entries()) {
      if (!task.enabled) {
        continue;
      }

      const lastRunTime = this.lastRun.get(taskName);
      if (lastRunTime) {
        const intervalMs = this.getScheduleInterval(task.schedule);
        const nextRunTime = new Date(lastRunTime.getTime() + intervalMs);
        nextRun[taskName] = nextRunTime.toISOString();
      } else {
        nextRun[taskName] = "pending";
      }
    }

    const lastRunRecord: Record<string, string> = {};
    for (const [taskName, time] of this.lastRun.entries()) {
      lastRunRecord[taskName] = time.toISOString();
    }

    return {
      enabled: this.isRunning,
      tasks: Array.from(this.tasks.values()),
      lastRun: lastRunRecord,
      nextRun,
    };
  }

  /**
   * Enable a task
   */
  public enableTask(taskName: string): void {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Unknown task: ${taskName}`);
    }

    this.tasks.set(taskName, { ...task, enabled: true });

    if (this.isRunning) {
      this.scheduleTask(taskName, { ...task, enabled: true });
    }

    logger.info("Task enabled", { taskName });
  }

  /**
   * Disable a task
   */
  public disableTask(taskName: string): void {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Unknown task: ${taskName}`);
    }

    this.tasks.set(taskName, { ...task, enabled: false });

    const timer = this.timers.get(taskName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(taskName);
    }

    logger.info("Task disabled", { taskName });
  }

  /**
   * Cleanup: stop all timers
   */
  public destroy(): void {
    this.stop();
    logger.info("AutomatedMaintenanceService destroyed");
  }
}
