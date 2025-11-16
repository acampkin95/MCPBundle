/**
 * windows-admin Tool Module
 * Category: admin
 * Auto-generated from registerTools.ts
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDependencies } from '../../registerTools.js';
import type { ToolModule } from '../types.js';
import { toTextContent, handleError } from '../utils.js';

export const WindowsAdminModule: ToolModule = {
  name: 'windows-admin',
  description: 'windows-admin tool',
  category: 'admin',
  tools: [
    {
      name: 'windows-admin',
      description: 'See tool registration for details',
      inputSchema: {},
      category: 'admin',
      tags: [],
    },
  ],

  register(server: McpServer, deps: ToolDependencies): void {
    server.registerTool(
    'windows-admin',
    {
      description:
        'Executes remote Windows administration via PowerShell remoting (requires pwsh/WinRM connectivity from the host).',
      inputSchema: {
        action: z.enum([
          'system-info',
          'service',
          'processes',
          'event-log',
          'disk',
          'network',
          'scheduled-tasks',
          'firewall',
          'run-script',
          'updates',
          'roles-features',
          'performance',
        ]),
        host: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
        passwordEnvVar: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default('WINDOWS_REMOTE_PASSWORD'),
        useSsl: z.boolean().default(false),
        port: z.number().int().min(1).max(65535).optional(),
        authentication: z
          .enum(['Default', 'Negotiate', 'Kerberos', 'Basic', 'Credssp'])
          .default('Default'),
        ignoreCertErrors: z.boolean().default(false),
        serviceName: z.string().optional(),
        serviceAction: z.enum(['status', 'start', 'stop', 'restart']).optional(),
        serviceForce: z.boolean().default(false),
        processName: z.string().optional(),
        processTop: z.number().int().min(1).max(50).default(10),
        processSort: z.enum(['cpu', 'memory']).default('cpu'),
        eventLogName: z.string().default('System'),
        eventMaxEntries: z.number().int().min(1).max(500).default(50),
        eventLevel: z.enum(['critical', 'error', 'warning', 'information', 'verbose']).optional(),
        eventId: z.number().int().optional(),
        eventProvider: z.string().optional(),
        includeRoutes: z.boolean().default(false),
        networkTestHost: z.string().optional(),
        taskNameFilter: z.string().optional(),
        taskStateFilter: z.enum(['Ready', 'Running', 'Disabled', 'Queued', 'Unknown']).optional(),
        firewallIncludeRules: z.boolean().default(false),
        firewallRuleName: z.string().optional(),
        firewallProfile: z.string().optional(),
        script: z.string().optional(),
        scriptExpectJson: z.boolean().default(false),
        updatesMode: z.enum(['list', 'install']).default('list'),
        updatesIncludeOptional: z.boolean().default(false),
        updatesCategories: z.array(z.string()).default([]),
        roleFeatureAction: z.enum(['list', 'install', 'remove']).default('list'),
        roleFeatureNames: z.array(z.string()).default([]),
        roleIncludeManagementTools: z.boolean().default(false),
        performanceSampleSeconds: z.number().int().min(1).max(30).default(5),
        performanceIncludeDisks: z.boolean().default(false),
        performanceIncludeNetwork: z.boolean().default(false),
      },
    },
    wrapWithPolicy(
      'windows-admin',
      'executeAdminAction',
      async ({
        action,
        host,
        username,
        password,
        passwordEnvVar,
        useSsl,
        port,
        authentication,
        ignoreCertErrors,
        serviceName,
        serviceAction,
        serviceForce,
        processName,
        processTop,
        processSort,
        eventLogName,
        eventMaxEntries,
        eventLevel,
        eventId,
        eventProvider,
        includeRoutes,
        networkTestHost,
        taskNameFilter,
        taskStateFilter,
        firewallIncludeRules,
        firewallRuleName,
        firewallProfile,
        script,
        scriptExpectJson,
        updatesMode,
        updatesIncludeOptional,
        updatesCategories,
        roleFeatureAction,
        roleFeatureNames,
        roleIncludeManagementTools,
        performanceSampleSeconds,
        performanceIncludeDisks,
        performanceIncludeNetwork,
      }) => {
        const capability = 'winrm' as const;
        const route = await deps.executionRouter.route(capability);
        if (route.kind === 'agent') {
          const response = await deps.remoteAgent.dispatch({
            tool: 'windows-admin',
            capability,
            payload: { action, host },
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: toTextContent('Windows Administration', {
                  Result:
                    response.status === 'accepted'
                      ? 'Delegated to remote agent.'
                      : `Remote agent unavailable: ${response.reason ?? 'unknown'}`,
                }),
              },
            ],
            structuredContent: {
              remoteAgent: response,
            },
          };
        }

        const connection = {
          host,
          username,
          password: password || undefined,
          passwordEnvVar,
          useSsl,
          port,
          authentication,
          ignoreCertErrors,
        };

        const sections: Record<string, string> = {};
        try {
          let response:
            | ReturnType<typeof deps.windowsAdmin.systemInfo>
            | ReturnType<typeof deps.windowsAdmin.serviceAction>
            | ReturnType<typeof deps.windowsAdmin.processSummary>
            | ReturnType<typeof deps.windowsAdmin.eventLog>
            | ReturnType<typeof deps.windowsAdmin.diskStatus>
            | ReturnType<typeof deps.windowsAdmin.networkStatus>
            | ReturnType<typeof deps.windowsAdmin.scheduledTasks>
            | ReturnType<typeof deps.windowsAdmin.firewallStatus>
            | ReturnType<typeof deps.windowsAdmin.runScript>;

          switch (action) {
            case 'system-info': {
              response = deps.windowsAdmin.systemInfo(connection);
              break;
            }
            case 'service': {
              if (!serviceName || !serviceAction) {
                throw new Error("Service action requires 'serviceName' and 'serviceAction'.");
              }
              response = deps.windowsAdmin.serviceAction({
                ...connection,
                service: serviceName,
                action: serviceAction,
                force: serviceForce,
              });
              break;
            }
            case 'processes': {
              response = deps.windowsAdmin.processSummary({
                ...connection,
                nameFilter: processName,
                top: processTop,
                sortBy: processSort,
              });
              break;
            }
            case 'event-log': {
              const levelMap: Record<string, 1 | 2 | 3 | 4 | 5> = {
                critical: 1,
                error: 2,
                warning: 3,
                information: 4,
                verbose: 5,
              };
              response = deps.windowsAdmin.eventLog({
                ...connection,
                logName: eventLogName,
                maxEvents: eventMaxEntries,
                level: eventLevel ? levelMap[eventLevel] : undefined,
                eventId,
                provider: eventProvider,
              });
              break;
            }
            case 'disk': {
              response = deps.windowsAdmin.diskStatus(connection);
              break;
            }
            case 'network': {
              response = deps.windowsAdmin.networkStatus({
                ...connection,
                includeRoutes,
                testHost: networkTestHost,
              });
              break;
            }
            case 'scheduled-tasks': {
              response = deps.windowsAdmin.scheduledTasks({
                ...connection,
                taskNameFilter,
                stateFilter: taskStateFilter,
              });
              break;
            }
            case 'firewall': {
              response = deps.windowsAdmin.firewallStatus({
                ...connection,
                includeRules: firewallIncludeRules,
                ruleNameFilter: firewallRuleName,
                profileFilter: firewallProfile,
              });
              break;
            }
            case 'run-script': {
              if (!script) {
                throw new Error("Custom PowerShell script requires 'script'.");
              }
              response = deps.windowsAdmin.runScript(script, connection, scriptExpectJson);
              break;
            }
            case 'updates': {
              response = deps.windowsAdmin.windowsUpdateAction({
                ...connection,
                mode: updatesMode,
                includeOptional: updatesIncludeOptional,
                categories: updatesCategories,
              });
              break;
            }
            case 'roles-features': {
              response = deps.windowsAdmin.rolesAndFeatures({
                ...connection,
                action: roleFeatureAction,
                featureNames: roleFeatureNames,
                includeManagementTools: roleIncludeManagementTools,
              });
              break;
            }
            case 'performance': {
              response = deps.windowsAdmin.performanceSnapshot({
                ...connection,
                sampleSeconds: performanceSampleSeconds,
                includeDisks: performanceIncludeDisks,
                includeNetwork: performanceIncludeNetwork,
              });
              break;
            }
            default:
              throw new Error(`Unsupported action: ${action satisfies never}`);
          }

          const resolved = await response;
          const structuredContent = {
            command: resolved.command,
            stdout: resolved.stdout,
            stderr: resolved.stderr,
            exitCode: resolved.code ?? null,
            data: 'json' in resolved ? resolved.json : undefined,
          };

          const data = 'json' in resolved ? resolved.json : undefined;

          switch (action) {
            case 'system-info': {
              const info = data as Record<string, unknown> | undefined;
              if (info) {
                const computer = info.ComputerSystem as Record<string, unknown> | undefined;
                const os = info.OS as Record<string, unknown> | undefined;
                const uptime = info.Uptime as Record<string, unknown> | undefined;
                const disks = Array.isArray(info.Disks) ? info.Disks : [];
                const hotfixes = Array.isArray(info.HotFixes) ? info.HotFixes : [];

                sections['Computer'] = [
                  `Name: ${info.ComputerName ?? '<unknown>'}`,
                  computer?.Model ? `Model: ${computer.Model}` : null,
                  computer?.Manufacturer ? `Vendor: ${computer.Manufacturer}` : null,
                  computer?.TotalPhysicalMemory
                    ? `Memory: ${Math.round(Number(computer.TotalPhysicalMemory) / 1024 ** 3)} GB`
                    : null,
                ]
                  .filter(Boolean)
                  .join('\n');

                if (os) {
                  sections['Operating system'] = [
                    os.Caption ? String(os.Caption) : undefined,
                    os.Version ? `Version: ${os.Version}` : undefined,
                    os.BuildNumber ? `Build: ${os.BuildNumber}` : undefined,
                    os.LastBootUpTime ? `Last boot: ${os.LastBootUpTime}` : undefined,
                  ]
                    .filter(Boolean)
                    .join('\n');
                }

                if (uptime) {
                  sections['Uptime'] = [
                    `Days: ${uptime.Days ?? '-'}`,
                    `Hours: ${uptime.Hours ?? '-'}`,
                    `Minutes: ${uptime.Minutes ?? '-'}`,
                  ].join('\n');
                }

                if (disks.length) {
                  sections['Disks'] = disks
                    .map((disk) => {
                      const volume = disk as Record<string, unknown>;
                      const label = volume.VolumeName ? ` (${volume.VolumeName})` : '';
                      return `${volume.DeviceID ?? volume.DriveLetter ?? '?'}${label}: ${volume.FreeGB ?? '?'} GB free / ${volume.SizeGB ?? '?'} GB (${volume.FreePercent ?? '?'}%)`;
                    })
                    .join('\n');
                }

                if (hotfixes.length) {
                  sections['Recent hotfixes'] = hotfixes
                    .map((patch) => {
                      const item = patch as Record<string, unknown>;
                      return `${item.HotFixID ?? '<id unknown>'} - ${item.Description ?? 'n/a'} (${item.InstalledOn ?? 'date unknown'})`;
                    })
                    .join('\n');
                }
              }
              break;
            }
            case 'service': {
              const service = (data ?? {}) as Record<string, unknown>;
              sections['Service'] = [
                `Name: ${service.Name ?? service.DisplayName ?? serviceName}`,
                `Status: ${service.Status ?? 'n/a'}`,
                service.StartType ? `Start type: ${service.StartType}` : null,
                service.RunAs ? `Logon: ${service.RunAs}` : null,
              ]
                .filter(Boolean)
                .join('\n');
              break;
            }
            case 'processes': {
              const list = Array.isArray(data) ? data : [];
              sections['Top processes'] = list
                .map((proc) => {
                  const item = proc as Record<string, unknown>;
                  const cpu = item.CPU != null ? `CPU: ${item.CPU}` : '';
                  const memory = item.MemoryMB != null ? `Mem: ${item.MemoryMB} MB` : '';
                  return `${item.Name ?? '?'} (PID ${item.Id ?? '?'}) ${cpu} ${memory}`.trim();
                })
                .join('\n');
              break;
            }
            case 'event-log': {
              const events = Array.isArray(data) ? data : [];
              sections['Events'] = events
                .slice(0, 10)
                .map((evt) => {
                  const item = evt as Record<string, unknown>;
                  return `${item.TimeCreated ?? ''} [${item.LevelDisplayName ?? item.Level ?? ''}] ${item.Id ?? ''} ${item.ProviderName ?? ''}\n${String(item.Message ?? '').slice(0, 400)}`;
                })
                .join('\n---\n');
              break;
            }
            case 'disk': {
              const diskData = (data ?? {}) as Record<string, unknown>;
              const volumes = Array.isArray(diskData.Volumes) ? diskData.Volumes : [];
              const physical = Array.isArray(diskData.PhysicalDisks) ? diskData.PhysicalDisks : [];
              if (volumes.length) {
                sections['Volumes'] = volumes
                  .map((vol) => {
                    const item = vol as Record<string, unknown>;
                    return `${item.DriveLetter ?? '?'}: ${item.FreeGB ?? '?'} GB free / ${item.SizeGB ?? '?'} GB (${item.FreePercent ?? '?'}%)`;
                  })
                  .join('\n');
              }
              if (physical.length) {
                sections['Physical disks'] = physical
                  .map((disk) => {
                    const item = disk as Record<string, unknown>;
                    const sizeGb =
                      item.Size != null ? `${Math.round(Number(item.Size) / 1024 ** 3)} GB` : 'n/a';
                    return `${item.FriendlyName ?? 'disk'} (${item.MediaType ?? 'media'}) - ${sizeGb}, ${item.HealthStatus ?? '?'}/${item.OperationalStatus ?? '?'}`;
                  })
                  .join('\n');
              }
              break;
            }
            case 'network': {
              const net = (data ?? {}) as Record<string, unknown>;
              const adapters = Array.isArray(net.Adapters) ? net.Adapters : [];
              const addresses = Array.isArray(net.Addresses) ? net.Addresses : [];
              if (adapters.length) {
                sections['Adapters'] = adapters
                  .map((adapter) => {
                    const item = adapter as Record<string, unknown>;
                    return `${item.Name ?? '?'} (${item.Status ?? '?'}) ${item.LinkSpeed ?? ''}`;
                  })
                  .join('\n');
              }
              if (addresses.length) {
                sections['Addresses'] = addresses
                  .map((addr) => {
                    const item = addr as Record<string, unknown>;
                    return `${item.InterfaceAlias ?? '?'}: ${item.IPAddress ?? '?'}/${item.PrefixLength ?? '?'} (${item.AddressFamily ?? '?'})`;
                  })
                  .join('\n');
              }
              if (net.ConnectivityTest) {
                sections['Test connection'] = JSON.stringify(net.ConnectivityTest, null, 2);
              }
              break;
            }
            case 'scheduled-tasks': {
              const tasks = Array.isArray(data) ? data : [];
              sections['Scheduled tasks'] = tasks
                .slice(0, 15)
                .map((task) => {
                  const item = task as Record<string, unknown>;
                  return `${item.TaskPath ?? ''}${item.TaskName ?? ''} (${item.State ?? '?'})\nLast: ${item.LastRunTime ?? '?'} | Next: ${item.NextRunTime ?? '?'} | Result: ${item.LastTaskResult ?? '?'}`;
                })
                .join('\n---\n');
              break;
            }
            case 'firewall': {
              const fw = (data ?? {}) as Record<string, unknown>;
              const profiles = Array.isArray(fw.Profiles) ? fw.Profiles : [];
              const rules = Array.isArray(fw.Rules) ? fw.Rules : [];
              if (profiles.length) {
                sections['Profiles'] = profiles
                  .map((profile) => {
                    const item = profile as Record<string, unknown>;
                    return `${item.Name ?? 'Profile'}: Enabled=${item.Enabled ?? '?'}, Inbound=${item.DefaultInboundAction ?? '?'}, Outbound=${item.DefaultOutboundAction ?? '?'}`;
                  })
                  .join('\n');
              }
              if (rules.length) {
                sections['Sample rules'] = rules
                  .slice(0, 20)
                  .map((rule) => {
                    const item = rule as Record<string, unknown>;
                    return `${item.DisplayName ?? 'rule'} (${item.Direction ?? '?'} / ${item.Action ?? '?'})`;
                  })
                  .join('\n');
              }
              break;
            }
            case 'run-script': {
              if (scriptExpectJson && data) {
                sections['Script output'] = JSON.stringify(data, null, 2);
              } else {
                sections['Script output'] = resolved.stdout.trim() || '<no output>';
              }
              break;
            }
            case 'updates': {
              const updateData = (data ?? {}) as Record<string, unknown>;
              const updates = Array.isArray(updateData.Updates) ? updateData.Updates : [];
              sections['Updates'] = updates
                .slice(0, 10)
                .map((item) => {
                  const update = item as Record<string, unknown>;
                  const kb = update.KB ? `KB: ${update.KB}` : '';
                  const severity = update.Severity ? `Severity: ${update.Severity}` : '';
                  return `${update.Title ?? 'Update'} ${kb} ${severity}`.trim();
                })
                .join('\n');
              if (updateData.InstallSummary) {
                sections['Install summary'] = JSON.stringify(updateData.InstallSummary, null, 2);
              }
              break;
            }
            case 'roles-features': {
              if (Array.isArray(data)) {
                sections['Roles & Features'] = data
                  .map((item) => {
                    const feature = item as Record<string, unknown>;
                    return `${feature.Name ?? 'Feature'}: ${feature.Installed ?? false}`;
                  })
                  .join('\n');
              } else if (data) {
                sections['Roles & Features'] = JSON.stringify(data, null, 2);
              } else {
                sections['Roles & Features'] = resolved.stdout.trim() || '<no output>';
              }
              break;
            }
            case 'performance': {
              if (data) {
                sections['Performance'] = JSON.stringify(data, null, 2);
              } else {
                sections['Performance'] = resolved.stdout.trim() || '<no output>';
              }
              break;
            }
            default:
              sections['Output'] = resolved.stdout.trim() || '<no output>';
          }

          if (!Object.keys(sections).length) {
            sections['Output'] = resolved.stdout.trim() || '<no output>';
          }

          safeCaptureReport(deps.reportingHub, {
            tool: 'windows-admin',
            summary: `Windows action '${action}' executed for ${host}`,
            sections,
            tags: ['windows', action],
            importance: action === 'updates' && updatesMode === 'install' ? 'high' : 'medium',
            devOpsCategory: 'windows',
            executionContext: `host=${host}`,
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: toTextContent('Windows Administration', sections),
              },
            ],
            structuredContent,
          };
        } catch (error) {
          return handleError(error);
        }
      },
      ['winrm', 'system-modify'] // Required capabilities for Windows admin
    )
  );
  },
};
