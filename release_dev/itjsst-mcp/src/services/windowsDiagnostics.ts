import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";
import { type WindowsConnectionOptions } from "./windowsAdmin.js";

export type WindowsDiagnosticSuite =
  | "system"
  | "performance"
  | "security"
  | "network"
  | "storage"
  | "active-directory"
  | "iis"
  | "hyperv"
  | "updates"
  | "services";

export type WindowsRepairAction =
  | "sfc-scan"
  | "dism-health"
  | "chkdsk"
  | "flush-dns"
  | "reset-winsock"
  | "rebuild-wmi"
  | "reset-windows-update"
  | "repair-app-store"
  | "clear-temp"
  | "defragment";

export interface WindowsDiagnosticsResult {
  readonly label: string;
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly json?: unknown;
}

const SUITE_COMMANDS: Record<WindowsDiagnosticSuite, Array<{ label: string; command: string; jsonOutput?: boolean }>> = {
  system: [
    {
      label: "Operating System",
      command: "Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, LastBootUpTime, TotalVisibleMemorySize, FreePhysicalMemory",
      jsonOutput: true,
    },
    {
      label: "Computer System",
      command: "Get-CimInstance -ClassName Win32_ComputerSystem | Select-Object Name, Manufacturer, Model, Domain, TotalPhysicalMemory, NumberOfProcessors, NumberOfLogicalProcessors",
      jsonOutput: true,
    },
    {
      label: "BIOS",
      command: "Get-CimInstance -ClassName Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, ReleaseDate",
      jsonOutput: true,
    },
    {
      label: "System Uptime",
      command: "$uptime = (Get-Date) - (Get-CimInstance -ClassName Win32_OperatingSystem).LastBootUpTime; [pscustomobject]@{Days=[int]$uptime.TotalDays; Hours=$uptime.Hours; Minutes=$uptime.Minutes; Seconds=$uptime.Seconds}",
      jsonOutput: true,
    },
  ],
  performance: [
    {
      label: "CPU Usage",
      command: "Get-Counter '\\Processor(_Total)\\% Processor Time' | Select-Object -ExpandProperty CounterSamples | Select-Object Path, CookedValue",
      jsonOutput: true,
    },
    {
      label: "Memory Usage",
      command: "$os = Get-CimInstance -ClassName Win32_OperatingSystem; [pscustomobject]@{TotalMemoryGB=[math]::Round($os.TotalVisibleMemorySize/1MB, 2); FreeMemoryGB=[math]::Round($os.FreePhysicalMemory/1MB, 2); UsedMemoryGB=[math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/1MB, 2); UsedPercent=[math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)}",
      jsonOutput: true,
    },
    {
      label: "Disk I/O",
      command: "Get-Counter '\\PhysicalDisk(_Total)\\Disk Reads/sec','\\PhysicalDisk(_Total)\\Disk Writes/sec','\\PhysicalDisk(_Total)\\Avg. Disk Queue Length' | Select-Object -ExpandProperty CounterSamples | Select-Object Path, CookedValue",
      jsonOutput: true,
    },
    {
      label: "Top Processes by CPU",
      command: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 ProcessName, CPU, WS, Id",
      jsonOutput: true,
    },
    {
      label: "Top Processes by Memory",
      command: "Get-Process | Sort-Object WS -Descending | Select-Object -First 10 ProcessName, @{Name='MemoryMB';Expression={[math]::Round($_.WS/1MB, 2)}}, CPU, Id",
      jsonOutput: true,
    },
  ],
  security: [
    {
      label: "Windows Defender Status",
      command: "Get-MpComputerStatus | Select-Object AntivirusEnabled, AntivirusSignatureLastUpdated, RealTimeProtectionEnabled, QuickScanAge, FullScanAge",
      jsonOutput: true,
    },
    {
      label: "Windows Firewall Status",
      command: "Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction, LogFileName",
      jsonOutput: true,
    },
    {
      label: "BitLocker Status",
      command: "Get-BitLockerVolume | Select-Object MountPoint, EncryptionMethod, VolumeStatus, ProtectionStatus, EncryptionPercentage",
      jsonOutput: true,
    },
    {
      label: "Recent Security Events",
      command: "Get-WinEvent -FilterHashtable @{LogName='Security'; StartTime=(Get-Date).AddHours(-1)} -MaxEvents 50 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, LevelDisplayName, Message",
      jsonOutput: true,
    },
    {
      label: "Failed Login Attempts",
      command: "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Message",
      jsonOutput: true,
    },
  ],
  network: [
    {
      label: "Network Adapters",
      command: "Get-NetAdapter | Select-Object Name, Status, LinkSpeed, MacAddress, DriverVersion",
      jsonOutput: true,
    },
    {
      label: "IP Configuration",
      command: "Get-NetIPAddress | Where-Object {$_.AddressFamily -eq 'IPv4'} | Select-Object InterfaceAlias, IPAddress, PrefixLength, AddressState",
      jsonOutput: true,
    },
    {
      label: "DNS Client Configuration",
      command: "Get-DnsClientServerAddress | Where-Object {$_.ServerAddresses} | Select-Object InterfaceAlias, ServerAddresses",
      jsonOutput: true,
    },
    {
      label: "Routing Table",
      command: "Get-NetRoute | Where-Object {$_.DestinationPrefix -ne 'ff00::/8'} | Select-Object DestinationPrefix, NextHop, InterfaceAlias, RouteMetric | Sort-Object RouteMetric",
      jsonOutput: true,
    },
    {
      label: "TCP Connections",
      command: "Get-NetTCPConnection | Where-Object {$_.State -eq 'Established'} | Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, State, OwningProcess | Sort-Object LocalPort",
      jsonOutput: true,
    },
  ],
  storage: [
    {
      label: "Logical Disks",
      command: "Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID, VolumeName, FileSystem, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB,2)}}, @{Name='FreeGB';Expression={[math]::Round($_.FreeSpace/1GB,2)}}, @{Name='FreePercent';Expression={if ($_.Size -eq 0) {0} else {[math]::Round(($_.FreeSpace / $_.Size) * 100, 2)}}}",
      jsonOutput: true,
    },
    {
      label: "Physical Disks",
      command: "Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, BusType, HealthStatus, OperationalStatus, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB,2)}}",
      jsonOutput: true,
    },
    {
      label: "Volumes",
      command: "Get-Volume | Select-Object DriveLetter, FileSystemLabel, FileSystem, DriveType, HealthStatus, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB,2)}}, @{Name='SizeRemainingGB';Expression={[math]::Round($_.SizeRemaining/1GB,2)}}",
      jsonOutput: true,
    },
    {
      label: "Storage Pools",
      command: "Get-StoragePool -ErrorAction SilentlyContinue | Select-Object FriendlyName, HealthStatus, OperationalStatus, @{Name='SizeGB';Expression={[math]::Round($_.Size/1GB,2)}}, @{Name='AllocatedSizeGB';Expression={[math]::Round($_.AllocatedSize/1GB,2)}}",
      jsonOutput: true,
    },
  ],
  "active-directory": [
    {
      label: "Domain Controllers",
      command: "Get-ADDomainController -Filter * -ErrorAction SilentlyContinue | Select-Object Name, Domain, IPv4Address, OperatingSystem, IsGlobalCatalog, IsReadOnly",
      jsonOutput: true,
    },
    {
      label: "Domain Info",
      command: "Get-ADDomain -ErrorAction SilentlyContinue | Select-Object Name, Forest, DomainMode, PDCEmulator, RIDMaster, InfrastructureMaster",
      jsonOutput: true,
    },
    {
      label: "FSMO Roles",
      command: "$domain = Get-ADDomain -ErrorAction SilentlyContinue; $forest = Get-ADForest -ErrorAction SilentlyContinue; [pscustomobject]@{PDCEmulator=$domain.PDCEmulator; RIDMaster=$domain.RIDMaster; InfrastructureMaster=$domain.InfrastructureMaster; SchemaMaster=$forest.SchemaMaster; DomainNamingMaster=$forest.DomainNamingMaster}",
      jsonOutput: true,
    },
    {
      label: "Replication Status",
      command: "Get-ADReplicationPartnerMetadata -Target * -Scope Domain -ErrorAction SilentlyContinue | Select-Object Server, Partner, LastReplicationSuccess, LastReplicationResult, ConsecutiveReplicationFailures",
      jsonOutput: true,
    },
    {
      label: "Locked Accounts",
      command: "Search-ADAccount -LockedOut -ErrorAction SilentlyContinue | Select-Object Name, SamAccountName, LockedOut, LockoutTime, DistinguishedName",
      jsonOutput: true,
    },
  ],
  iis: [
    {
      label: "IIS Sites",
      command: "Import-Module WebAdministration -ErrorAction SilentlyContinue; Get-Website -ErrorAction SilentlyContinue | Select-Object Name, Id, State, @{Name='Bindings';Expression={$_.bindings.Collection | ForEach-Object {$_.protocol + '://' + $_.bindingInformation}}}, physicalPath",
      jsonOutput: true,
    },
    {
      label: "Application Pools",
      command: "Import-Module WebAdministration -ErrorAction SilentlyContinue; Get-IISAppPool -ErrorAction SilentlyContinue | Select-Object Name, Status, ManagedRuntimeVersion, ManagedPipelineMode, StartMode",
      jsonOutput: true,
    },
    {
      label: "SSL Certificates",
      command: "Import-Module WebAdministration -ErrorAction SilentlyContinue; Get-ChildItem -Path IIS:SSLBindings -ErrorAction SilentlyContinue | Select-Object IPAddress, Port, @{Name='Thumbprint';Expression={$_.Thumbprint}}, @{Name='Subject';Expression={(Get-ChildItem Cert:\\LocalMachine\\My\\$($_.Thumbprint) -ErrorAction SilentlyContinue).Subject}}, @{Name='NotAfter';Expression={(Get-ChildItem Cert:\\LocalMachine\\My\\$($_.Thumbprint) -ErrorAction SilentlyContinue).NotAfter}}",
      jsonOutput: true,
    },
    {
      label: "Recent IIS Errors",
      command: "Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-IIS-*'; Level=2; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, Message",
      jsonOutput: true,
    },
  ],
  hyperv: [
    {
      label: "Hyper-V VMs",
      command: "Get-VM -ErrorAction SilentlyContinue | Select-Object Name, State, CPUUsage, @{Name='MemoryAssignedMB';Expression={[math]::Round($_.MemoryAssigned/1MB, 2)}}, @{Name='MemoryDemandMB';Expression={[math]::Round($_.MemoryDemand/1MB, 2)}}, Uptime, Status",
      jsonOutput: true,
    },
    {
      label: "Virtual Switches",
      command: "Get-VMSwitch -ErrorAction SilentlyContinue | Select-Object Name, SwitchType, NetAdapterInterfaceDescription, AllowManagementOS",
      jsonOutput: true,
    },
    {
      label: "VM Network Adapters",
      command: "Get-VMNetworkAdapter -All -ErrorAction SilentlyContinue | Select-Object VMName, Name, SwitchName, MacAddress, Status, IPAddresses",
      jsonOutput: true,
    },
    {
      label: "Hyper-V Host",
      command: "Get-VMHost -ErrorAction SilentlyContinue | Select-Object ComputerName, LogicalProcessorCount, MemoryCapacity, VirtualHardDiskPath, VirtualMachinePath",
      jsonOutput: true,
    },
  ],
  updates: [
    {
      label: "Windows Update Status",
      command: "$session = New-Object -ComObject Microsoft.Update.Session; $searcher = $session.CreateUpdateSearcher(); $result = $searcher.Search('IsInstalled=0'); [pscustomobject]@{PendingUpdates=$result.Updates.Count; Updates=$result.Updates | Select-Object Title, @{Name='SizeKB';Expression={[math]::Round($_.MaxDownloadSize/1024, 2)}}, MsrcSeverity}",
      jsonOutput: true,
    },
    {
      label: "Recent Hotfixes",
      command: "Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 20 HotFixID, Description, InstalledBy, InstalledOn",
      jsonOutput: true,
    },
    {
      label: "Windows Update Service",
      command: "Get-Service wuauserv | Select-Object Name, DisplayName, Status, StartType",
      jsonOutput: true,
    },
  ],
  services: [
    {
      label: "Critical Services",
      command: "$critical = @('wuauserv', 'BITS', 'EventLog', 'DNS', 'DHCP', 'W3SVC', 'MSSQLSERVER', 'vmms', 'NTDS'); Get-Service -Name $critical -ErrorAction SilentlyContinue | Select-Object Name, DisplayName, Status, StartType",
      jsonOutput: true,
    },
    {
      label: "Stopped Auto Services",
      command: "Get-Service | Where-Object {$_.StartType -eq 'Automatic' -and $_.Status -ne 'Running'} | Select-Object Name, DisplayName, Status, StartType",
      jsonOutput: true,
    },
    {
      label: "Recent Service Events",
      command: "Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Service Control Manager'; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 50 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Id, LevelDisplayName, Message",
      jsonOutput: true,
    },
  ],
};

const REPAIR_COMMANDS: Record<WindowsRepairAction, { label: string; command: string; requiresElevation: boolean }> = {
  "sfc-scan": {
    label: "System File Checker scan and repair",
    command: "sfc /scannow",
    requiresElevation: true,
  },
  "dism-health": {
    label: "DISM repair Windows image",
    command: "DISM /Online /Cleanup-Image /RestoreHealth",
    requiresElevation: true,
  },
  chkdsk: {
    label: "Check and repair file system (C: drive)",
    command: "chkdsk C: /F /R",
    requiresElevation: true,
  },
  "flush-dns": {
    label: "Flush DNS cache",
    command: "Clear-DnsClientCache",
    requiresElevation: false,
  },
  "reset-winsock": {
    label: "Reset network stack (Winsock)",
    command: "netsh winsock reset; netsh int ip reset",
    requiresElevation: true,
  },
  "rebuild-wmi": {
    label: "Rebuild WMI repository",
    command: "winmgmt /salvagerepository",
    requiresElevation: true,
  },
  "reset-windows-update": {
    label: "Reset Windows Update components",
    command: "Stop-Service wuauserv, cryptSvc, bits, msiserver -Force; Remove-Item C:\\Windows\\SoftwareDistribution -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item C:\\Windows\\System32\\catroot2 -Recurse -Force -ErrorAction SilentlyContinue; Start-Service wuauserv, cryptSvc, bits, msiserver",
    requiresElevation: true,
  },
  "repair-app-store": {
    label: "Reset Microsoft Store",
    command: "Get-AppxPackage -AllUsers Microsoft.WindowsStore | ForEach-Object {Add-AppxPackage -DisableDevelopmentMode -Register \"$($_.InstallLocation)\\AppXManifest.xml\"}",
    requiresElevation: true,
  },
  "clear-temp": {
    label: "Clear temporary files",
    command: "Remove-Item $env:TEMP\\* -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item C:\\Windows\\Temp\\* -Recurse -Force -ErrorAction SilentlyContinue",
    requiresElevation: true,
  },
  defragment: {
    label: "Defragment and optimize drives",
    command: "Get-Volume | Where-Object {$_.DriveType -eq 'Fixed' -and $_.DriveLetter} | ForEach-Object {Optimize-Volume -DriveLetter $_.DriveLetter -Defrag -Verbose}",
    requiresElevation: true,
  },
};

export class WindowsDiagnosticsService {
  public constructor(private readonly runner: CommandRunner) {}

  public listSuites(): WindowsDiagnosticSuite[] {
    return Object.keys(SUITE_COMMANDS) as WindowsDiagnosticSuite[];
  }

  public listRepairs(): WindowsRepairAction[] {
    return Object.keys(REPAIR_COMMANDS) as WindowsRepairAction[];
  }

  public async runLocalDiagnostics(suite: WindowsDiagnosticSuite): Promise<WindowsDiagnosticsResult[]> {
    const commands = SUITE_COMMANDS[suite];
    return this.runLocalCommands(commands);
  }

  public async runRemoteDiagnostics(
    suite: WindowsDiagnosticSuite,
    connection: WindowsConnectionOptions,
  ): Promise<WindowsDiagnosticsResult[]> {
    const commands = SUITE_COMMANDS[suite];
    return this.runRemoteCommands(commands, connection);
  }

  public async runLocalRepair(action: WindowsRepairAction, dryRun: boolean = true): Promise<WindowsDiagnosticsResult[]> {
    const command = REPAIR_COMMANDS[action];
    if (dryRun) {
      return [
        {
          label: command.label,
          command: command.command,
          stdout: `[DRY RUN] Would execute: ${command.command}`,
          stderr: "",
          exitCode: 0,
        },
      ];
    }
    return this.runLocalCommands([{ label: command.label, command: command.command }]);
  }

  public async runRemoteRepair(
    action: WindowsRepairAction,
    connection: WindowsConnectionOptions,
    dryRun: boolean = true,
  ): Promise<WindowsDiagnosticsResult[]> {
    const command = REPAIR_COMMANDS[action];
    if (dryRun) {
      return [
        {
          label: command.label,
          command: command.command,
          stdout: `[DRY RUN] Would execute on ${connection.host}: ${command.command}`,
          stderr: "",
          exitCode: 0,
        },
      ];
    }
    return this.runRemoteCommands([{ label: command.label, command: command.command }], connection);
  }

  private async runLocalCommands(
    commands: Array<{ label: string; command: string; jsonOutput?: boolean }>,
  ): Promise<WindowsDiagnosticsResult[]> {
    const results: WindowsDiagnosticsResult[] = [];
    for (const item of commands) {
      try {
        const fullCommand = item.jsonOutput ? `pwsh -Command "${item.command} | ConvertTo-Json -Depth 5"` : `pwsh -Command "${item.command}"`;
        const result = await this.runner.run(fullCommand, { requiresSudo: false, timeoutMs: 60000 });
        results.push(this.formatResult(item.label, item.command, result, item.jsonOutput));
      } catch (error) {
        results.push({
          label: item.label,
          command: item.command,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        });
      }
    }
    return results;
  }

  private async runRemoteCommands(
    commands: Array<{ label: string; command: string; jsonOutput?: boolean }>,
    connection: WindowsConnectionOptions,
  ): Promise<WindowsDiagnosticsResult[]> {
    const results: WindowsDiagnosticsResult[] = [];
    const passwordEnvVar = connection.passwordEnvVar ?? "WINDOWS_REMOTE_PASSWORD";
    const password = connection.password ?? process.env[passwordEnvVar] ?? "";
    const username = connection.username ?? "Administrator";
    const useSsl = connection.useSsl ?? false;
    const port = connection.port ?? (useSsl ? 5986 : 5985);
    const auth = connection.authentication ?? "Default";
    const ignoreCertErrors = connection.ignoreCertErrors ?? false;

    for (const item of commands) {
      try {
        const scriptBlock = item.jsonOutput ? `${item.command} | ConvertTo-Json -Depth 5` : item.command;
        const encodedScript = Buffer.from(scriptBlock, "utf16le").toString("base64");

        const sessionOptions: string[] = [];
        if (useSsl) {
          sessionOptions.push("-UseSSL");
        }
        if (ignoreCertErrors) {
          sessionOptions.push("-SessionOption (New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck)");
        }

        const invokeCommand = `pwsh -Command "$password = ConvertTo-SecureString '${password}' -AsPlainText -Force; $cred = New-Object System.Management.Automation.PSCredential('${username}', $password); Invoke-Command -ComputerName ${connection.host} -Port ${port} -Credential $cred -Authentication ${auth} ${sessionOptions.join(" ")} -ScriptBlock { [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedScript}')) | Invoke-Expression }"`;

        const result = await this.runner.run(invokeCommand, { requiresSudo: false, timeoutMs: 120000 });
        results.push(this.formatResult(item.label, item.command, result, item.jsonOutput));
      } catch (error) {
        results.push({
          label: item.label,
          command: item.command,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        });
      }
    }
    return results;
  }

  private formatResult(
    label: string,
    originalCommand: string,
    result: CommandResult,
    jsonOutput?: boolean,
  ): WindowsDiagnosticsResult {
    let json: unknown = undefined;
    if (jsonOutput && result.stdout.trim()) {
      try {
        json = JSON.parse(result.stdout);
      } catch {
        // Not valid JSON, leave undefined
      }
    }

    return {
      label,
      command: originalCommand,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      json,
    };
  }
}
