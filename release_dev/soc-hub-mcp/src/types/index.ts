/**
 * SOC Hub MCP - Type Definitions
 * Unified types for all SOC services and data structures
 */

export interface WazuhAlert {
  id: string;
  timestamp: string;
  agent: {
    id: string;
    name: string;
    ip: string;
  };
  rule: {
    id: string;
    level: number;
    description: string;
    groups: string[];
    mitre?: {
      id: string[];
      tactic: string[];
      technique: string[];
    };
  };
  data?: Record<string, unknown>;
  location?: string;
  full_log?: string;
}

export interface WazuhAgent {
  id: string;
  name: string;
  ip: string;
  status: 'active' | 'disconnected' | 'never_connected' | 'pending';
  os: {
    platform: string;
    name: string;
    version: string;
  };
  version?: string;
  last_keep_alive?: string;
  manager?: string;
}

export interface ElasticsearchAlert {
  _index: string;
  _id: string;
  _source: {
    '@timestamp': string;
    event?: {
      kind?: string;
      category?: string[];
      type?: string[];
      severity?: number;
    };
    message?: string;
    source?: {
      ip?: string;
      port?: number;
    };
    destination?: {
      ip?: string;
      port?: number;
    };
    [key: string]: unknown;
  };
}

export interface TheHiveCase {
  id: string;
  _id: string;
  caseId: number;
  title: string;
  description: string;
  severity: number; // 1=Low, 2=Medium, 3=High, 4=Critical
  status: 'Open' | 'Resolved' | 'Deleted';
  stage: string;
  startDate: number;
  endDate?: number;
  tags: string[];
  flag: boolean;
  tlp: number; // 0=White, 1=Green, 2=Amber, 3=Red
  pap: number;
  owner?: string;
  customFields: Record<string, unknown>;
  stats?: {
    observables?: number;
    tasks?: number;
  };
}

export interface TheHiveAlert {
  id: string;
  _id: string;
  type: string;
  source: string;
  sourceRef: string;
  title: string;
  description: string;
  severity: number;
  date: number;
  tags: string[];
  tlp: number;
  status: 'New' | 'Updated' | 'Ignored' | 'Imported';
  follow: boolean;
  customFields: Record<string, unknown>;
}

export interface CortexAnalyzer {
  id: string;
  name: string;
  version: string;
  dataTypeList: string[];
  description: string;
  author: string;
}

export interface SuricataAlert {
  timestamp: string;
  event_type: 'alert';
  src_ip: string;
  src_port: number;
  dest_ip: string;
  dest_port: number;
  proto: string;
  alert: {
    action: string;
    gid: number;
    signature_id: number;
    rev: number;
    signature: string;
    category: string;
    severity: number;
  };
  flow?: {
    pkts_toserver: number;
    pkts_toclient: number;
    bytes_toserver: number;
    bytes_toclient: number;
  };
}

export interface FalcoAlert {
  output: string;
  priority: 'Emergency' | 'Alert' | 'Critical' | 'Error' | 'Warning' | 'Notice' | 'Informational' | 'Debug';
  rule: string;
  time: string;
  output_fields: Record<string, unknown>;
  source: string;
  tags: string[];
  hostname?: string;
}

export interface CrowdSecDecision {
  id: number;
  origin: string;
  type: 'ban' | 'captcha' | 'throttle';
  scope: string;
  value: string;
  duration: string;
  scenario: string;
  simulated: boolean;
  created_at: string;
  expires_at?: string;
}

export interface SystemMetrics {
  hostname: string;
  timestamp: string;
  cpu: {
    usage: number;
    cores: number;
    load_avg: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage_percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage_percent: number;
  };
  network: {
    rx_bytes: number;
    tx_bytes: number;
    rx_packets: number;
    tx_packets: number;
  };
}

export interface SOCDashboardData {
  timestamp: string;
  overview: {
    total_alerts: number;
    critical_alerts: number;
    agents_active: number;
    agents_disconnected: number;
    open_cases: number;
    threat_level: 'low' | 'medium' | 'high' | 'critical';
  };
  recent_alerts: (WazuhAlert | ElasticsearchAlert | SuricataAlert | FalcoAlert)[];
  agent_status: WazuhAgent[];
  active_cases: TheHiveCase[];
  threat_intel: {
    banned_ips: number;
    active_decisions: CrowdSecDecision[];
    top_scenarios: Array<{ scenario: string; count: number }>;
  };
  system_health: {
    vmi01: SystemMetrics;
    vmi02d: SystemMetrics;
    vmi03: SystemMetrics;
  };
}

export interface AlertFilter {
  severity?: number[];
  agent_id?: string[];
  rule_groups?: string[];
  time_range?: {
    from: string;
    to: string;
  };
  search?: string;
  limit?: number;
  offset?: number;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    cached?: boolean;
    cache_expires?: string;
  };
}

export interface WebSocketMessage {
  type: 'alert' | 'agent_status' | 'case_update' | 'metric_update' | 'threat_intel';
  data: unknown;
  timestamp: string;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  last_check: string;
  response_time_ms?: number;
  error?: string;
}

export interface SOCConfig {
  wazuh: {
    url: string;
    user: string;
    password: string;
    verify_ssl: boolean;
  };
  elasticsearch: {
    url: string;
    user: string;
    password: string;
  };
  thehive: {
    url: string;
    api_key: string;
  };
  cortex: {
    url: string;
    api_key: string;
  };
  cache: {
    ttl: {
      alerts: number;
      agents: number;
      cases: number;
    };
  };
}
