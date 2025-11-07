import Redis from "ioredis";
import { logger } from "../utils/logger.js";

export interface RedisInfo {
  readonly version: string;
  readonly uptime: number;
  readonly connectedClients: number;
  readonly usedMemory: number;
  readonly usedMemoryPeak: number;
  readonly memoryFragmentationRatio: number;
  readonly totalCommandsProcessed: number;
  readonly opsPerSec: number;
  readonly role: "master" | "slave";
}

export interface MemoryStats {
  readonly usedMemoryHuman: string;
  readonly usedMemoryPeakHuman: string;
  readonly memoryFragmentationRatio: number;
  readonly memoryAllocator: string;
  readonly usedMemoryRss: number;
  readonly maxMemory: number;
  readonly maxMemoryPolicy: string;
}

export interface KeyspaceStats {
  readonly database: number;
  readonly keys: number;
  readonly expires: number;
  readonly avgTtl: number;
}

export interface SlowLogEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly duration: number;
  readonly command: string;
  readonly clientAddress: string;
  readonly clientName: string;
}

export interface ClientInfo {
  readonly id: string;
  readonly address: string;
  readonly name: string;
  readonly age: number;
  readonly idle: number;
  readonly db: number;
  readonly cmd: string;
}

export interface SaveResult {
  readonly success: boolean;
  readonly durationMs: number;
  readonly lastSave: number;
}

export class RedisManagerService {
  private readonly redis: Redis;

  public constructor(connectionConfig?: {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    retryStrategy?: (times: number) => number;
    maxRetriesPerRequest?: number;
  }) {
    this.redis = new Redis(
      connectionConfig ?? {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD,
        db: Number(process.env.REDIS_DB ?? 0),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      },
    );

    this.redis.on("error", (error) => {
      logger.error("Redis connection error", { error });
    });

    this.redis.on("connect", () => {
      logger.info("Redis connected", {
        host: this.redis.options.host,
        port: this.redis.options.port,
      });
    });
  }

  public async getInfo(): Promise<RedisInfo> {
    const info = await this.redis.info();
    const parsed = this.parseInfoString(info);

    return {
      version: parsed.server?.redis_version ?? "unknown",
      uptime: Number(parsed.server?.uptime_in_seconds ?? 0),
      connectedClients: Number(parsed.clients?.connected_clients ?? 0),
      usedMemory: Number(parsed.memory?.used_memory ?? 0),
      usedMemoryPeak: Number(parsed.memory?.used_memory_peak ?? 0),
      memoryFragmentationRatio: Number(parsed.memory?.mem_fragmentation_ratio ?? 1.0),
      totalCommandsProcessed: Number(parsed.stats?.total_commands_processed ?? 0),
      opsPerSec: Number(parsed.stats?.instantaneous_ops_per_sec ?? 0),
      role: (parsed.replication?.role === "slave" ? "slave" : "master") as "master" | "slave",
    };
  }

  public async getMemoryStats(): Promise<MemoryStats> {
    const info = await this.redis.info("memory");
    const parsed = this.parseInfoString(info);
    const memory = parsed.memory ?? {};

    return {
      usedMemoryHuman: memory.used_memory_human ?? "0B",
      usedMemoryPeakHuman: memory.used_memory_peak_human ?? "0B",
      memoryFragmentationRatio: Number(memory.mem_fragmentation_ratio ?? 1.0),
      memoryAllocator: memory.mem_allocator ?? "unknown",
      usedMemoryRss: Number(memory.used_memory_rss ?? 0),
      maxMemory: Number(memory.maxmemory ?? 0),
      maxMemoryPolicy: memory.maxmemory_policy ?? "noeviction",
    };
  }

  public async getKeyspaceStats(): Promise<KeyspaceStats[]> {
    const info = await this.redis.info("keyspace");
    const parsed = this.parseInfoString(info);
    const keyspace = parsed.keyspace ?? {};

    const stats: KeyspaceStats[] = [];
    for (const [key, value] of Object.entries(keyspace)) {
      const dbMatch = key.match(/^db(\d+)$/);
      if (!dbMatch) {
        continue;
      }

      const dbNumber = Number(dbMatch[1]);
      const valueStr = String(value);
      const keysMatch = valueStr.match(/keys=(\d+)/);
      const expiresMatch = valueStr.match(/expires=(\d+)/);
      const avgTtlMatch = valueStr.match(/avg_ttl=(\d+)/);

      stats.push({
        database: dbNumber,
        keys: keysMatch ? Number(keysMatch[1]) : 0,
        expires: expiresMatch ? Number(expiresMatch[1]) : 0,
        avgTtl: avgTtlMatch ? Number(avgTtlMatch[1]) : 0,
      });
    }

    return stats;
  }

  public async getSlowLog(count: number = 10): Promise<SlowLogEntry[]> {
    const logs = await this.redis.slowlog("GET", count) as unknown[];
    const entries: SlowLogEntry[] = [];

    for (const log of logs) {
      if (!Array.isArray(log) || log.length < 6) {
        continue;
      }

      const [id, timestamp, duration, command, clientAddress, clientName] = log;

      entries.push({
        id: Number(id),
        timestamp: Number(timestamp),
        duration: Number(duration),
        command: Array.isArray(command) ? command.join(" ") : String(command),
        clientAddress: String(clientAddress),
        clientName: String(clientName),
      });
    }

    return entries;
  }

  public async getClientList(): Promise<ClientInfo[]> {
    const clientList = await this.redis.client("LIST") as unknown as string;
    const lines = clientList.split("\n").filter((line: string) => line.trim());

    const clients: ClientInfo[] = [];
    for (const line of lines) {
      const parts = line.split(" ");
      const clientData: Record<string, string> = {};

      for (const part of parts) {
        const [key, value] = part.split("=");
        if (key && value) {
          clientData[key] = value;
        }
      }

      clients.push({
        id: clientData.id ?? "unknown",
        address: clientData.addr ?? "unknown",
        name: clientData.name ?? "",
        age: Number(clientData.age ?? 0),
        idle: Number(clientData.idle ?? 0),
        db: Number(clientData.db ?? 0),
        cmd: clientData.cmd ?? "unknown",
      });
    }

    return clients;
  }

  public async flushDatabase(database?: number): Promise<void> {
    if (database !== undefined) {
      await this.redis.select(database);
      await this.redis.flushdb();
      logger.warn("Redis database flushed", { database });
    } else {
      await this.redis.flushdb();
      logger.warn("Current Redis database flushed");
    }
  }

  public async bgsave(): Promise<SaveResult> {
    const startTime = Date.now();

    try {
      await this.redis.bgsave();
      const durationMs = Date.now() - startTime;

      // Get last save time
      const lastSave = await this.redis.lastsave();

      logger.info("Redis BGSAVE initiated", { durationMs, lastSave });

      return {
        success: true,
        durationMs,
        lastSave: Number(lastSave),
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error("Redis BGSAVE failed", { error, durationMs });

      return {
        success: false,
        durationMs,
        lastSave: 0,
      };
    }
  }

  public async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    await this.redis.quit();
    logger.info("Redis connection closed");
  }

  private parseInfoString(info: string): Record<string, Record<string, string>> {
    const sections: Record<string, Record<string, string>> = {};
    let currentSection = "general";
    sections[currentSection] = {};

    const lines = info.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        // Check if it's a section header
        const sectionMatch = trimmed.match(/^#\s*(\w+)$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1].toLowerCase();
          sections[currentSection] = {};
        }
        continue;
      }

      // Parse key:value pairs
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        sections[currentSection][key] = value;
      }
    }

    return sections;
  }
}
