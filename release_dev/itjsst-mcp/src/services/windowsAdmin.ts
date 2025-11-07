import { CommandRunner, type CommandOptions, type CommandResult } from "../utils/commandRunner.js";

export type WindowsAuthMethod = "Default" | "Negotiate" | "Kerberos" | "Basic" | "Credssp";

export interface WindowsConnectionOptions {
  readonly host: string;
  readonly username?: string;
  readonly password?: string;
  readonly passwordEnvVar?: string;
  readonly useSsl?: boolean;
  readonly port?: number;
  readonly authentication?: WindowsAuthMethod;
  readonly ignoreCertErrors?: boolean;
}

export interface WindowsCommandResult extends CommandResult {
  readonly json?: unknown;
}

export interface WindowsUpdateActionOptions {
  readonly mode: "list" | "install";
  readonly includeOptional?: boolean;
  readonly categories?: string[];
}

export interface WindowsRoleFeatureOptions {
  readonly action: "list" | "install" | "remove";
  readonly featureNames?: string[];
  readonly includeManagementTools?: boolean;
}

export interface WindowsPerformanceOptions {
  readonly sampleSeconds?: number;
  readonly includeDisks?: boolean;
  readonly includeNetwork?: boolean;
}

interface RemoteExecutionPlan {
  readonly command: string;
  readonly env?: NodeJS.ProcessEnv;
}

const DEFAULT_PASSWORD_ENV = "WINDOWS_REMOTE_PASSWORD";

export class WindowsAdminService {
  public constructor(private readonly runner: CommandRunner) {}

  public systemInfo(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$cs = Get-CimInstance -ClassName Win32_ComputerSystem
$bios = Get-CimInstance -ClassName Win32_BIOS
$disks = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, VolumeName, FileSystem, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB,2)}}, @{Name='FreeGB';Expression={[math]::Round($_.FreeSpace/1GB,2)}}, @{Name='FreePercent';Expression={ if ($_.Size -eq 0) { 0 } else { [math]::Round(($_.FreeSpace / $_.Size) * 100, 2) } }}
$hotfix = @()
try {
  $hotfix = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID, Description, InstalledOn
} catch {
  $hotfix = @()
}
$uptime = (Get-Date) - $os.LastBootUpTime
[pscustomobject]@{
  ComputerName = $env:COMPUTERNAME
  OS = $os | Select-Object Caption, Version, BuildNumber, LastBootUpTime
  ComputerSystem = $cs | Select-Object Manufacturer, Model, Domain, TotalPhysicalMemory, NumberOfProcessors, NumberOfLogicalProcessors
  BIOS = $bios | Select-Object Manufacturer, SMBIOSBIOSVersion, ReleaseDate
  MemoryGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
  Uptime = @{
    Days = [int]$uptime.TotalDays
    Hours = $uptime.Hours
    Minutes = $uptime.Minutes
  }
  HotFixes = $hotfix
  Disks = $disks
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public serviceAction(
    options: WindowsConnectionOptions & {
      readonly service: string;
      readonly action: "status" | "start" | "stop" | "restart";
      readonly force?: boolean;
    },
  ): Promise<WindowsCommandResult> {
    const forceFlag = options.force ? "$true" : "$false";
    const script = `
$serviceName = ${this.quotePs(options.service)}
$action = ${this.quotePs(options.action)}
$force = ${forceFlag}
$service = Get-Service -Name $serviceName -ErrorAction Stop
switch ($action.ToLowerInvariant()) {
  "start"   { Start-Service -Name $serviceName -ErrorAction Stop }
  "stop"    { if ($force) { Stop-Service -Name $serviceName -Force -ErrorAction Stop } else { Stop-Service -Name $serviceName -ErrorAction Stop } }
  "restart" { if ($force) { Restart-Service -Name $serviceName -Force -ErrorAction Stop } else { Restart-Service -Name $serviceName -ErrorAction Stop } }
  default   { }
}
$service = Get-Service -Name $serviceName -ErrorAction Stop
$details = Get-CimInstance -ClassName Win32_Service -Filter "Name='$serviceName'" | Select-Object Name, DisplayName, State, Status, StartMode, StartName
[pscustomobject]@{
  Name = $service.Name
  DisplayName = $service.DisplayName
  Status = $service.Status
  StartType = $details.StartMode
  RunAs = $details.StartName
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public processSummary(
    options: WindowsConnectionOptions & {
      readonly nameFilter?: string;
      readonly top?: number;
      readonly sortBy?: "cpu" | "memory";
    },
  ): Promise<WindowsCommandResult> {
    const filterClause = options.nameFilter ? `$processes = $processes | Where-Object { $_.Name -like ${this.quotePs(options.nameFilter)} }` : "";
    const sortBy = options.sortBy === "memory" ? "WorkingSet64" : "CPU";
    const top = typeof options.top === "number" ? Math.max(1, options.top) : 10;
    const script = `
$processes = Get-Process
${filterClause}
$processes = $processes | Select-Object Name, Id, CPU, @{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64/1MB,2)}}, @{Name='StartTime';Expression={ try { $_.StartTime } catch { $null } }}
$processes = $processes | Sort-Object -Property ${sortBy} -Descending
$processes | Select-Object -First ${top}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public eventLog(
    options: WindowsConnectionOptions & {
      readonly logName: string;
      readonly maxEvents: number;
      readonly level?: 1 | 2 | 3 | 4 | 5;
      readonly eventId?: number;
      readonly provider?: string;
    },
  ): Promise<WindowsCommandResult> {
    const filterParts = [`LogName = ${this.quotePs(options.logName)}`];
    if (options.level) {
      filterParts.push(`Level = ${options.level}`);
    }
    if (typeof options.eventId === "number") {
      filterParts.push(`Id = ${options.eventId}`);
    }
    const providerFilter = options.provider
      ? `$events = $events | Where-Object { $_.ProviderName -like ${this.quotePs(options.provider)} }`
      : "";

    const script = `
$filter = @{ ${filterParts.join("; ")} }
$events = Get-WinEvent -FilterHashtable $filter -MaxEvents ${Math.max(1, options.maxEvents)}
${providerFilter}
$events | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public diskStatus(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
$volumes = Get-Volume | Where-Object { $_.DriveLetter } | Select-Object DriveLetter, FileSystemLabel, FileSystem, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB,2)}}, @{Name='FreeGB';Expression={[math]::Round($_.SizeRemaining/1GB,2)}}, @{Name='FreePercent';Expression={ if ($_.Size -eq 0) { 0 } else { [math]::Round(($_.SizeRemaining / $_.Size) * 100, 2) } }}
try {
  $physical = Get-PhysicalDisk | Select-Object FriendlyName, SerialNumber, MediaType, Size, HealthStatus, OperationalStatus
} catch {
  $physical = @()
}
try {
  $pools = Get-StoragePool | Select-Object FriendlyName, HealthStatus, OperationalStatus, Size, AllocatedSize
} catch {
  $pools = @()
}
[pscustomobject]@{
  Volumes = $volumes
  PhysicalDisks = $physical
  StoragePools = $pools
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public networkStatus(
    options: WindowsConnectionOptions & {
      readonly includeRoutes?: boolean;
      readonly testHost?: string;
    },
  ): Promise<WindowsCommandResult> {
    const routeClause = options.includeRoutes
      ? `
try {
  $routes = Get-NetRoute -AddressFamily IPv4 | Select-Object -First 50 DestinationPrefix, InterfaceAlias, NextHop, RouteMetric
} catch {
  $routes = @()
}
      `.trim()
      : "$routes = @()";
    const testClause = options.testHost
      ? `
try {
  $test = Test-NetConnection -ComputerName ${this.quotePs(options.testHost)} -InformationLevel Detailed
} catch {
  $test = [pscustomobject]@{
    ComputerName = ${this.quotePs(options.testHost)}
    Error = $_.Exception.Message
  }
}
      `.trim()
      : "$test = $null";

    const script = `
try {
  $adapters = Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, MacAddress, LinkSpeed
} catch {
  $adapters = @()
}
try {
  $addresses = Get-NetIPAddress | Where-Object { $_.AddressState -eq 'Preferred' } | Select-Object InterfaceAlias, IPAddress, PrefixLength, AddressFamily
} catch {
  $addresses = @()
}
${routeClause}
${testClause}
[pscustomobject]@{
  Adapters = $adapters
  Addresses = $addresses
  Routes = $routes
  ConnectivityTest = $test
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public scheduledTasks(
    options: WindowsConnectionOptions & {
      readonly taskNameFilter?: string;
      readonly stateFilter?: string;
    },
  ): Promise<WindowsCommandResult> {
    const nameFilter = options.taskNameFilter
      ? `$tasks = $tasks | Where-Object { $_.TaskName -like ${this.quotePs(options.taskNameFilter)} }`
      : "";
    const stateFilter = options.stateFilter
      ? `$tasks = $tasks | Where-Object { $_.State -eq ${this.quotePs(options.stateFilter)} }`
      : "";

    const script = `
try {
  $tasks = Get-ScheduledTask
} catch {
  $tasks = @()
}
${nameFilter}
${stateFilter}
$tasks | ForEach-Object {
  try {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath
  } catch {
    $info = $null
  }
  [pscustomobject]@{
    TaskName = $_.TaskName
    TaskPath = $_.TaskPath
    State = $_.State
    LastRunTime = if ($info) { $info.LastRunTime } else { $null }
    NextRunTime = if ($info) { $info.NextRunTime } else { $null }
    LastTaskResult = if ($info) { $info.LastTaskResult } else { $null }
  }
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public firewallStatus(
    options: WindowsConnectionOptions & {
      readonly includeRules?: boolean;
      readonly ruleNameFilter?: string;
      readonly profileFilter?: string;
    },
  ): Promise<WindowsCommandResult> {
    const includeRules = options.includeRules ?? false;
    const ruleRetrieval = includeRules
      ? `
try {
  $rules = Get-NetFirewallRule -Enabled True
  ${options.profileFilter ? `$rules = $rules | Where-Object { $_.Profile -like ${this.quotePs(options.profileFilter)} }` : ""}
  ${options.ruleNameFilter ? `$rules = $rules | Where-Object { $_.DisplayName -like ${this.quotePs(options.ruleNameFilter)} }` : ""}
  $rules = $rules | Select-Object -First 75 DisplayName, Direction, Action, Profile, Enabled
} catch {
  $rules = @()
}
`
      : "$rules = @()";

    const script = `
try {
  $profiles = Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, AllowInboundRules, AllowLocalFirewallRules, AllowLocalIPsecRules
} catch {
  $profiles = @()
}
${ruleRetrieval}
[pscustomobject]@{
  Profiles = $profiles
  Rules = $rules
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public runScript(
    script: string,
    options: WindowsConnectionOptions,
    expectJson: boolean,
  ): Promise<WindowsCommandResult> {
    return this.invokeRemote(script, options, expectJson);
  }

  public windowsUpdateAction(
    options: WindowsConnectionOptions & WindowsUpdateActionOptions,
  ): Promise<WindowsCommandResult> {
    const queryParts = ["IsInstalled=0"];
    if (!options.includeOptional) {
      queryParts.push("IsHidden=0");
    }
    if (options.categories?.length) {
      const categoryClauses = options.categories.map((cat) => `CategoryIDs contains '{${cat}}'`);
      queryParts.push(`(${categoryClauses.join(" or ")})`);
    }
    const searchQuery = queryParts.join(" and ");

    const script = `
$session = New-Object -ComObject Microsoft.Update.Session
$searcher = $session.CreateUpdateSearcher()
$searchResult = $searcher.Search(${this.quotePs(searchQuery)})
$updates = @()
for ($i = 0; $i -lt $searchResult.Updates.Count; $i++) {
  $u = $searchResult.Updates.Item($i)
  $updates += [pscustomobject]@{
    Title = $u.Title
    KB = $u.KBArticleIDs -join ', '
    Severity = $u.MsrcSeverity
    IsMandatory = $u.IsMandatory
    Downloaded = $u.IsDownloaded
    Categories = ($u.Categories | Select-Object -ExpandProperty Name)
  }
}

if (${options.mode === "install" ? "$true" : "$false"} -and $updates.Count -gt 0) {
  $updateCollection = New-Object -ComObject Microsoft.Update.UpdateColl
  foreach ($update in $searchResult.Updates) {
    [void]$updateCollection.Add($update)
  }
  $downloader = $session.CreateUpdateDownloader()
  $downloader.Updates = $updateCollection
  $downloadResult = $downloader.Download()
  $installer = $session.CreateUpdateInstaller()
  $installer.Updates = $updateCollection
  $installResult = $installer.Install()
  $installSummary = [pscustomobject]@{
    HResult = $installResult.HResult
    RebootRequired = $installResult.RebootRequired
    ResultCode = $installResult.ResultCode
    UpdatesInstalled = $installResult.UpdatesInstalled
  }
} else {
  $installSummary = $null
}

[pscustomobject]@{
  Count = $updates.Count
  Updates = $updates
  InstallSummary = $installSummary
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  public rolesAndFeatures(
    options: WindowsConnectionOptions & WindowsRoleFeatureOptions,
  ): Promise<WindowsCommandResult> {
    const featureList = options.featureNames?.length
      ? options.featureNames.map((name) => this.quotePs(name)).join(",")
      : "";
    const script = (() => {
      switch (options.action) {
        case "list":
          return `Get-WindowsFeature | Select-Object Name, DisplayName, Installed | ConvertTo-Json -Depth 3`;
        case "install": {
          if (!featureList) {
            throw new Error("Feature installation requires 'featureNames'.");
          }
          const includeMgmt = options.includeManagementTools ? "-IncludeManagementTools" : "";
          return `
$result = Install-WindowsFeature -Name ${featureList} ${includeMgmt}
[pscustomobject]@{
  Success = $result.Success
  RestartNeeded = $result.RestartNeeded
  FeatureResult = $result.FeatureResult | Select-Object Name, DisplayName, RestartNeeded, Success
}
          `.trim();
        }
        case "remove": {
          if (!featureList) {
            throw new Error("Feature removal requires 'featureNames'.");
          }
          return `
$result = Remove-WindowsFeature -Name ${featureList}
[pscustomobject]@{
  Success = $result.Success
  RestartNeeded = $result.RestartNeeded
  FeatureResult = $result.FeatureResult | Select-Object Name, DisplayName, RestartNeeded, Success
}
          `.trim();
        }
        default: {
          const exhaustive: never = options.action;
          throw new Error(`Unsupported roles/features action: ${exhaustive}`);
        }
      }
    })();

    return this.invokeRemote(script, options, true);
  }

  public performanceSnapshot(
    options: WindowsConnectionOptions & WindowsPerformanceOptions,
  ): Promise<WindowsCommandResult> {
    const sampleSeconds = Math.max(1, Math.min(30, options.sampleSeconds ?? 5));
    const includeDisks = options.includeDisks ? "$true" : "$false";
    const includeNetwork = options.includeNetwork ? "$true" : "$false";

    const script = `
$cpuSamples = Get-Counter -Counter "\\Processor(_Total)\\% Processor Time" -SampleInterval 1 -MaxSamples ${sampleSeconds}
$cpuAvg = [math]::Round((($cpuSamples.CounterSamples | Measure-Object -Property CookedValue -Average).Average),2)
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$memTotal = [math]::Round($os.TotalVisibleMemorySize/1KB,2)
$memFree = [math]::Round($os.FreePhysicalMemory/1KB,2)
$memUsedPct = if ($memTotal -eq 0) { 0 } else { [math]::Round((($memTotal - $memFree)/$memTotal)*100,2) }

if (${includeDisks} ) {
  $diskCounters = Get-Counter -Counter "\\PhysicalDisk(*)\\Avg. Disk Queue Length" -SampleInterval 1 -MaxSamples ${sampleSeconds}
  $diskResults = $diskCounters.CounterSamples | Group-Object InstanceName | ForEach-Object {
    [pscustomobject]@{
      Disk = $_.Name
      AvgQueue = [math]::Round((($_.Group | Measure-Object -Property CookedValue -Average).Average),3)
    }
  }
} else {
  $diskResults = @()
}

if (${includeNetwork} ) {
  $netCounters = Get-Counter -Counter "\\Network Interface(*)\\Bytes Total/sec" -SampleInterval 1 -MaxSamples ${sampleSeconds}
  $netResults = $netCounters.CounterSamples | Group-Object InstanceName | ForEach-Object {
    [pscustomobject]@{
      Interface = $_.Name
      AvgBytesPerSec = [math]::Round((($_.Group | Measure-Object -Property CookedValue -Average).Average),2)
    }
  }
} else {
  $netResults = @()
}

[pscustomobject]@{
  CpuPercent = $cpuAvg
  Memory = @{
    TotalMB = $memTotal
    FreeMB = $memFree
    UsedPercent = $memUsedPct
  }
  Disk = $diskResults
  Network = $netResults
}
    `.trim();

    return this.invokeRemote(script, options, true);
  }

  private async invokeRemote(
    scriptBody: string,
    options: WindowsConnectionOptions,
    expectJson: boolean,
  ): Promise<WindowsCommandResult> {
    const plan = this.buildRemoteExecution(scriptBody, options, expectJson);
    const runnerOptions: CommandOptions = plan.env ? { env: plan.env } : {};
    const result = await this.runner.run(plan.command, runnerOptions);

    if (!expectJson) {
      return result;
    }

    const trimmed = result.stdout.trim();
    if (!trimmed.length) {
      return {
        ...result,
        json: undefined,
      };
    }

    try {
      const parsed = JSON.parse(trimmed);
      return {
        ...result,
        json: parsed,
      };
    } catch {
      return result;
    }
  }

  private buildRemoteExecution(
    scriptBody: string,
    options: WindowsConnectionOptions,
    expectJson: boolean,
  ): RemoteExecutionPlan {
    if (!options.host) {
      throw new Error("Windows host is required.");
    }

    const passwordEnvVar = options.passwordEnvVar ?? DEFAULT_PASSWORD_ENV;
    const sessionLines: string[] = [
      "$ErrorActionPreference = 'Stop'",
      `$sessionArgs = @{ ComputerName = ${this.quotePs(options.host)} }`,
      `$sessionArgs.Authentication = ${this.quotePs(options.authentication ?? "Default")}`,
    ];

    if (options.useSsl) {
      sessionLines.push("$sessionArgs.UseSSL = $true");
    }
    if (typeof options.port === "number") {
      sessionLines.push(`$sessionArgs.Port = ${options.port}`);
    }
    if (options.ignoreCertErrors) {
      sessionLines.push(
        "$sessionArgs.SessionOption = New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck",
      );
    }

    if (options.username) {
      sessionLines.push(`$credentialUser = ${this.quotePs(options.username)}`);
      sessionLines.push(`$passwordEnvVar = ${this.quotePs(passwordEnvVar)}`);
      sessionLines.push(`
$passwordValue = [Environment]::GetEnvironmentVariable($passwordEnvVar, [EnvironmentVariableTarget]::Process)
if ([string]::IsNullOrEmpty($passwordValue)) {
  $passwordValue = [Environment]::GetEnvironmentVariable($passwordEnvVar, [EnvironmentVariableTarget]::User)
}
if ([string]::IsNullOrEmpty($passwordValue)) {
  $passwordValue = [Environment]::GetEnvironmentVariable($passwordEnvVar, [EnvironmentVariableTarget]::Machine)
}
if (-not [string]::IsNullOrEmpty($passwordValue)) {
  $securePassword = ConvertTo-SecureString $passwordValue -AsPlainText -Force
  $sessionArgs.Credential = [PSCredential]::new($credentialUser, $securePassword)
  [Environment]::SetEnvironmentVariable($passwordEnvVar, $null, [EnvironmentVariableTarget]::Process)
}
      `.trim());
    }

    const remoteScriptEncoded = Buffer.from(scriptBody, "utf8").toString("base64");
    sessionLines.push(
      `$remoteScript = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(${this.quotePs(remoteScriptEncoded)}))`,
    );
    sessionLines.push("$scriptBlock = [ScriptBlock]::Create($remoteScript)");
    sessionLines.push("$result = Invoke-Command @sessionArgs -ScriptBlock $scriptBlock");
    sessionLines.push(`$expectJson = ${expectJson ? "$true" : "$false"}`);
    sessionLines.push(`
if ($null -eq $result) {
  if ($expectJson) {
    ""
  } else {
    ""
  }
} elseif ($expectJson) {
  $json = $result | ConvertTo-Json -Depth 8
  if ($null -eq $json) { "" } else { $json }
} else {
  ($result | Out-String).TrimEnd()
}
    `.trim());

    const fullScript = sessionLines.join("\n");
    const encodedCommand = Buffer.from(fullScript, "utf16le").toString("base64");
    const command = `pwsh -NoLogo -NoProfile -EncodedCommand ${encodedCommand}`;

    const env = options.password
      ? {
          ...process.env,
          [passwordEnvVar]: options.password,
        }
      : undefined;

    return { command, env };
  }

  // Hyper-V Management
  public hypervListVMs(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
Get-VM | Select-Object Name, State, CPUUsage, @{Name='MemoryAssignedMB';Expression={[math]::Round($_.MemoryAssigned/1MB, 2)}}, @{Name='MemoryDemandMB';Expression={[math]::Round($_.MemoryDemand/1MB, 2)}}, Uptime, Status, Generation, Version, @{Name='IntegrationServicesState';Expression={$_.IntegrationServicesState}}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public hypervVMAction(
    options: WindowsConnectionOptions & { readonly vmName: string; readonly action: "start" | "stop" | "save" | "restart" | "checkpoint" }
  ): Promise<WindowsCommandResult> {
    const { vmName, action } = options;
    const script = `
$vmName = ${this.quotePs(vmName)}
switch (${this.quotePs(action)}) {
  "start" { Start-VM -Name $vmName }
  "stop" { Stop-VM -Name $vmName -Force }
  "save" { Save-VM -Name $vmName }
  "restart" { Restart-VM -Name $vmName -Force }
  "checkpoint" { Checkpoint-VM -Name $vmName }
}
Get-VM -Name $vmName | Select-Object Name, State, Uptime, Status
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public hypervVirtualSwitches(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
Get-VMSwitch | Select-Object Name, SwitchType, NetAdapterInterfaceDescription, AllowManagementOS, @{Name='BandwidthMode';Expression={$_.BandwidthReservationMode}}, Notes
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  // SQL Server Management
  public sqlServerStatus(options: WindowsConnectionOptions & { readonly instanceName?: string }): Promise<WindowsCommandResult> {
    const instanceName = options.instanceName ?? "MSSQLSERVER";
    const script = `
$service = Get-Service -Name ${this.quotePs(instanceName)} -ErrorAction SilentlyContinue
if ($service) {
  [pscustomobject]@{
    ServiceName = $service.Name
    DisplayName = $service.DisplayName
    Status = $service.Status
    StartType = $service.StartType
  }
}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public sqlServerDatabases(options: WindowsConnectionOptions & { readonly instanceName?: string }): Promise<WindowsCommandResult> {
    const instanceName = options.instanceName ?? "localhost";
    const script = `
[System.Reflection.Assembly]::LoadWithPartialName('Microsoft.SqlServer.SMO') | Out-Null
$server = New-Object Microsoft.SqlServer.Management.Smo.Server(${this.quotePs(instanceName)})
$server.Databases | Select-Object Name, Size, DataSpaceUsage, IndexSpaceUsage, SpaceAvailable, RecoveryModel, CompatibilityLevel, LastBackupDate, Owner, CreateDate
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public sqlServerBackup(
    options: WindowsConnectionOptions & { readonly database: string; readonly backupPath: string; readonly instanceName?: string }
  ): Promise<WindowsCommandResult> {
    const instanceName = options.instanceName ?? "localhost";
    const script = `
[System.Reflection.Assembly]::LoadWithPartialName('Microsoft.SqlServer.SMO') | Out-Null
$server = New-Object Microsoft.SqlServer.Management.Smo.Server(${this.quotePs(instanceName)})
$backup = New-Object Microsoft.SqlServer.Management.Smo.Backup
$backup.Action = [Microsoft.SqlServer.Management.Smo.BackupActionType]::Database
$backup.Database = ${this.quotePs(options.database)}
$backup.Devices.AddDevice(${this.quotePs(options.backupPath)}, [Microsoft.SqlServer.Management.Smo.DeviceType]::File)
$backup.SqlBackup($server)
[pscustomobject]@{Database=${this.quotePs(options.database)}; BackupPath=${this.quotePs(options.backupPath)}; Status='Completed'}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  // Package Management - Chocolatey
  public chocoList(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `choco list --local-only --limit-output`;
    return this.invokeRemote(script, options, false);
  }

  public chocoInstall(options: WindowsConnectionOptions & { readonly packages: readonly string[] }): Promise<WindowsCommandResult> {
    const packagesStr = options.packages.join(" ");
    const script = `choco install ${packagesStr} -y`;
    return this.invokeRemote(script, options, false);
  }

  public chocoUpgrade(options: WindowsConnectionOptions & { readonly packages: readonly string[] }): Promise<WindowsCommandResult> {
    const packagesStr = options.packages.join(" ");
    const script = `choco upgrade ${packagesStr} -y`;
    return this.invokeRemote(script, options, false);
  }

  // Package Management - winget
  public wingetList(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `winget list --accept-source-agreements`;
    return this.invokeRemote(script, options, false);
  }

  public wingetInstall(options: WindowsConnectionOptions & { readonly package: string }): Promise<WindowsCommandResult> {
    const script = `winget install --id ${this.quotePs(options.package)} --accept-package-agreements --accept-source-agreements`;
    return this.invokeRemote(script, options, false);
  }

  public wingetUpgrade(options: WindowsConnectionOptions & { readonly package: string }): Promise<WindowsCommandResult> {
    const script = `winget upgrade --id ${this.quotePs(options.package)} --accept-package-agreements --accept-source-agreements`;
    return this.invokeRemote(script, options, false);
  }

  // Certificate Management
  public certList(options: WindowsConnectionOptions & { readonly store?: "My" | "Root" | "CA" }): Promise<WindowsCommandResult> {
    const store = options.store ?? "My";
    const script = `
Get-ChildItem -Path Cert:\\LocalMachine\\${store} | Select-Object Subject, Issuer, Thumbprint, NotBefore, NotAfter, @{Name='DaysUntilExpiry';Expression={($_.NotAfter - (Get-Date)).Days}}, HasPrivateKey, @{Name='FriendlyName';Expression={$_.FriendlyName}}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public certExpiring(options: WindowsConnectionOptions & { readonly daysThreshold?: number }): Promise<WindowsCommandResult> {
    const days = options.daysThreshold ?? 30;
    const script = `
Get-ChildItem -Path Cert:\\LocalMachine\\My | Where-Object {($_.NotAfter - (Get-Date)).Days -le ${days} -and ($_.NotAfter - (Get-Date)).Days -ge 0} | Select-Object Subject, Issuer, Thumbprint, NotAfter, @{Name='DaysUntilExpiry';Expression={($_.NotAfter - (Get-Date)).Days}}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  // Storage Spaces
  public storageSpacesStatus(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
Get-StoragePool -ErrorAction SilentlyContinue | Select-Object FriendlyName, OperationalStatus, HealthStatus, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB, 2)}}, @{Name='AllocatedSizeGB';Expression={[math]::Round($_.AllocatedSize/1GB, 2)}}, @{Name='UsedPercent';Expression={if ($_.Size -gt 0) {[math]::Round(($_.AllocatedSize / $_.Size) * 100, 2)} else {0}}}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public storageSpacesVirtualDisks(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
Get-VirtualDisk -ErrorAction SilentlyContinue | Select-Object FriendlyName, OperationalStatus, HealthStatus, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB, 2)}}, ResiliencySettingName, NumberOfColumns, NumberOfDataCopies
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  // Volume Shadow Copy (VSS)
  public vssListShadows(options: WindowsConnectionOptions): Promise<WindowsCommandResult> {
    const script = `
Get-CimInstance -ClassName Win32_ShadowCopy | Select-Object ID, VolumeName, InstallDate, @{Name='SizeGB';Expression={[math]::Round($_.AllocatedSpace/1GB, 2)}}, ClientAccessible, Count, DeviceObject
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  public vssCreateShadow(options: WindowsConnectionOptions & { readonly volume: string }): Promise<WindowsCommandResult> {
    const script = `
$volume = ${this.quotePs(options.volume)}
$class = [WMICLASS]"root\\cimv2:Win32_ShadowCopy"
$result = $class.Create($volume, "ClientAccessible")
if ($result.ReturnValue -eq 0) {
  Get-CimInstance -ClassName Win32_ShadowCopy | Where-Object {$_.ID -eq $result.ShadowID} | Select-Object ID, VolumeName, InstallDate
} else {
  throw "Failed to create shadow copy. Return value: $($result.ReturnValue)"
}
    `.trim();
    return this.invokeRemote(script, options, true);
  }

  private quotePs(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
