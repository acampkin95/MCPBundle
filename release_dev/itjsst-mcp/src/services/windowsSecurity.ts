import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";

export type SecurityOperation =
  // Windows Defender operations
  | "defender-status"
  | "defender-scan-quick"
  | "defender-scan-full"
  | "defender-scan-custom"
  | "defender-update-signatures"
  | "defender-threat-history"
  | "defender-quarantine-list"
  | "defender-exclusions"
  | "defender-add-exclusion"
  | "defender-remove-exclusion"
  // BitLocker operations
  | "bitlocker-status"
  | "bitlocker-enable"
  | "bitlocker-disable"
  | "bitlocker-suspend"
  | "bitlocker-resume"
  | "bitlocker-get-recovery-key"
  | "bitlocker-backup-recovery-key"
  // Firewall operations
  | "firewall-status"
  | "firewall-list-rules"
  | "firewall-create-rule"
  | "firewall-delete-rule"
  | "firewall-enable-rule"
  | "firewall-disable-rule"
  // Security event analysis
  | "analyze-failed-logins"
  | "analyze-privilege-escalations"
  | "analyze-account-changes"
  | "analyze-security-events"
  // Security baseline assessment
  | "assess-security-baseline"
  | "check-password-policy"
  | "check-account-policies"
  | "check-audit-policies"
  // Vulnerability scanning
  | "scan-outdated-software"
  | "scan-missing-updates"
  | "scan-weak-configurations";

export interface SecurityConnectionOptions {
  readonly host?: string;
  readonly username?: string;
  readonly password?: string;
  readonly passwordEnvVar?: string;
  readonly useSsl?: boolean;
  readonly port?: number;
  readonly authentication?: "Default" | "Negotiate" | "Kerberos" | "Basic" | "Credssp";
  readonly ignoreCertErrors?: boolean;
}

export interface SecurityOperationOptions extends SecurityConnectionOptions {
  readonly operation: SecurityOperation;
  readonly dryRun?: boolean;
  // Defender parameters
  readonly scanPath?: string;
  readonly scanType?: "Quick" | "Full" | "Custom";
  readonly exclusionPath?: string;
  readonly exclusionExtension?: string;
  readonly exclusionProcess?: string;
  // BitLocker parameters
  readonly driveLetter?: string;
  readonly recoveryKeyPath?: string;
  readonly encryptionMethod?: "Aes128" | "Aes256" | "XtsAes128" | "XtsAes256";
  // Firewall parameters
  readonly ruleName?: string;
  readonly ruleDirection?: "Inbound" | "Outbound";
  readonly ruleAction?: "Allow" | "Block";
  readonly ruleProtocol?: "TCP" | "UDP" | "Any";
  readonly ruleLocalPort?: string;
  readonly ruleRemotePort?: string;
  readonly ruleRemoteAddress?: string;
  // Security event parameters
  readonly hoursBack?: number;
  readonly maxEvents?: number;
  // Baseline parameters
  readonly baselineStandard?: "Microsoft" | "CIS" | "STIG";
}

export interface SecurityResult {
  readonly success: boolean;
  readonly operation: SecurityOperation;
  readonly data?: unknown;
  readonly message?: string;
  readonly findings?: SecurityFinding[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface SecurityFinding {
  readonly severity: "critical" | "high" | "medium" | "low" | "info";
  readonly category: string;
  readonly title: string;
  readonly description: string;
  readonly remediation?: string;
}

export class WindowsSecurityService {
  public constructor(private readonly runner: CommandRunner) {}

  public async executeOperation(options: SecurityOperationOptions): Promise<SecurityResult> {
    const { operation, dryRun = false } = options;

    const script = this.buildScript(options);

    if (dryRun && this.isWriteOperation(operation)) {
      return {
        success: true,
        operation,
        message: `[DRY RUN] Would execute: ${operation}`,
        stdout: script,
        stderr: "",
        exitCode: 0,
      };
    }

    const result = await this.executeScript(script, options);

    return {
      success: result.code === 0,
      operation,
      data: this.parseResult(result.stdout),
      message: result.code === 0 ? "Operation completed successfully" : "Operation failed",
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
    };
  }

  private isWriteOperation(operation: SecurityOperation): boolean {
    const writeOperations: SecurityOperation[] = [
      "defender-scan-quick",
      "defender-scan-full",
      "defender-scan-custom",
      "defender-update-signatures",
      "defender-add-exclusion",
      "defender-remove-exclusion",
      "bitlocker-enable",
      "bitlocker-disable",
      "bitlocker-suspend",
      "bitlocker-resume",
      "bitlocker-backup-recovery-key",
      "firewall-create-rule",
      "firewall-delete-rule",
      "firewall-enable-rule",
      "firewall-disable-rule",
    ];
    return writeOperations.includes(operation);
  }

  private buildScript(options: SecurityOperationOptions): string {
    const { operation } = options;

    switch (operation) {
      // Windows Defender operations
      case "defender-status":
        return `Get-MpComputerStatus | Select-Object AntivirusEnabled, AntispywareEnabled, RealTimeProtectionEnabled, IoavProtectionEnabled, BehaviorMonitorEnabled, OnAccessProtectionEnabled, AntivirusSignatureLastUpdated, AntispywareSignatureLastUpdated, QuickScanAge, FullScanAge, @{Name='QuickScanEndTime';Expression={$_.QuickScanEndTime}}, @{Name='FullScanEndTime';Expression={$_.FullScanEndTime}} | ConvertTo-Json -Depth 5`;

      case "defender-scan-quick":
        return `Start-MpScan -ScanType QuickScan; Get-MpComputerStatus | Select-Object QuickScanAge, QuickScanEndTime | ConvertTo-Json -Depth 5`;

      case "defender-scan-full":
        return `Start-MpScan -ScanType FullScan; Get-MpComputerStatus | Select-Object FullScanAge, FullScanEndTime | ConvertTo-Json -Depth 5`;

      case "defender-scan-custom":
        return `Start-MpScan -ScanType CustomScan -ScanPath ${this.quotePs(options.scanPath ?? "C:\\")}`;

      case "defender-update-signatures":
        return `Update-MpSignature; Get-MpComputerStatus | Select-Object AntivirusSignatureLastUpdated, AntispywareSignatureLastUpdated | ConvertTo-Json -Depth 5`;

      case "defender-threat-history":
        return `Get-MpThreatDetection | Select-Object ThreatID, @{Name='ThreatName';Expression={(Get-MpThreat -ThreatID $_.ThreatID).ThreatName}}, InitialDetectionTime, RemediationTime, @{Name='Resources';Expression={$_.Resources}}, @{Name='ProcessName';Expression={$_.ProcessName}} | Sort-Object InitialDetectionTime -Descending | ConvertTo-Json -Depth 5`;

      case "defender-quarantine-list":
        return `$threats = Get-MpThreatDetection; $quarantine = $threats | Where-Object {$_.CurrentStatus -eq 'Quarantined'}; $quarantine | Select-Object ThreatID, @{Name='ThreatName';Expression={(Get-MpThreat -ThreatID $_.ThreatID).ThreatName}}, InitialDetectionTime, @{Name='Resources';Expression={$_.Resources}} | ConvertTo-Json -Depth 5`;

      case "defender-exclusions":
        return `Get-MpPreference | Select-Object ExclusionPath, ExclusionExtension, ExclusionProcess | ConvertTo-Json -Depth 5`;

      case "defender-add-exclusion":
        return this.buildDefenderAddExclusionScript(options);

      case "defender-remove-exclusion":
        return this.buildDefenderRemoveExclusionScript(options);

      // BitLocker operations
      case "bitlocker-status":
        return `Get-BitLockerVolume | Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionMethod, EncryptionPercentage, VolumeType, CapacityGB, @{Name='KeyProtector';Expression={$_.KeyProtector | Select-Object KeyProtectorType, KeyProtectorId}} | ConvertTo-Json -Depth 5`;

      case "bitlocker-enable":
        return `Enable-BitLocker -MountPoint ${this.quotePs(options.driveLetter ?? "C:")} -EncryptionMethod ${options.encryptionMethod ?? "XtsAes256"} -RecoveryPasswordProtector; Get-BitLockerVolume -MountPoint ${this.quotePs(options.driveLetter ?? "C:")} | ConvertTo-Json -Depth 5`;

      case "bitlocker-disable":
        return `Disable-BitLocker -MountPoint ${this.quotePs(options.driveLetter ?? "C:")}`;

      case "bitlocker-suspend":
        return `Suspend-BitLocker -MountPoint ${this.quotePs(options.driveLetter ?? "C:")} -RebootCount 1`;

      case "bitlocker-resume":
        return `Resume-BitLocker -MountPoint ${this.quotePs(options.driveLetter ?? "C:")}`;

      case "bitlocker-get-recovery-key":
        return `(Get-BitLockerVolume -MountPoint ${this.quotePs(options.driveLetter ?? "C:")}).KeyProtector | Where-Object {$_.KeyProtectorType -eq 'RecoveryPassword'} | Select-Object KeyProtectorId, RecoveryPassword | ConvertTo-Json -Depth 5`;

      case "bitlocker-backup-recovery-key":
        return `$vol = Get-BitLockerVolume -MountPoint ${this.quotePs(options.driveLetter ?? "C:")}; $keyId = ($vol.KeyProtector | Where-Object {$_.KeyProtectorType -eq 'RecoveryPassword'})[0].KeyProtectorId; Backup-BitLockerKeyProtector -MountPoint ${this.quotePs(options.driveLetter ?? "C:")} -KeyProtectorId $keyId`;

      // Firewall operations
      case "firewall-status":
        return `Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, AllowInboundRules, AllowLocalFirewallRules, AllowLocalIPsecRules, AllowUnicastResponseToMulticast, NotifyOnListen, LogFileName, LogMaxSizeKilobytes, LogAllowed, LogBlocked | ConvertTo-Json -Depth 5`;

      case "firewall-list-rules":
        return `Get-NetFirewallRule | Where-Object {$_.Enabled -eq 'True'} | Select-Object Name, DisplayName, Description, Direction, Action, Enabled, Profile, @{Name='LocalPort';Expression={(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $_).LocalPort}}, @{Name='RemotePort';Expression={(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $_).RemotePort}}, @{Name='Protocol';Expression={(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $_).Protocol}} | ConvertTo-Json -Depth 5`;

      case "firewall-create-rule":
        return this.buildFirewallCreateRuleScript(options);

      case "firewall-delete-rule":
        return `Remove-NetFirewallRule -DisplayName ${this.quotePs(options.ruleName ?? "")}`;

      case "firewall-enable-rule":
        return `Enable-NetFirewallRule -DisplayName ${this.quotePs(options.ruleName ?? "")}`;

      case "firewall-disable-rule":
        return `Disable-NetFirewallRule -DisplayName ${this.quotePs(options.ruleName ?? "")}`;

      // Security event analysis
      case "analyze-failed-logins":
        return this.buildAnalyzeFailedLoginsScript(options);

      case "analyze-privilege-escalations":
        return this.buildAnalyzePrivilegeEscalationsScript(options);

      case "analyze-account-changes":
        return this.buildAnalyzeAccountChangesScript(options);

      case "analyze-security-events":
        return this.buildAnalyzeSecurityEventsScript(options);

      // Security baseline assessment
      case "assess-security-baseline":
        return this.buildSecurityBaselineScript(options);

      case "check-password-policy":
        return `net accounts | Out-String`;

      case "check-account-policies":
        return `secedit /export /cfg $env:TEMP\\secpol.cfg /quiet; Get-Content $env:TEMP\\secpol.cfg; Remove-Item $env:TEMP\\secpol.cfg`;

      case "check-audit-policies":
        return `auditpol /get /category:* | Out-String`;

      // Vulnerability scanning
      case "scan-outdated-software":
        return `Get-Package | Select-Object Name, Version, ProviderName, Source | Sort-Object Name | ConvertTo-Json -Depth 5`;

      case "scan-missing-updates":
        return `$session = New-Object -ComObject Microsoft.Update.Session; $searcher = $session.CreateUpdateSearcher(); $result = $searcher.Search('IsInstalled=0'); $result.Updates | Select-Object Title, @{Name='SizeKB';Expression={[math]::Round($_.MaxDownloadSize/1024, 2)}}, MsrcSeverity, @{Name='KBArticleIDs';Expression={$_.KBArticleIDs}}, Description | ConvertTo-Json -Depth 5`;

      case "scan-weak-configurations":
        return this.buildWeakConfigurationsScript();

      default:
        throw new Error(`Unknown security operation: ${operation}`);
    }
  }

  private buildDefenderAddExclusionScript(options: SecurityOperationOptions): string {
    const parts: string[] = [];
    if (options.exclusionPath) {
      parts.push(`Add-MpPreference -ExclusionPath ${this.quotePs(options.exclusionPath)}`);
    }
    if (options.exclusionExtension) {
      parts.push(`Add-MpPreference -ExclusionExtension ${this.quotePs(options.exclusionExtension)}`);
    }
    if (options.exclusionProcess) {
      parts.push(`Add-MpPreference -ExclusionProcess ${this.quotePs(options.exclusionProcess)}`);
    }
    return parts.join("; ");
  }

  private buildDefenderRemoveExclusionScript(options: SecurityOperationOptions): string {
    const parts: string[] = [];
    if (options.exclusionPath) {
      parts.push(`Remove-MpPreference -ExclusionPath ${this.quotePs(options.exclusionPath)}`);
    }
    if (options.exclusionExtension) {
      parts.push(`Remove-MpPreference -ExclusionExtension ${this.quotePs(options.exclusionExtension)}`);
    }
    if (options.exclusionProcess) {
      parts.push(`Remove-MpPreference -ExclusionProcess ${this.quotePs(options.exclusionProcess)}`);
    }
    return parts.join("; ");
  }

  private buildFirewallCreateRuleScript(options: SecurityOperationOptions): string {
    const parts = [`New-NetFirewallRule -DisplayName ${this.quotePs(options.ruleName ?? "")}`];
    if (options.ruleDirection) parts.push(`-Direction ${options.ruleDirection}`);
    if (options.ruleAction) parts.push(`-Action ${options.ruleAction}`);
    if (options.ruleProtocol) parts.push(`-Protocol ${options.ruleProtocol}`);
    if (options.ruleLocalPort) parts.push(`-LocalPort ${this.quotePs(options.ruleLocalPort)}`);
    if (options.ruleRemotePort) parts.push(`-RemotePort ${this.quotePs(options.ruleRemotePort)}`);
    if (options.ruleRemoteAddress) parts.push(`-RemoteAddress ${this.quotePs(options.ruleRemoteAddress)}`);
    parts.push("-Enabled True");
    return parts.join(" ");
  }

  private buildAnalyzeFailedLoginsScript(options: SecurityOperationOptions): string {
    const hoursBack = options.hoursBack ?? 24;
    const maxEvents = options.maxEvents ?? 100;
    return `
$startTime = (Get-Date).AddHours(-${hoursBack});
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=$startTime} -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue |
  ForEach-Object {
    $xml = [xml]$_.ToXml();
    [pscustomobject]@{
      TimeCreated = $_.TimeCreated;
      Account = $xml.Event.EventData.Data | Where-Object {$_.Name -eq 'TargetUserName'} | Select-Object -ExpandProperty '#text';
      IPAddress = $xml.Event.EventData.Data | Where-Object {$_.Name -eq 'IpAddress'} | Select-Object -ExpandProperty '#text';
      FailureReason = $xml.Event.EventData.Data | Where-Object {$_.Name -eq 'FailureReason'} | Select-Object -ExpandProperty '#text';
      LogonType = $xml.Event.EventData.Data | Where-Object {$_.Name -eq 'LogonType'} | Select-Object -ExpandProperty '#text';
    }
  } | Group-Object Account | Select-Object Count, Name, @{Name='IPs';Expression={$_.Group.IPAddress | Select-Object -Unique}} | Sort-Object Count -Descending | ConvertTo-Json -Depth 5
    `.trim();
  }

  private buildAnalyzePrivilegeEscalationsScript(options: SecurityOperationOptions): string {
    const hoursBack = options.hoursBack ?? 24;
    const maxEvents = options.maxEvents ?? 50;
    return `
$startTime = (Get-Date).AddHours(-${hoursBack});
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4672,4673,4674; StartTime=$startTime} -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, @{Name='EventType';Expression={
    switch($_.Id) {
      4672 {'Special privileges assigned'}
      4673 {'Privileged service called'}
      4674 {'Privileged operation attempted'}
    }
  }}, Message | ConvertTo-Json -Depth 5
    `.trim();
  }

  private buildAnalyzeAccountChangesScript(options: SecurityOperationOptions): string {
    const hoursBack = options.hoursBack ?? 24;
    const maxEvents = options.maxEvents ?? 100;
    return `
$startTime = (Get-Date).AddHours(-${hoursBack});
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4720,4722,4723,4724,4725,4726,4738,4740,4767; StartTime=$startTime} -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, @{Name='Action';Expression={
    switch($_.Id) {
      4720 {'User account created'}
      4722 {'User account enabled'}
      4723 {'Password change attempted'}
      4724 {'Password reset attempted'}
      4725 {'User account disabled'}
      4726 {'User account deleted'}
      4738 {'User account changed'}
      4740 {'User account locked out'}
      4767 {'User account unlocked'}
    }
  }}, Message | ConvertTo-Json -Depth 5
    `.trim();
  }

  private buildAnalyzeSecurityEventsScript(options: SecurityOperationOptions): string {
    const hoursBack = options.hoursBack ?? 24;
    const maxEvents = options.maxEvents ?? 200;
    return `
$startTime = (Get-Date).AddHours(-${hoursBack});
Get-WinEvent -FilterHashtable @{LogName='Security'; Level=2,3; StartTime=$startTime} -MaxEvents ${maxEvents} -ErrorAction SilentlyContinue |
  Group-Object Id | Select-Object Count, Name, @{Name='Description';Expression={$_.Group[0].Message.Split([Environment]::NewLine)[0]}} |
  Sort-Object Count -Descending | ConvertTo-Json -Depth 5
    `.trim();
  }

  private buildSecurityBaselineScript(_options: SecurityOperationOptions): string {
    return `
$findings = @();

# Check if Windows Defender is enabled
$defender = Get-MpComputerStatus;
if (-not $defender.RealTimeProtectionEnabled) {
  $findings += [pscustomobject]@{Severity='high'; Category='Antivirus'; Finding='Windows Defender real-time protection is disabled'; Remediation='Enable real-time protection'}
}

# Check if firewall is enabled
$firewall = Get-NetFirewallProfile;
$disabledProfiles = $firewall | Where-Object {-not $_.Enabled};
if ($disabledProfiles) {
  $findings += [pscustomobject]@{Severity='high'; Category='Firewall'; Finding="Firewall disabled for profiles: $($disabledProfiles.Name -join ', ')"; Remediation='Enable firewall for all profiles'}
}

# Check for admin accounts
$admins = Get-LocalGroupMember -Group "Administrators" -ErrorAction SilentlyContinue;
if ($admins.Count -gt 2) {
  $findings += [pscustomobject]@{Severity='medium'; Category='Accounts'; Finding="$($admins.Count) administrator accounts found"; Remediation='Reduce number of administrator accounts'}
}

# Check password policy
$passPolicy = net accounts;
if ($passPolicy -match 'Minimum password length:\\s+(\\d+)' -and [int]$matches[1] -lt 12) {
  $findings += [pscustomobject]@{Severity='medium'; Category='Password Policy'; Finding="Minimum password length is $($matches[1])"; Remediation='Set minimum password length to 12 or more'}
}

# Check for pending updates
$session = New-Object -ComObject Microsoft.Update.Session;
$searcher = $session.CreateUpdateSearcher();
$pendingUpdates = $searcher.Search('IsInstalled=0').Updates.Count;
if ($pendingUpdates -gt 0) {
  $findings += [pscustomobject]@{Severity='medium'; Category='Updates'; Finding="$pendingUpdates pending Windows updates"; Remediation='Install pending updates'}
}

$findings | ConvertTo-Json -Depth 5
    `.trim();
  }

  private buildWeakConfigurationsScript(): string {
    return `
$issues = @();

# Check SMBv1
$smb1 = Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -ErrorAction SilentlyContinue;
if ($smb1.State -eq 'Enabled') {
  $issues += [pscustomobject]@{Issue='SMBv1 is enabled'; Risk='High'; Recommendation='Disable SMBv1'}
}

# Check PowerShell execution policy
$execPolicy = Get-ExecutionPolicy;
if ($execPolicy -eq 'Unrestricted' -or $execPolicy -eq 'Bypass') {
  $issues += [pscustomobject]@{Issue="PowerShell execution policy is $execPolicy"; Risk='Medium'; Recommendation='Set execution policy to RemoteSigned or AllSigned'}
}

# Check UAC
$uac = Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System -Name EnableLUA;
if ($uac.EnableLUA -eq 0) {
  $issues += [pscustomobject]@{Issue='User Account Control (UAC) is disabled'; Risk='High'; Recommendation='Enable UAC'}
}

$issues | ConvertTo-Json -Depth 5
    `.trim();
  }

  private async executeScript(script: string, options: SecurityConnectionOptions): Promise<CommandResult> {
    const mode = options.host ? "remote" : "local";

    if (mode === "local") {
      const command = `pwsh -Command "${script.replace(/"/g, '\\"')}"`;
      return this.runner.run(command, { requiresSudo: false, timeoutMs: 300000 }); // 5 minutes for scans
    } else {
      // Remote execution via WinRM
      const passwordEnvVar = options.passwordEnvVar ?? "WINDOWS_REMOTE_PASSWORD";
      const password = options.password ?? process.env[passwordEnvVar] ?? "";
      const username = options.username ?? "Administrator";
      const useSsl = options.useSsl ?? false;
      const port = options.port ?? (useSsl ? 5986 : 5985);
      const auth = options.authentication ?? "Default";
      const ignoreCertErrors = options.ignoreCertErrors ?? false;

      const encodedScript = Buffer.from(script, "utf16le").toString("base64");

      const sessionOptions: string[] = [];
      if (useSsl) sessionOptions.push("-UseSSL");
      if (ignoreCertErrors) {
        sessionOptions.push("-SessionOption (New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck)");
      }

      const invokeCommand = `pwsh -Command "$password = ConvertTo-SecureString '${password}' -AsPlainText -Force; $cred = New-Object System.Management.Automation.PSCredential('${username}', $password); Invoke-Command -ComputerName ${options.host} -Port ${port} -Credential $cred -Authentication ${auth} ${sessionOptions.join(" ")} -ScriptBlock { [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedScript}')) | Invoke-Expression }"`;

      return this.runner.run(invokeCommand, { requiresSudo: false, timeoutMs: 300000 });
    }
  }

  private parseResult(stdout: string): unknown {
    if (!stdout.trim()) return null;
    try {
      return JSON.parse(stdout);
    } catch {
      return stdout;
    }
  }

  private quotePs(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
