import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface System {
  readonly id: string;
  readonly name: string;
  readonly os: string;
  readonly patchLevel?: string;
  readonly lastPatched?: string;
  readonly mfaEnabled?: boolean;
  readonly applicationControl?: boolean;
  readonly hardeningBaseline?: string;
  readonly backupStatus?: "healthy" | "warning" | "failed";
  readonly loggingStatus?: "centralised" | "local-only" | "missing";
  readonly internetFacing?: boolean;
}

export interface Control {
  readonly id: string;
  readonly family: string;
  readonly description: string;
  readonly implemented?: boolean;
  readonly evidence?: string[];
}

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly details: string;
  readonly remediation?: string;
  readonly evidence?: string[];
}

export interface EssentialEightChecklistItem {
  readonly area:
    | "Application control"
    | "Patch applications"
    | "Configure Microsoft Office macro settings"
    | "User application hardening"
    | "Restrict administrative privileges"
    | "Patch operating systems"
    | "Multi-factor authentication"
    | "Regular backups";
  readonly compliant: boolean;
  readonly evidence?: string[];
  readonly remediation?: string;
  readonly impactedSystems: readonly string[];
}

export interface EssentialEightAuditResult {
  readonly checklist: EssentialEightChecklistItem[];
  readonly overallScore: number;
  readonly summary: string;
}

export interface NistValidationResult {
  readonly framework: "NIST CSF" | "NIST 800-53";
  readonly coverage: number;
  readonly gaps: Array<{
    readonly controlId: string;
    readonly description: string;
    readonly remediation: string;
  }>;
  readonly evidenceRequests: string[];
}

export interface EvidencePackage {
  readonly id: string;
  readonly files: readonly string[];
  readonly instructions: readonly string[];
  readonly location: string;
}

export class ComplianceAuditService {
  public constructor(private readonly evidenceRoot: string = resolve(process.cwd(), "evidence")) {}

  public auditEssential8(systems: System[]): EssentialEightAuditResult {
    const checklist: EssentialEightChecklistItem[] = [
      this.buildApplicationControlCheck(systems),
      this.buildPatchApplicationsCheck(systems),
      this.buildOfficeMacroCheck(systems),
      this.buildUserApplicationHardeningCheck(systems),
      this.buildAdminPrivilegeCheck(systems),
      this.buildPatchOperatingSystemCheck(systems),
      this.buildMfaCheck(systems),
      this.buildBackupCheck(systems),
    ];

    const overallScore =
      (checklist.filter((item) => item.compliant).length / checklist.length) * 100;

    const summaryLines = [
      `Compliant items: ${checklist.filter((item) => item.compliant).length} / ${checklist.length}`,
      `Average compliance: ${overallScore.toFixed(1)}%`,
    ];

    const nonCompliant = checklist.filter((item) => !item.compliant);
    if (nonCompliant.length) {
      summaryLines.push(
        "",
        "Priority remediation areas:",
        ...nonCompliant.map((item) => `- ${item.area}: ${item.remediation ?? "Add remediation plan"}`),
      );
    }

    return {
      checklist,
      overallScore,
      summary: summaryLines.join("\n"),
    };
  }

  public validateNIST(
    controls: Control[],
    framework: "NIST CSF" | "NIST 800-53" = "NIST CSF",
  ): NistValidationResult {
    const implemented = controls.filter((control) => control.implemented);
    const coverage = controls.length === 0 ? 0 : (implemented.length / controls.length) * 100;

    const gaps = controls
      .filter((control) => !control.implemented)
      .map((control) => ({
        controlId: control.id,
        description: control.description,
        remediation: `Implement control ${control.id} to address ${control.family} requirements.`,
      }));

    const evidenceRequests = controls
      .filter((control) => control.implemented && (!control.evidence || control.evidence.length === 0))
      .map(
        (control) =>
          `Provide evidence for control ${control.id} (${control.family}) such as configuration exports or screenshots.`,
      );

    return {
      framework,
      coverage,
      gaps,
      evidenceRequests,
    };
  }

  public async generateEvidencePackage(findings: Finding[], name?: string): Promise<EvidencePackage> {
    const id =
      name ??
      `evidence-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}`;
    const targetDir = join(this.evidenceRoot, id);
    await mkdir(targetDir, { recursive: true });

    const instructions: string[] = [
      "Collect supporting artefacts for each finding:",
      "- Export relevant configuration files (firewall, IAM, system policies).",
      "- Capture screenshots demonstrating remediation or existing controls.",
      "- Provide CLI command outputs where applicable (e.g., patch levels, MFA status).",
    ];

    await writeFile(
      join(targetDir, "findings.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          findings,
        },
        null,
        2,
      ),
      "utf8",
    );

    return {
      id,
      files: ["findings.json"],
      instructions,
      location: targetDir,
    };
  }

  private buildApplicationControlCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems.filter((system) => system.applicationControl === false).map((sys) => sys.name);
    return {
      area: "Application control",
      compliant: impacted.length === 0,
      evidence: impacted.length === 0 ? ["Application control enforced on all systems."] : undefined,
      remediation:
        impacted.length > 0
          ? "Implement allow-list based application control on the impacted systems."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildPatchApplicationsCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems
      .filter((system) => {
        if (!system.lastPatched) {
          return true;
        }
        const daysSince = this.daysSince(system.lastPatched);
        return daysSince > 30;
      })
      .map((sys) => sys.name);

    return {
      area: "Patch applications",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Update vulnerable applications within 48 hours of patch release. Integrate with patch management tooling."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildOfficeMacroCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems.filter((system) => system.internetFacing).map((sys) => sys.name);
    return {
      area: "Configure Microsoft Office macro settings",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Disable macros from the internet and enforce trusted publisher rules for Office workloads."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildUserApplicationHardeningCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems.filter((system) => system.internetFacing).map((sys) => sys.name);
    return {
      area: "User application hardening",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Harden browsers, disable unneeded plugins, and enforce TLS inspection policies on impacted endpoints."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildAdminPrivilegeCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems.filter((system) => system.internetFacing).map((sys) => sys.name);
    return {
      area: "Restrict administrative privileges",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Review privileged accounts, implement JIT access, and monitor privileged session activity."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildPatchOperatingSystemCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems
      .filter((system) => {
        if (!system.lastPatched) {
          return true;
        }
        const daysSince = this.daysSince(system.lastPatched);
        return daysSince > 14;
      })
      .map((sys) => sys.name);

    return {
      area: "Patch operating systems",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Apply OS patches within two weeks or 48 hours for critical updates. Enable automatic patch verification."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildMfaCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems.filter((system) => !system.mfaEnabled).map((sys) => sys.name);
    return {
      area: "Multi-factor authentication",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Enforce MFA for remote access, privileged accounts, and internet-facing services."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private buildBackupCheck(systems: System[]): EssentialEightChecklistItem {
    const impacted = systems
      .filter((system) => system.backupStatus && system.backupStatus !== "healthy")
      .map((sys) => `${sys.name} (${sys.backupStatus})`);

    return {
      area: "Regular backups",
      compliant: impacted.length === 0,
      remediation:
        impacted.length > 0
          ? "Review backup job status and ensure offline/immutable backups exist for critical systems."
          : undefined,
      impactedSystems: impacted,
    };
  }

  private daysSince(date: string): number {
    const timestamp = Date.parse(date);
    if (Number.isNaN(timestamp)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  }
}
