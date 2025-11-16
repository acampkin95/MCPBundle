export interface PanelStats {
  readonly total: number;
  readonly active: number;
  readonly inactive: number;
  readonly macVerificationRequired: number;
  readonly stale: number;
}

export interface CredentialPrintoutEntry {
  readonly agentName: string;
  readonly hostname: string;
  readonly macAddress: string;
  readonly status: string;
  readonly fingerprint: string;
  readonly lastHeartbeat: string;
  readonly lastDnsUpdate?: string;
  readonly heartbeatIntervalMs?: number | null;
  readonly serviceRole?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface LogSummary {
  readonly totals: {
    readonly rows: number;
    readonly errors: number;
    readonly security: number;
    readonly storageBytes: number;
  };
  readonly perService: readonly {
    readonly service: string;
    readonly lastSeen: string | null;
    readonly errors: number;
    readonly total: number;
  }[];
}

export interface LogEntry {
  readonly id: number;
  readonly service: string;
  readonly nodeId: string;
  readonly level: string;
  readonly category: string;
  readonly message: string;
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly repeatCount: number;
  readonly tags?: readonly string[];
  readonly investigationStatus?: string;
}

export interface LogsPayload {
  readonly entries: readonly LogEntry[];
  readonly nextCursor?: string;
}

export interface PanelOverviewPayload {
  readonly stats: PanelStats;
  readonly credentialPrintout: CredentialPrintoutEntry[];
  readonly logSummary?: LogSummary;
  readonly securityEvents?: readonly LogEntry[];
}

export interface StructuredThoughtsPayload {
  readonly summary: {
    readonly timeline: Array<{ id: string; stage: string; thought: string }>;
    readonly branches: Array<{ tag?: string; thoughts: unknown[] }>;
    readonly sources: Array<{ source: string; count: number }>;
    readonly progress: { percentage: number };
  };
  readonly diagnostics: Record<string, unknown>;
  readonly timeline?: Array<{ id: string; stage: string; thought: string; createdAt?: string }>;
  readonly rendered: string;
}

export interface PanelData {
  readonly overview: PanelOverviewPayload;
  readonly thoughts: StructuredThoughtsPayload;
  readonly logs: LogsPayload;
}

const defaultBaseUrl = process.env.PANEL_API_BASE_URL ?? 'http://localhost:3003';
const requestOptions: RequestInit = { cache: 'no-store' };
const emptyLogs: LogsPayload = { entries: [] };

export async function fetchPanelData(baseUrl: string = defaultBaseUrl): Promise<PanelData> {
  const [overviewRes, thoughtsRes, logsResult] = await Promise.all([
    fetch(`${baseUrl}/panel/overview`, requestOptions),
    fetch(`${baseUrl}/panel/structured-thoughts`, requestOptions),
    fetch(`${baseUrl}/panel/logs?limit=50`, requestOptions).catch((error: unknown) => error),
  ]);

  if (!overviewRes.ok) {
    throw new Error(`Failed to fetch panel overview: ${overviewRes.status}`);
  }
  if (!thoughtsRes.ok) {
    throw new Error(`Failed to fetch structured thoughts: ${thoughtsRes.status}`);
  }

  return {
    overview: (await overviewRes.json()) as PanelOverviewPayload,
    thoughts: (await thoughtsRes.json()) as StructuredThoughtsPayload,
    logs: await resolveLogsPayload(logsResult),
  };
}

async function resolveLogsPayload(result: Response | unknown): Promise<LogsPayload> {
  if (result instanceof Response) {
    if (!result.ok) {
      console.warn('[panelClient] Logs endpoint unavailable', { status: result.status });
      return emptyLogs;
    }
    return (await result.json()) as LogsPayload;
  }
  if (result instanceof Error) {
    console.warn('[panelClient] Logs fetch failed', result);
  } else if (result !== undefined) {
    console.warn('[panelClient] Logs fetch returned unexpected result', { result });
  }
  return emptyLogs;
}
