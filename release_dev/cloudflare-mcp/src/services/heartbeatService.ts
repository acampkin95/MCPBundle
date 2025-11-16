import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { CloudflareDnsService } from './cloudflareDnsService.js';
import type {
  MeshRegistryStore,
  HeartbeatPayload,
  HeartbeatPersistenceResult,
  MeshAgentRecord,
} from './meshRegistry.js';

const macAddressRegex = /^([0-9A-Fa-f]{2}([-:])){5}[0-9A-Fa-f]{2}$/;

const heartbeatSchema = z.object({
  agentName: z.string().min(3).max(80),
  macAddress: z.string().regex(macAddressRegex, 'Invalid MAC address'),
  ipAddress: z.string().ip(),
  hostname: z.string().min(1).max(120).optional(),
  serviceRole: z.string().min(1).max(120).optional(),
  dnsLabel: z.string().min(1).max(63).optional(),
  heartbeatIntervalMs: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export interface HeartbeatServiceOptions {
  readonly sharedSecret: string;
  readonly defaultHeartbeatMs: number;
  readonly adminToken?: string;
}

export interface HeartbeatResponsePayload {
  readonly state: HeartbeatPersistenceResult['state'];
  readonly allowDnsUpdate: boolean;
  readonly ipChanged: boolean;
  readonly dnsHostname?: string;
  readonly dnsRecordId?: string;
  readonly dnsRecordType?: string;
  readonly nextHeartbeatMs: number;
  readonly reason?: string;
}

export class HeartbeatService {
  public constructor(
    private readonly registry: MeshRegistryStore,
    private readonly dnsService: CloudflareDnsService,
    private readonly options: HeartbeatServiceOptions
  ) {}

  public verifySharedSecret(token: string | undefined): boolean {
    return Boolean(token) && token === this.options.sharedSecret;
  }

  public async handleHeartbeat(rawPayload: unknown): Promise<HeartbeatResponsePayload> {
    const payload = heartbeatSchema.parse(rawPayload);
    const normalizedPayload: HeartbeatPayload = {
      agentName: payload.agentName.toLowerCase(),
      macAddress: payload.macAddress.toLowerCase(),
      ipAddress: payload.ipAddress,
      hostname: payload.hostname,
      serviceRole: payload.serviceRole,
      dnsLabel: payload.dnsLabel ?? payload.agentName.toLowerCase(),
      heartbeatIntervalMs: payload.heartbeatIntervalMs,
      metadata: payload.metadata,
    };

    const persistenceResult = await this.registry.recordHeartbeat(normalizedPayload);

    let dnsHostname: string | undefined;
    let dnsRecordId: string | undefined;
    let dnsRecordType: string | undefined;
    let dnsFailureReason: string | undefined;

    if (persistenceResult.allowDnsUpdate) {
      try {
        const dnsResponse = await this.dnsService.ensureRecord({
          agentName: normalizedPayload.agentName,
          dnsLabel: normalizedPayload.dnsLabel,
          macAddress: normalizedPayload.macAddress,
          ipAddress: normalizedPayload.ipAddress,
          metadata: normalizedPayload.metadata,
        });
        dnsHostname = dnsResponse.hostname;
        dnsRecordId = dnsResponse.recordId;
        dnsRecordType = dnsResponse.type;
        await this.registry.markDnsUpdate(normalizedPayload.agentName);
      } catch (error) {
        dnsFailureReason = (error as Error).message;
        logger.error('Failed to synchronize DNS record', {
          agent: normalizedPayload.agentName,
          error,
        });
      }
    }

    const nextHeartbeatMs =
      payload.heartbeatIntervalMs ??
      persistenceResult.record.heartbeatIntervalMs ??
      this.options.defaultHeartbeatMs;

    const allowDnsUpdate = persistenceResult.allowDnsUpdate && !dnsFailureReason;

    return {
      state: persistenceResult.state,
      allowDnsUpdate,
      ipChanged: persistenceResult.ipChanged,
      dnsHostname,
      dnsRecordId,
      dnsRecordType,
      nextHeartbeatMs,
      reason: this.buildReason(persistenceResult.state, dnsFailureReason),
    };
  }

  public async authorizePendingMac(
    agentName: string,
    providedToken: string | undefined
  ): Promise<MeshAgentRecord> {
    if (!this.options.adminToken) {
      throw new Error('Admin token not configured for cloudflare-mcp');
    }
    if (providedToken !== this.options.adminToken) {
      throw new Error('Invalid admin token');
    }
    const record = await this.registry.authorizePendingMac(agentName.toLowerCase());
    if (!record) {
      throw new Error(`No pending MAC change for agent ${agentName}`);
    }
    logger.info('Authorized pending MAC', { agentName: record.agentName, mac: record.macAddress });
    return record;
  }

  private buildReason(
    state: HeartbeatPersistenceResult['state'],
    dnsFailure?: string
  ): string | undefined {
    if (state === 'mac_verification_required') {
      return 'MAC address changed. Manual authorization required before DNS updates resume.';
    }
    if (dnsFailure) {
      return `DNS update error: ${dnsFailure}`;
    }
    return undefined;
  }
}
