export type Capability =
  | 'local-shell'
  | 'local-sudo'
  | 'postgres-admin'
  | 'redis-admin'
  | 'keycloak-admin'
  | 'ubuntu-server';

export interface CapabilityDescriptor {
  readonly name: Capability;
  readonly description: string;
}

export const CAPABILITIES: CapabilityDescriptor[] = [
  {
    name: 'local-shell',
    description: 'Executes commands within the local server shell without elevated privileges.',
  },
  {
    name: 'local-sudo',
    description: 'Requires privileged execution (sudo) on the local server.',
  },
  {
    name: 'postgres-admin',
    description: 'Direct PostgreSQL management via pg client.',
  },
  {
    name: 'redis-admin',
    description: 'Direct Redis management via ioredis client.',
  },
  {
    name: 'keycloak-admin',
    description: 'Keycloak Admin API access.',
  },
  {
    name: 'ubuntu-server',
    description: 'Ubuntu server administration (packages, services, Docker, etc.).',
  },
];
