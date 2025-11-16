import { Pool, type PoolClient } from 'pg';
import { logger } from '../utils/logger.js';

export type AgentStatus = 'active' | 'inactive' | 'mac_verification_required';

export interface MeshRegistryOptions {
  readonly connectionString: string;
  readonly sslMode: 'disable' | 'allow' | 'require';
}

export interface HeartbeatPayload {
  readonly agentName: string;
  readonly macAddress: string;
  readonly ipAddress: string;
  readonly hostname?: string;
  readonly serviceRole?: string;
  readonly dnsLabel?: string;
  readonly heartbeatIntervalMs?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface MeshAgentRecord {
  readonly agentName: string;
  readonly macAddress: string;
  readonly pendingMac?: string | null;
  readonly ipAddress: string;
  readonly hostname?: string | null;
  readonly dnsLabel?: string | null;
  readonly serviceRole?: string | null;
  readonly status: AgentStatus;
  readonly lastHeartbeat: Date;
  readonly lastMacChange?: Date | null;
  readonly lastDnsUpdate?: Date | null;
  readonly heartbeatIntervalMs?: number | null;
  readonly metadata?: Record<string, unknown> | null;
}

export type HeartbeatState = 'registered' | 'updated' | 'mac_verification_required';

export interface HeartbeatPersistenceResult {
  readonly state: HeartbeatState;
  readonly allowDnsUpdate: boolean;
  readonly ipChanged: boolean;
  readonly record: MeshAgentRecord;
}

export class MeshRegistryStore {
  private readonly pool: Pool;
  private initialized = false;

  public constructor(private readonly options: MeshRegistryOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      ssl:
        options.sslMode === 'disable'
          ? undefined
          : {
              rejectUnauthorized: options.sslMode === 'require',
            },
    });

    this.pool.on('error', (error) => {
      logger.error('Mesh registry connection error', { error });
    });
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mesh_agents (
        agent_name TEXT PRIMARY KEY,
        mac_address TEXT NOT NULL,
        pending_mac TEXT NULL,
        ip_address TEXT NOT NULL,
        hostname TEXT NULL,
        dns_label TEXT NULL,
        service_role TEXT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        heartbeat_interval_ms INTEGER NULL,
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_mac_change TIMESTAMPTZ NULL,
        last_dns_update TIMESTAMPTZ NULL,
        metadata JSONB DEFAULT '{}'::jsonb
      );
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mesh_agents_mac_idx ON mesh_agents (mac_address);
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mesh_agent_events (
        id BIGSERIAL PRIMARY KEY,
        agent_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    this.initialized = true;
    logger.info('Mesh registry initialized');
  }

  public async recordHeartbeat(payload: HeartbeatPayload): Promise<HeartbeatPersistenceResult> {
    const client = await this.pool.connect();
    const now = new Date();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT * FROM mesh_agents WHERE agent_name = $1', [
        payload.agentName,
      ]);

      if (existing.rowCount === 0) {
        const inserted = await client.query(
          `INSERT INTO mesh_agents (
            agent_name, mac_address, ip_address, hostname, dns_label, service_role, status,
            heartbeat_interval_ms, last_heartbeat, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9::jsonb)
          RETURNING *`,
          [
            payload.agentName,
            payload.macAddress.toLowerCase(),
            payload.ipAddress,
            payload.hostname ?? null,
            payload.dnsLabel ?? null,
            payload.serviceRole ?? null,
            payload.heartbeatIntervalMs ?? null,
            now,
            JSON.stringify(payload.metadata ?? {}),
          ]
        );
        await this.insertEvent(client, payload.agentName, 'registered', { ip: payload.ipAddress });
        await client.query('COMMIT');
        return {
          state: 'registered',
          allowDnsUpdate: true,
          ipChanged: true,
          record: this.mapRow(inserted.rows[0]),
        };
      }

      const current = existing.rows[0];
      const currentMac = (current.mac_address as string).toLowerCase();
      const incomingMac = payload.macAddress.toLowerCase();
      const ipChanged = current.ip_address !== payload.ipAddress;

      if (currentMac !== incomingMac) {
        const updated = await client.query(
          `UPDATE mesh_agents
             SET pending_mac = $1,
                 status = 'mac_verification_required',
                 last_mac_change = $2,
                 last_heartbeat = $2,
                 ip_address = $3,
                 metadata = COALESCE($4::jsonb, metadata)
           WHERE agent_name = $5
           RETURNING *`,
          [
            incomingMac,
            now,
            payload.ipAddress,
            payload.metadata ? JSON.stringify(payload.metadata) : null,
            payload.agentName,
          ]
        );
        await this.insertEvent(client, payload.agentName, 'mac_verification_required', {
          previousMac: current.mac_address,
          requestedMac: incomingMac,
        });
        await client.query('COMMIT');
        return {
          state: 'mac_verification_required',
          allowDnsUpdate: false,
          ipChanged,
          record: this.mapRow(updated.rows[0]),
        };
      }

      const updated = await client.query(
        `UPDATE mesh_agents
           SET ip_address = $1,
               hostname = COALESCE($2, hostname),
               dns_label = COALESCE($3, dns_label),
               service_role = COALESCE($4, service_role),
               status = CASE WHEN status = 'inactive' THEN 'active' ELSE status END,
               heartbeat_interval_ms = COALESCE($5, heartbeat_interval_ms),
               last_heartbeat = $6,
               metadata = COALESCE($7::jsonb, metadata)
         WHERE agent_name = $8
         RETURNING *`,
        [
          payload.ipAddress,
          payload.hostname ?? null,
          payload.dnsLabel ?? null,
          payload.serviceRole ?? null,
          payload.heartbeatIntervalMs ?? null,
          now,
          payload.metadata ? JSON.stringify(payload.metadata) : null,
          payload.agentName,
        ]
      );
      await this.insertEvent(
        client,
        payload.agentName,
        ipChanged ? 'heartbeat_ip_update' : 'heartbeat',
        {
          ip: payload.ipAddress,
        }
      );
      await client.query('COMMIT');
      return {
        state: 'updated',
        allowDnsUpdate: true,
        ipChanged,
        record: this.mapRow(updated.rows[0]),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to record heartbeat', { error, agent: payload.agentName });
      throw error;
    } finally {
      client.release();
    }
  }

  public async authorizePendingMac(agentName: string): Promise<MeshAgentRecord | undefined> {
    const { rows } = await this.pool.query(
      `UPDATE mesh_agents
         SET mac_address = COALESCE(pending_mac, mac_address),
             pending_mac = NULL,
             status = 'active',
             last_mac_change = NOW()
       WHERE agent_name = $1 AND pending_mac IS NOT NULL
       RETURNING *`,
      [agentName]
    );
    if (rows.length === 0) {
      return undefined;
    }
    await this.insertEvent(null, agentName, 'mac_authorized', {});
    return this.mapRow(rows[0]);
  }

  public async markDnsUpdate(agentName: string): Promise<void> {
    await this.pool.query(`UPDATE mesh_agents SET last_dns_update = NOW() WHERE agent_name = $1`, [
      agentName,
    ]);
    await this.insertEvent(null, agentName, 'dns_update', {});
  }

  public async listAgents(): Promise<MeshAgentRecord[]> {
    const { rows } = await this.pool.query('SELECT * FROM mesh_agents ORDER BY agent_name ASC');
    return rows.map((row) => this.mapRow(row));
  }

  public async getAgent(agentName: string): Promise<MeshAgentRecord | undefined> {
    const { rows } = await this.pool.query('SELECT * FROM mesh_agents WHERE agent_name = $1', [
      agentName,
    ]);
    return rows[0] ? this.mapRow(rows[0]) : undefined;
  }

  public async findStaleAgents(thresholdMs: number): Promise<MeshAgentRecord[]> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const { rows } = await this.pool.query(
      `SELECT * FROM mesh_agents WHERE last_heartbeat < $1 AND status <> 'inactive'`,
      [cutoff]
    );
    return rows.map((row) => this.mapRow(row));
  }

  public async markAgentInactive(agentName: string): Promise<MeshAgentRecord | undefined> {
    const { rows } = await this.pool.query(
      `UPDATE mesh_agents SET status = 'inactive' WHERE agent_name = $1 RETURNING *`,
      [agentName]
    );
    if (rows.length === 0) {
      return undefined;
    }
    await this.insertEvent(null, agentName, 'marked_inactive', {});
    return this.mapRow(rows[0]);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async insertEvent(
    client: PoolClient | null,
    agentName: string,
    eventType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const runner = client ?? this.pool;
    await runner.query(
      `INSERT INTO mesh_agent_events (agent_name, event_type, details) VALUES ($1, $2, $3)`,
      [agentName, eventType, JSON.stringify(details ?? {})]
    );
  }

  private mapRow(row: Record<string, unknown>): MeshAgentRecord {
    return {
      agentName: row.agent_name as string,
      macAddress: row.mac_address as string,
      pendingMac: (row.pending_mac as string | null) ?? undefined,
      ipAddress: row.ip_address as string,
      hostname: (row.hostname as string | null) ?? undefined,
      dnsLabel: (row.dns_label as string | null) ?? undefined,
      serviceRole: (row.service_role as string | null) ?? undefined,
      status: row.status as AgentStatus,
      lastHeartbeat: new Date(row.last_heartbeat as string),
      lastMacChange: row.last_mac_change ? new Date(row.last_mac_change as string) : undefined,
      lastDnsUpdate: row.last_dns_update ? new Date(row.last_dns_update as string) : undefined,
      heartbeatIntervalMs: row.heartbeat_interval_ms as number | null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    };
  }
}
