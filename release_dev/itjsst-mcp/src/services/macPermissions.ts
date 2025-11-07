import { CommandExecutionError, CommandRunner, type CommandResult } from "../utils/commandRunner.js";
import { shellQuote } from "../utils/shell.js";

export interface AdminGroupReport {
  readonly members: readonly string[];
  readonly raw: CommandResult;
}

export interface SecureTokenEntry {
  readonly user: string;
  readonly uuid: string;
}

export interface SecureTokenReport {
  readonly tokens: readonly SecureTokenEntry[];
  readonly raw: CommandResult;
}

export interface FileVaultReport {
  readonly enabled: boolean;
  readonly details: string;
  readonly raw: CommandResult;
}

export interface TccServiceCount {
  readonly service: string;
  readonly entries: number;
}

export interface TccSummaryReport {
  readonly services: readonly TccServiceCount[];
  readonly raw?: CommandResult;
}

export interface MacPermissionsOverview {
  readonly adminGroup: AdminGroupReport;
  readonly secureTokens: SecureTokenReport;
  readonly fileVault: FileVaultReport;
  readonly tccSummary: TccSummaryReport;
}

export type PermissionSeverity = "info" | "warning" | "critical";

export interface PermissionFinding {
  readonly severity: PermissionSeverity;
  readonly message: string;
  readonly remediation?: string;
}

export interface PermissionsAudit {
  readonly overview: MacPermissionsOverview;
  readonly findings: readonly PermissionFinding[];
  readonly riskScore: "low" | "medium" | "high";
}

export class MacPermissionsService {
  public constructor(private readonly runner: CommandRunner) {}

  public async collectOverview(): Promise<MacPermissionsOverview> {
    const [adminGroup, secureTokens, fileVault, tccSummary] = await Promise.all([
      this.getAdminGroup(),
      this.getSecureTokens(),
      this.getFileVaultStatus(),
      this.getTccSummary(),
    ]);

    return {
      adminGroup,
      secureTokens,
      fileVault,
      tccSummary,
    };
  }

  public async auditPermissions(): Promise<PermissionsAudit> {
    const overview = await this.collectOverview();
    const findings: PermissionFinding[] = [];

    if (!overview.fileVault.enabled) {
      findings.push({
        severity: "critical",
        message: "FileVault is disabled. Full-disk encryption should remain enabled on managed macOS devices.",
        remediation: "Enable FileVault: System Settings → Privacy & Security → FileVault → Turn On.",
      });
    }

    if (overview.secureTokens.tokens.length === 0) {
      findings.push({
        severity: "critical",
        message: "No SecureToken-enabled accounts detected; encryption bootstrap and password rotations may fail.",
        remediation: "Grant a SecureToken to at least one admin: `sysadminctl -secureTokenOn <user> -password <pw>`.",
      });
    }

    if (overview.adminGroup.members.length > 8) {
      findings.push({
        severity: "warning",
        message: `Admin group contains ${overview.adminGroup.members.length} members, exceeding the recommended maximum of 5.`,
        remediation: "Audit admin membership via System Settings → Users & Groups and remove unused accounts.",
      });
    }

    const guestAdmins = overview.adminGroup.members.filter((member) =>
      ["guest", "Guest", "_guest"].includes(member),
    );
    if (guestAdmins.length > 0) {
      findings.push({
        severity: "critical",
        message: "Guest account has administrator privileges.",
        remediation: "Disable Guest or remove it from the admin group: `sudo dscl . -delete /Groups/admin GroupMembers <guid>`.",
      });
    }

    const tccAccessibility = overview.tccSummary.services.find(
      (service) => service.service === "kTCCServiceAccessibility",
    );
    if (tccAccessibility && tccAccessibility.entries > 25) {
      findings.push({
        severity: "warning",
        message: `Accessibility permissions list ${tccAccessibility.entries} entries; review for stale automation.`,
        remediation: "Open System Settings → Privacy & Security → Accessibility to prune unused apps.",
      });
    }

    const riskScore = this.calculateRisk(findings);

    return {
      overview,
      findings,
      riskScore,
    };
  }

  public async getAdminGroup(): Promise<AdminGroupReport> {
    const command = "dscl . -read /Groups/admin GroupMembership";
    const result = await this.safeRun(command);
    const members = this.parseAdminGroup(result.stdout);
    return {
      members,
      raw: result,
    };
  }

  public async getSecureTokens(): Promise<SecureTokenReport> {
    const command = "fdesetup list";
    const result = await this.safeRun(command, true);
    const tokens = this.parseSecureTokens(result.stdout);
    return {
      tokens,
      raw: result,
    };
  }

  public async getFileVaultStatus(): Promise<FileVaultReport> {
    const command = "fdesetup status";
    const result = await this.safeRun(command, true);
    const normalized = result.stdout.trim().toLowerCase();
    const enabled = normalized.includes("filevault is on") || normalized.includes("filevault is enabled");
    return {
      enabled,
      details: result.stdout.trim() || result.stderr.trim(),
      raw: result,
    };
  }

  public async getTccSummary(): Promise<TccSummaryReport> {
    const dbPath = "/Library/Application Support/com.apple.TCC/TCC.db";
    const command = `sqlite3 ${shellQuote(dbPath)} "SELECT service, COUNT(*) FROM access GROUP BY service ORDER BY service"`;
    const result = await this.safeRun(command, true);

    if (result.code !== 0) {
      return {
        services: [],
        raw: result,
      };
    }

    const services = result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [service, count] = line.split("|");
        return {
          service,
          entries: Number.parseInt(count ?? "0", 10) || 0,
        };
      });

    return {
      services,
      raw: result,
    };
  }

  private parseAdminGroup(output: string): string[] {
    if (!output.trim()) {
      return [];
    }

    const lines = output.split(/\r?\n/).map((line) => line.trim());
    const membershipLine = lines.find((line) => line.startsWith("GroupMembership:"));
    if (!membershipLine) {
      return [];
    }

    return membershipLine
      .replace("GroupMembership:", "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  private parseSecureTokens(output: string): SecureTokenEntry[] {
    if (!output.trim()) {
      return [];
    }

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [user, uuid] = line.split(",");
        return {
          user: user?.trim() ?? "unknown",
          uuid: uuid?.trim() ?? "unknown",
        };
      });
  }

  private calculateRisk(findings: readonly PermissionFinding[]): "low" | "medium" | "high" {
    if (findings.some((item) => item.severity === "critical")) {
      return "high";
    }
    if (findings.some((item) => item.severity === "warning")) {
      return "medium";
    }
    return "low";
  }

  private async safeRun(command: string, requiresSudo: boolean = false): Promise<CommandResult> {
    try {
      return await this.runner.run(command, { requiresSudo });
    } catch (error) {
      if (error instanceof CommandExecutionError) {
        return error.result;
      }

      return {
        command,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        code: null,
      };
    }
  }
}
