import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildPanelOverview } from '../services/adminPanelView.js';
import type { CloudflareDnsService } from '../services/cloudflareDnsService.js';
import type { HeartbeatService } from '../services/heartbeatService.js';
import type { LogIngestorService, LogQueryFilters } from '../services/logIngestor.js';
import type { MeshRegistryStore, MeshAgentRecord } from '../services/meshRegistry.js';
import type { StructuredThinkingService } from '../services/structuredThinking.js';
import { logger } from '../utils/logger.js';

export interface ToolDependencies {
  readonly dnsService: CloudflareDnsService;
  readonly registry: MeshRegistryStore;
  readonly heartbeatService: HeartbeatService;
  readonly structuredThinking: StructuredThinkingService;
  readonly logIngestor: LogIngestorService;
  readonly credentialSalt: string;
  readonly staleThresholdMs: number;
  readonly updatePanelMetrics: (agents: MeshAgentRecord[]) => void | Promise<void>;
}

const jsonBlock = (label: string, data: unknown): string => {
  const body = JSON.stringify(data, null, 2);
  return [`# ${label}`, '', '```json', body, '```'].join('\n');
};

const dnsListShape = {
  name: z.string().min(1).optional(),
  type: z.enum(['A', 'AAAA', 'CNAME', 'TXT']).optional(),
};
const dnsListInput = z.object(dnsListShape);

const dnsUpsertShape = {
  agentName: z.string().min(3),
  macAddress: z.string().min(11),
  ipAddress: z.string().ip(),
  dnsLabel: z.string().min(1).optional(),
  ttl: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
};
const dnsUpsertInput = z.object(dnsUpsertShape);

const dnsDeleteShape = {
  recordId: z.string().min(5).optional(),
  name: z.string().min(1).optional(),
};
const dnsDeleteInput = z.object(dnsDeleteShape);
const dnsDeleteSchema = dnsDeleteInput.superRefine((value, ctx) => {
  if (!value.recordId && !value.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either recordId or name',
      path: ['recordId'],
    });
  }
});
const registryGetShape = {
  agentName: z.string().min(3),
};
const registryGetInput = z.object(registryGetShape);

const registryAuthorizeShape = {
  agentName: z.string().min(3),
  adminToken: z.string().min(8),
};
const registryAuthorizeInput = z.object(registryAuthorizeShape);

const panelSnapshotShape = {
  includeTimeline: z.boolean().optional(),
  maxEntries: z.number().int().min(5).max(200).optional(),
};
const panelSnapshotInput = z.object(panelSnapshotShape);

const logQueryShape = {
  service: z.string().min(1).optional(),
  nodeId: z.string().min(1).optional(),
  category: z.enum(['application', 'system', 'security', 'audit']).optional(),
  level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  search: z.string().min(1).max(512).optional(),
  tags: z.array(z.string().min(1).max(48)).max(10).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  includePayload: z.boolean().optional(),
};
const logQueryInput = z.object(logQueryShape);

export function registerTools(server: McpServer, deps: ToolDependencies): void {
  logger.info('Registering cloudflare-mcp tools');

  server.registerTool(
    'cloudflare.dns.list',
    {
      description: 'List DNS records managed by the Cloudflare MCP zone',
      inputSchema: dnsListShape,
    },
    async (args) => {
      const input = dnsListInput.parse(args ?? {});
      const records = await deps.dnsService.listRecords({ name: input.name, type: input.type });
      return {
        content: [{ type: 'text' as const, text: jsonBlock('DNS Records', records) }],
        structuredContent: { records },
      };
    }
  );

  server.registerTool(
    'cloudflare.dns.upsert',
    {
      description: 'Create or update an A/AAAA record for an MCP agent',
      inputSchema: dnsUpsertShape,
    },
    async (args) => {
      const input = dnsUpsertInput.parse(args ?? {});
      const dnsResult = await deps.dnsService.ensureRecord({
        agentName: input.agentName,
        dnsLabel: input.dnsLabel ?? input.agentName,
        macAddress: input.macAddress,
        ipAddress: input.ipAddress,
        ttl: input.ttl,
        metadata: input.metadata,
      });
      await deps.registry.markDnsUpdate(input.agentName);
      return {
        content: [{ type: 'text' as const, text: jsonBlock('DNS Upsert', dnsResult) }],
        structuredContent: { dnsResult },
      };
    }
  );

  server.registerTool(
    'cloudflare.dns.delete',
    {
      description: 'Delete a DNS record by ID or name',
      inputSchema: dnsDeleteShape,
    },
    async (args) => {
      const input = dnsDeleteSchema.parse(args ?? {});
      if (input.recordId) {
        await deps.dnsService.deleteRecord(input.recordId);
        return {
          content: [{ type: 'text' as const, text: `Deleted record ${input.recordId}` }],
        };
      }
      const records = await deps.dnsService.listRecords({ name: input.name });
      if (records.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No records found for ${input.name}` }],
        };
      }
      for (const record of records) {
        await deps.dnsService.deleteRecord(record.id);
      }
      return {
        content: [
          {
            type: 'text' as const,
            text: `Deleted ${records.length} record(s) for ${input.name}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    'mesh.registry.list',
    {
      description: 'List registered MCP mesh agents and their current status',
      inputSchema: {},
    },
    async () => {
      const agents = await deps.registry.listAgents();
      return {
        content: [{ type: 'text' as const, text: jsonBlock('Mesh Agents', agents) }],
        structuredContent: { agents },
      };
    }
  );

  server.registerTool(
    'mesh.registry.get',
    {
      description: 'Retrieve a single agent entry by name',
      inputSchema: registryGetShape,
    },
    async (args) => {
      const input = registryGetInput.parse(args ?? {});
      const agent = await deps.registry.getAgent(input.agentName.toLowerCase());
      if (!agent) {
        return {
          content: [{ type: 'text' as const, text: `Agent ${input.agentName} not found` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: jsonBlock('Mesh Agent', agent) }],
        structuredContent: { agent },
      };
    }
  );

  server.registerTool(
    'mesh.registry.authorize-mac',
    {
      description: 'Approve a pending MAC change so DNS updates resume',
      inputSchema: registryAuthorizeShape,
    },
    async (args) => {
      const input = registryAuthorizeInput.parse(args ?? {});
      const record = await deps.heartbeatService.authorizePendingMac(
        input.agentName,
        input.adminToken
      );
      return {
        content: [{ type: 'text' as const, text: jsonBlock('MAC Authorized', record) }],
        structuredContent: { record },
      };
    }
  );

  server.registerTool(
    'panel.snapshot',
    {
      description: 'Generate an admin overview with credential printouts and structured thoughts',
      inputSchema: panelSnapshotShape,
    },
    async (args) => {
      const input = panelSnapshotInput.parse(args ?? {});
      const agents = await deps.registry.listAgents();
      const overview = buildPanelOverview(agents, {
        salt: deps.credentialSalt,
        staleThresholdMs: deps.staleThresholdMs,
        hostnameResolver: (agent) =>
          deps.dnsService.resolveHostname(agent.dnsLabel ?? agent.agentName),
      });
      await deps.updatePanelMetrics(agents);

      const timeline = deps.structuredThinking.getTimeline();
      const report = deps.structuredThinking.generateReport(timeline, {
        format: 'json',
        includeTimeline: input.includeTimeline ?? true,
        maxEntries: input.maxEntries ?? 50,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: jsonBlock('Admin Panel Snapshot', {
              stats: overview.stats,
              credentialPrintout: overview.credentialPrintout,
              structuredThoughtSummary: report.summary,
            }),
          },
        ],
        structuredContent: {
          overview,
          structuredThoughts: {
            summary: report.summary,
            diagnostics: report.diagnostics,
            timeline: report.timeline,
            rendered: report.content,
          },
        } as Record<string, unknown>,
      };
    }
  );

  server.registerTool(
    'panel.logs.query',
    {
      description: 'Query the centralized MCP log stream for recent events',
      inputSchema: logQueryShape,
    },
    async (args) => {
      const input = logQueryInput.parse(args ?? {});
      const filters: LogQueryFilters = {
        service: input.service,
        nodeId: input.nodeId,
        category: input.category,
        level: input.level,
        search: input.search,
        limit: input.limit ?? 50,
        includePayload: input.includePayload,
        tags: input.tags,
      };
      const result = deps.logIngestor.query(filters);
      const preview = result.entries.slice(0, 5).map((entry) => ({
        id: entry.id,
        service: entry.service,
        nodeId: entry.nodeId,
        level: entry.level,
        message: entry.message,
        lastSeen: entry.lastSeen,
        repeatCount: entry.repeatCount,
        investigationStatus: entry.investigationStatus,
      }));
      const structuredContent = {
        filters,
        totalEntries: result.entries.length,
        nextCursor: result.nextCursor,
        preview,
        entries: result.entries,
      } satisfies Record<string, unknown>;
      return {
        content: [
          {
            type: 'text' as const,
            text: jsonBlock('Log Query', {
              filters,
              returned: result.entries.length,
              preview,
            }),
          },
        ],
        structuredContent,
      };
    }
  );
}
