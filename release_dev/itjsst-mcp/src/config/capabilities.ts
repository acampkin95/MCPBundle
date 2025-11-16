export type Capability =
  | 'local-shell'
  | 'local-sudo'
  | 'macos-wireless'
  | 'ssh-linux'
  | 'ssh-mac'
  | 'winrm'
  | 'agent';

export interface CapabilityDescriptor {
  readonly name: Capability;
  readonly description: string;
}

export const CAPABILITIES: CapabilityDescriptor[] = [
  {
    name: 'local-shell',
    description:
      'Executes commands within the local container host shell without elevated privileges.',
  },
  {
    name: 'local-sudo',
    description: 'Requires privileged execution (sudo) on the local host.',
  },
  {
    name: 'macos-wireless',
    description: 'Needs direct access to macOS wireless tooling (airport, networkQuality).',
  },
  {
    name: 'ssh-linux',
    description: 'Requires outbound SSH access to Linux hosts.',
  },
  {
    name: 'ssh-mac',
    description: 'Requires outbound SSH access to macOS hosts.',
  },
  {
    name: 'winrm',
    description: 'Communicates with remote Windows hosts over WinRM / PowerShell remoting.',
  },
  {
    name: 'agent',
    description: 'Delegates execution to a registered remote agent.',
  },
];
