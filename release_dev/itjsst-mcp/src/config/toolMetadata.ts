export interface ToolMetadataEntry {
  readonly id: string;
  readonly description: string;
  readonly requiredCapabilities: readonly string[];
  readonly estimatedDuration?: string;
  readonly recommendedPrivileges?: string;
  readonly supportsStreaming?: boolean;
}

const entries: ToolMetadataEntry[] = [
  {
    id: 'mac-permissions-overview',
    description:
      'Collects macOS admin membership, SecureToken holders, FileVault status, and TCC counts.',
    requiredCapabilities: ['local-shell'],
    estimatedDuration: '<10s',
    recommendedPrivileges: 'Standard user (sudo prompts handled automatically)',
  },
  {
    id: 'mac-permissions-audit',
    description: 'Evaluates macOS endpoint permissions and produces remediation guidance.',
    requiredCapabilities: ['local-shell'],
    estimatedDuration: '<15s',
    recommendedPrivileges: 'Standard user',
  },
  {
    id: 'mac-diagnostics',
    description:
      'Runs hardware, performance, security, network, or storage diagnostics locally or over SSH.',
    requiredCapabilities: ['local-shell'],
    estimatedDuration: '30-90s',
    recommendedPrivileges: 'Sudo recommended for full coverage',
    supportsStreaming: true,
  },
  {
    id: 'mac-diagnostics:repair',
    description: 'Runs macOS repair routines such as disk verification or cache flush.',
    requiredCapabilities: ['local-sudo'],
    estimatedDuration: '1-3m',
    recommendedPrivileges: 'Sudo',
  },
  {
    id: 'tool-metadata',
    description: 'Returns catalog metadata including required capabilities and estimated runtime.',
    requiredCapabilities: [],
    estimatedDuration: '<2s',
  },
];

export const TOOL_METADATA: Readonly<Record<string, ToolMetadataEntry>> = entries.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<string, ToolMetadataEntry>
);

export const listToolMetadata = (): readonly ToolMetadataEntry[] => entries.slice();

export const getToolMetadata = (id: string): ToolMetadataEntry | undefined => TOOL_METADATA[id];
