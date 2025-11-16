/**
 * Mock command data for testing
 */

export interface MockCommand {
  jobId: string;
  toolName: string;
  params: Record<string, unknown>;
  requestedCapabilities: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  targetAgentId?: string;
  maxRetries?: number;
}

export const MOCK_COMMANDS: MockCommand[] = [
  {
    jobId: 'job-001',
    toolName: 'postgres_query',
    params: { query: 'SELECT version()' },
    requestedCapabilities: ['postgres', 'database'],
    priority: 'normal',
  },
  {
    jobId: 'job-002',
    toolName: 'redis_get',
    params: { key: 'test-key' },
    requestedCapabilities: ['redis', 'cache'],
    priority: 'normal',
  },
  {
    jobId: 'job-003',
    toolName: 'keycloak_list_users',
    params: { realm: 'master' },
    requestedCapabilities: ['keycloak', 'auth'],
    priority: 'low',
  },
  {
    jobId: 'job-004',
    toolName: 'nginx_reload',
    params: {},
    requestedCapabilities: ['nginx', 'webserver'],
    priority: 'high',
  },
  {
    jobId: 'job-005',
    toolName: 'postgres_backup',
    params: { database: 'production' },
    requestedCapabilities: ['postgres', 'backup'],
    priority: 'urgent',
  },
];

export const HIGH_PRIORITY_COMMAND: MockCommand = {
  jobId: 'job-urgent-001',
  toolName: 'emergency_shutdown',
  params: { reason: 'security-incident' },
  requestedCapabilities: ['admin', 'emergency'],
  priority: 'urgent',
};

export const TARGETED_COMMAND: MockCommand = {
  jobId: 'job-targeted-001',
  toolName: 'postgres_query',
  params: { query: 'SELECT * FROM users' },
  requestedCapabilities: ['postgres'],
  targetAgentId: 'agent-postgres-01',
};

export const RETRY_COMMAND: MockCommand = {
  jobId: 'job-retry-001',
  toolName: 'flaky_operation',
  params: { shouldFail: true },
  requestedCapabilities: ['postgres'],
  maxRetries: 5,
};

/**
 * Generate N mock commands for load testing
 */
export function generateMockCommands(count: number): MockCommand[] {
  const commands: MockCommand[] = [];
  const tools = [
    { name: 'postgres_query', capabilities: ['postgres', 'database'] },
    { name: 'redis_get', capabilities: ['redis', 'cache'] },
    { name: 'keycloak_list_users', capabilities: ['keycloak', 'auth'] },
    { name: 'nginx_status', capabilities: ['nginx', 'webserver'] },
    { name: 'metrics_collect', capabilities: ['monitoring', 'metrics'] },
  ];

  const priorities: Array<'low' | 'normal' | 'high' | 'urgent'> = [
    'low',
    'normal',
    'normal',
    'normal',
    'high',
    'urgent',
  ];

  for (let i = 0; i < count; i++) {
    const tool = tools[i % tools.length];
    const priority = priorities[i % priorities.length];

    commands.push({
      jobId: `job-${String(i).padStart(6, '0')}`,
      toolName: tool.name,
      params: { index: i, timestamp: Date.now() },
      requestedCapabilities: tool.capabilities,
      priority,
    });
  }

  return commands;
}

/**
 * Create a command with specific characteristics
 */
export function createMockCommand(overrides: Partial<MockCommand> = {}): MockCommand {
  return {
    jobId: `job-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    toolName: 'default_tool',
    params: {},
    requestedCapabilities: ['default'],
    priority: 'normal',
    ...overrides,
  };
}
