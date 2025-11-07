import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";
import { SshService, type SshExecutionOptions } from "./ssh.js";

export type DiagnosticSuite =
  | "hardware"
  | "performance"
  | "security"
  | "network"
  | "storage";

export type RepairAction =
  | "disk-verify"
  | "disk-repair"
  | "reset-spotlight"
  | "flush-cache"
  | "software-update"
  | "rebuild-permissions";

export interface DiagnosticsResult {
  readonly label: string;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface RemoteMacOptions extends SshExecutionOptions {
  readonly host: string;
  readonly username: string;
}

const SUITE_COMMANDS: Record<DiagnosticSuite, Array<{ label: string; command: string; requiresSudo?: boolean }>> = {
  hardware: [
    { label: "Hardware profile", command: "system_profiler SPHardwareDataType" },
    { label: "Power profile", command: "system_profiler SPPowerDataType" },
    { label: "Thermal sensors", command: "pmset -g thermlog" },
  ],
  performance: [
    { label: "CPU / Power metrics", command: "sudo powermetrics --show-process-energy -n 1", requiresSudo: true },
    { label: "Top processes", command: "top -l 1 -n 20" },
    { label: "Disk usage spikes", command: "sudo fs_usage -w -t 5", requiresSudo: true },
  ],
  security: [
    { label: "FileVault", command: "fdesetup status" },
    { label: "Gatekeeper", command: "spctl --status" },
    {
      label: "Application firewall",
      command: "defaults read /Library/Preferences/com.apple.alf globalstate",
      requiresSudo: true,
    },
    {
      label: "Recent security logs",
      command: "log show --last 1h --predicate 'subsystem CONTAINS \"com.apple.security\"' --info",
      requiresSudo: true,
    },
  ],
  network: [
    { label: "Interface status", command: "ifconfig" },
    { label: "Active sockets", command: "netstat -an" },
    { label: "Proxy settings", command: "scutil --proxy" },
    {
      label: "Network logs",
      command: "log show --last 30m --predicate 'subsystem == \"com.apple.network\"'",
      requiresSudo: true,
    },
  ],
  storage: [
    { label: "Disk usage", command: "df -h" },
    { label: "APFS list", command: "diskutil apfs list" },
    { label: "Volume verify", command: "sudo diskutil verifyVolume /", requiresSudo: true },
  ],
};

const REPAIR_COMMANDS: Record<RepairAction, { label: string; command: string; requiresSudo?: boolean }> = {
  "disk-verify": { label: "Verify disk", command: "diskutil verifyVolume /" },
  "disk-repair": { label: "Repair disk", command: "diskutil repairVolume /", requiresSudo: true },
  "reset-spotlight": { label: "Reset Spotlight", command: "mdutil -E /", requiresSudo: true },
  "flush-cache": {
    label: "Flush DNS & directory cache",
    command: "dscacheutil -flushcache && killall -HUP mDNSResponder",
    requiresSudo: true,
  },
  "software-update": {
    label: "Software Update",
    command: "softwareupdate --install --all",
    requiresSudo: true,
  },
  "rebuild-permissions": {
    label: "Reset user permissions",
    command: "diskutil resetUserPermissions / `id -u`",
    requiresSudo: true,
  },
};

interface DiagnosticsBaselineEntry {
  readonly label: string;
  readonly command: string;
  readonly hash: string;
  readonly capturedAt: string;
}

interface DiagnosticsBaseline {
  readonly suite: DiagnosticSuite;
  readonly entries: DiagnosticsBaselineEntry[];
  readonly capturedAt: string;
}

export interface DiagnosticsComparison {
  readonly label: string;
  readonly changed: boolean;
  readonly previousHash?: string;
  readonly currentHash: string;
  readonly previousSample?: string;
  readonly currentSample: string;
}

export interface DiagnosticsRunOutput {
  readonly results: DiagnosticsResult[];
  readonly comparisons?: DiagnosticsComparison[];
  readonly baselinePath?: string;
  readonly baselineUpdated?: boolean;
  readonly cacheHit?: boolean;
}

export class MacDiagnosticsService {
  private readonly cache = new Map<
    DiagnosticSuite,
    { timestamp: number; results: DiagnosticsResult[] }
  >();

  public constructor(private readonly runner: CommandRunner, private readonly ssh: SshService) {}

  public listSuites(): DiagnosticSuite[] {
    return Object.keys(SUITE_COMMANDS) as DiagnosticSuite[];
  }

  public listRepairs(): RepairAction[] {
    return Object.keys(REPAIR_COMMANDS) as RepairAction[];
  }

  public async runLocalDiagnostics(suite: DiagnosticSuite): Promise<DiagnosticsResult[]> {
    return (await this.runLocalDiagnosticsWithBaseline({ suite })).results;
  }

  public async runRemoteDiagnostics(options: RemoteMacOptions & { suite: DiagnosticSuite }): Promise<DiagnosticsResult[]> {
    const commands = SUITE_COMMANDS[options.suite];
    return this.runRemoteCommands(options, commands);
  }

  public async runLocalRepair(action: RepairAction): Promise<DiagnosticsResult[]> {
    const command = REPAIR_COMMANDS[action];
    return this.runLocalCommands([command]);
  }

  public async runRemoteRepair(options: RemoteMacOptions & { action: RepairAction }): Promise<DiagnosticsResult[]> {
    const command = REPAIR_COMMANDS[options.action];
    return this.runRemoteCommands(options, [command]);
  }

  public async runLocalDiagnosticsWithBaseline(options: {
    readonly suite: DiagnosticSuite;
    readonly baselinePath?: string;
    readonly compareBaseline?: boolean;
    readonly updateBaseline?: boolean;
    readonly cacheTtlSeconds?: number;
  }): Promise<DiagnosticsRunOutput> {
    const commands = SUITE_COMMANDS[options.suite];

    const ttlMs = options.cacheTtlSeconds ? Math.max(options.cacheTtlSeconds, 0) * 1000 : 0;
    let results: DiagnosticsResult[] | undefined;
    let cacheHit = false;

    if (ttlMs > 0) {
      const cached = this.cache.get(options.suite);
      if (cached && Date.now() - cached.timestamp <= ttlMs) {
        // clone to avoid mutation
        results = cached.results.map((entry) => ({ ...entry }));
        cacheHit = true;
      }
    }

    if (!results) {
      const fresh = await this.runLocalCommands(commands);
      if (ttlMs > 0) {
        this.cache.set(options.suite, { timestamp: Date.now(), results: fresh.map((entry) => ({ ...entry })) });
      }
      results = fresh;
    }

    const compare = options.compareBaseline ?? false;
    const update = options.updateBaseline ?? false;
    const shouldTouchBaseline = compare || update;

    if (!shouldTouchBaseline && !options.baselinePath) {
      return { results };
    }

    const baselinePath = this.resolveBaselinePath(options.suite, options.baselinePath);
    let baseline: DiagnosticsBaseline | undefined;

    if (compare) {
      baseline = await this.loadBaseline(baselinePath);
    }

    const comparisons = compare ? this.compareAgainstBaseline(results, baseline) : undefined;

    let baselineUpdated = false;
    if (update) {
      await this.saveBaseline(baselinePath, options.suite, results);
      baselineUpdated = true;
    }

    return {
      results,
      comparisons,
      baselinePath: baselinePath,
      baselineUpdated,
      cacheHit,
    };
  }

  private async runLocalCommands(commands: Array<{ label: string; command: string; requiresSudo?: boolean }>): Promise<DiagnosticsResult[]> {
    const results: DiagnosticsResult[] = [];
    for (const item of commands) {
      const result = await this.runner.run(item.command, { requiresSudo: item.requiresSudo ?? false });
      results.push(this.formatResult(item.label, result));
    }
    return results;
  }

  private async runRemoteCommands(
    options: RemoteMacOptions,
    commands: Array<{ label: string; command: string; requiresSudo?: boolean }>,
  ): Promise<DiagnosticsResult[]> {
    const results: DiagnosticsResult[] = [];
    const sshOptions: SshExecutionOptions = {
      port: options.port,
      identityFile: options.identityFile,
      knownHostsFile: options.knownHostsFile,
      extraOptions: options.extraOptions,
      allocateTty: options.allocateTty,
      timeoutSeconds: options.timeoutSeconds,
    };

    for (const item of commands) {
      const remoteCommand = item.requiresSudo ? `sudo ${item.command}` : item.command;
      const result = await this.ssh.execute(
        {
          host: options.host,
          username: options.username,
          command: remoteCommand,
        },
        sshOptions,
      );
      results.push(this.formatResult(item.label, result));
    }
    return results;
  }

  private formatResult(label: string, result: CommandResult): DiagnosticsResult {
    return {
      label,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
    };
  }

  private resolveBaselinePath(suite: DiagnosticSuite, requestedPath?: string): string {
    if (requestedPath?.trim()) {
      const trimmed = requestedPath.trim();
      return isAbsolute(trimmed) ? trimmed : resolve(process.cwd(), trimmed);
    }
    const directory = join(process.cwd(), ".mcp", "baselines", "mac");
    const filename = `${suite}.json`;
    return join(directory, filename);
  }

  private compareAgainstBaseline(results: DiagnosticsResult[], baseline?: DiagnosticsBaseline): DiagnosticsComparison[] {
    const baselineMap = new Map<string, DiagnosticsBaselineEntry>();
    if (baseline?.entries) {
      for (const entry of baseline.entries) {
        baselineMap.set(entry.label, entry);
      }
    }

    return results.map((result) => {
      const currentHash = this.hashOutput(result.stdout);
      const sample = result.stdout.trim().slice(0, 500);
      const previous = baselineMap.get(result.label);

      return {
        label: result.label,
        changed: previous ? previous.hash !== currentHash : true,
        previousHash: previous?.hash,
        currentHash,
        previousSample: previous ? `hash=${previous.hash}` : undefined,
        currentSample: sample,
      };
    });
  }

  private async loadBaseline(path: string): Promise<DiagnosticsBaseline | undefined> {
    try {
      const file = await readFile(path, "utf8");
      const parsed = JSON.parse(file) as DiagnosticsBaseline;
      return parsed;
    } catch {
      return undefined;
    }
  }

  private async saveBaseline(path: string, suite: DiagnosticSuite, results: DiagnosticsResult[]): Promise<void> {
    const entries: DiagnosticsBaselineEntry[] = results.map((result) => ({
      label: result.label,
      command: result.command,
      hash: this.hashOutput(result.stdout),
      capturedAt: new Date().toISOString(),
    }));

    const baseline: DiagnosticsBaseline = {
      suite,
      entries,
      capturedAt: new Date().toISOString(),
    };

    await this.ensureDirectory(path);
    await writeFile(path, JSON.stringify(baseline, null, 2), "utf8");
  }

  private hashOutput(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private async ensureDirectory(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
  }
}
