/**
 * Mock agent data for testing
 */

export interface MockAgent {
  agentId: string;
  capabilities: string[];
  version: string;
  status: 'online' | 'offline' | 'degraded';
  load: number;
  lastHeartbeat?: Date;
}

export const MOCK_AGENTS: MockAgent[] = [
  {
    agentId: 'agent-postgres-01',
    capabilities: ['postgres', 'database', 'backup', 'monitoring'],
    version: '1.0.0',
    status: 'online',
    load: 0.25,
    lastHeartbeat: new Date(),
  },
  {
    agentId: 'agent-redis-01',
    capabilities: ['redis', 'cache', 'monitoring'],
    version: '1.0.0',
    status: 'online',
    load: 0.15,
    lastHeartbeat: new Date(),
  },
  {
    agentId: 'agent-keycloak-01',
    capabilities: ['keycloak', 'auth', 'user-management'],
    version: '1.0.0',
    status: 'online',
    load: 0.10,
    lastHeartbeat: new Date(),
  },
  {
    agentId: 'agent-nginx-01',
    capabilities: ['nginx', 'webserver', 'reverse-proxy'],
    version: '1.0.0',
    status: 'online',
    load: 0.30,
    lastHeartbeat: new Date(),
  },
  {
    agentId: 'agent-multi-01',
    capabilities: ['postgres', 'redis', 'monitoring', 'backup'],
    version: '1.0.0',
    status: 'online',
    load: 0.50,
    lastHeartbeat: new Date(),
  },
];

export const DEGRADED_AGENT: MockAgent = {
  agentId: 'agent-degraded-01',
  capabilities: ['postgres', 'database'],
  version: '1.0.0',
  status: 'degraded',
  load: 0.85,
  lastHeartbeat: new Date(Date.now() - 60000), // 1 minute ago
};

export const OFFLINE_AGENT: MockAgent = {
  agentId: 'agent-offline-01',
  capabilities: ['redis', 'cache'],
  version: '1.0.0',
  status: 'offline',
  load: 0,
  lastHeartbeat: new Date(Date.now() - 300000), // 5 minutes ago
};

export const OVERLOADED_AGENT: MockAgent = {
  agentId: 'agent-overload-01',
  capabilities: ['postgres', 'database'],
  version: '1.0.0',
  status: 'online',
  load: 0.95,
  lastHeartbeat: new Date(),
};

/**
 * Generate N mock agents for load testing
 */
export function generateMockAgents(count: number): MockAgent[] {
  const agents: MockAgent[] = [];
  const capabilities = [
    ['postgres', 'database'],
    ['redis', 'cache'],
    ['keycloak', 'auth'],
    ['nginx', 'webserver'],
    ['monitoring', 'metrics'],
  ];

  for (let i = 0; i < count; i++) {
    const capIndex = i % capabilities.length;
    agents.push({
      agentId: `agent-${String(i).padStart(4, '0')}`,
      capabilities: capabilities[capIndex],
      version: '1.0.0',
      status: 'online',
      load: Math.random() * 0.8, // Random load 0-80%
      lastHeartbeat: new Date(),
    });
  }

  return agents;
}
