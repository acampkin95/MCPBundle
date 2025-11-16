import { CommandRunner, type CommandResult } from '../utils/commandRunner.js';

export type IISOperation =
  // Website operations
  | 'list-sites'
  | 'get-site'
  | 'create-site'
  | 'delete-site'
  | 'start-site'
  | 'stop-site'
  | 'restart-site'
  // App pool operations
  | 'list-app-pools'
  | 'get-app-pool'
  | 'create-app-pool'
  | 'delete-app-pool'
  | 'start-app-pool'
  | 'stop-app-pool'
  | 'restart-app-pool'
  | 'recycle-app-pool'
  // Binding operations
  | 'list-bindings'
  | 'add-binding'
  | 'remove-binding'
  // SSL certificate operations
  | 'list-ssl-bindings'
  | 'list-certificates'
  | 'bind-certificate'
  // Configuration operations
  | 'get-site-config'
  | 'set-authentication'
  | 'list-virtual-directories'
  | 'create-virtual-directory'
  | 'delete-virtual-directory'
  // Log operations
  | 'get-log-settings'
  | 'parse-recent-logs';

export interface IISConnectionOptions {
  readonly host?: string;
  readonly username?: string;
  readonly password?: string;
  readonly passwordEnvVar?: string;
  readonly useSsl?: boolean;
  readonly port?: number;
  readonly authentication?: 'Default' | 'Negotiate' | 'Kerberos' | 'Basic' | 'Credssp';
  readonly ignoreCertErrors?: boolean;
}

export interface IISOperationOptions extends IISConnectionOptions {
  readonly operation: IISOperation;
  readonly dryRun?: boolean;
  // Site parameters
  readonly siteName?: string;
  readonly physicalPath?: string;
  readonly bindingInformation?: string;
  readonly protocol?: 'http' | 'https';
  readonly appPoolName?: string;
  // App pool parameters
  readonly managedRuntimeVersion?: 'v4.0' | 'v2.0' | 'No Managed Code';
  readonly managedPipelineMode?: 'Integrated' | 'Classic';
  readonly startMode?: 'AlwaysRunning' | 'OnDemand';
  // Binding parameters
  readonly ipAddress?: string;
  readonly hostHeader?: string;
  readonly certificateHash?: string;
  readonly certificateStoreName?: string;
  // Virtual directory parameters
  readonly vdirPath?: string;
  readonly vdirPhysicalPath?: string;
  // Authentication parameters
  readonly anonymousAuth?: boolean;
  readonly windowsAuth?: boolean;
  readonly basicAuth?: boolean;
  // Log parameters
  readonly logPath?: string;
  readonly maxLogLines?: number;
}

export interface IISResult {
  readonly success: boolean;
  readonly operation: IISOperation;
  readonly data?: unknown;
  readonly message?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export class WindowsIISService {
  public constructor(private readonly runner: CommandRunner) {}

  public async executeOperation(options: IISOperationOptions): Promise<IISResult> {
    const { operation, dryRun = false } = options;

    const script = this.buildScript(options);

    if (dryRun && this.isWriteOperation(operation)) {
      return {
        success: true,
        operation,
        message: `[DRY RUN] Would execute: ${operation}`,
        stdout: script,
        stderr: '',
        exitCode: 0,
      };
    }

    const result = await this.executeScript(script, options);

    return {
      success: result.code === 0,
      operation,
      data: this.parseResult(result.stdout),
      message: result.code === 0 ? 'Operation completed successfully' : 'Operation failed',
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
    };
  }

  private isWriteOperation(operation: IISOperation): boolean {
    const writeOperations: IISOperation[] = [
      'create-site',
      'delete-site',
      'start-site',
      'stop-site',
      'restart-site',
      'create-app-pool',
      'delete-app-pool',
      'start-app-pool',
      'stop-app-pool',
      'restart-app-pool',
      'recycle-app-pool',
      'add-binding',
      'remove-binding',
      'bind-certificate',
      'set-authentication',
      'create-virtual-directory',
      'delete-virtual-directory',
    ];
    return writeOperations.includes(operation);
  }

  private buildScript(options: IISOperationOptions): string {
    const { operation } = options;
    const importModule = 'Import-Module WebAdministration -ErrorAction Stop;';

    switch (operation) {
      // Website operations
      case 'list-sites':
        return `${importModule} Get-Website | Select-Object Name, Id, State, @{Name='Bindings';Expression={$_.bindings.Collection | ForEach-Object {$_.protocol + '://' + $_.bindingInformation}}}, physicalPath, applicationPool | ConvertTo-Json -Depth 5`;

      case 'get-site':
        return `${importModule} Get-Website -Name ${this.quotePs(options.siteName ?? '')} | Select-Object Name, Id, State, @{Name='Bindings';Expression={$_.bindings.Collection | ForEach-Object {$_.protocol + '://' + $_.bindingInformation}}}, physicalPath, applicationPool, @{Name='Limits';Expression={$_.limits}}, @{Name='LogFile';Expression={$_.logFile}} | ConvertTo-Json -Depth 5`;

      case 'create-site':
        return `${importModule} New-Website -Name ${this.quotePs(options.siteName ?? '')} -PhysicalPath ${this.quotePs(options.physicalPath ?? '')} ${options.appPoolName ? `-ApplicationPool ${this.quotePs(options.appPoolName)}` : ''} ${options.bindingInformation ? `-BindingInformation ${this.quotePs(options.bindingInformation)}` : ''} ${options.protocol ? `-Protocol ${options.protocol}` : ''}`;

      case 'delete-site':
        return `${importModule} Remove-Website -Name ${this.quotePs(options.siteName ?? '')}`;

      case 'start-site':
        return `${importModule} Start-Website -Name ${this.quotePs(options.siteName ?? '')}`;

      case 'stop-site':
        return `${importModule} Stop-Website -Name ${this.quotePs(options.siteName ?? '')}`;

      case 'restart-site':
        return `${importModule} Stop-Website -Name ${this.quotePs(options.siteName ?? '')}; Start-Sleep -Seconds 2; Start-Website -Name ${this.quotePs(options.siteName ?? '')}`;

      // App pool operations
      case 'list-app-pools':
        return `${importModule} Get-IISAppPool | Select-Object Name, Status, ManagedRuntimeVersion, ManagedPipelineMode, StartMode, @{Name='ProcessModel';Expression={$_.processModel}} | ConvertTo-Json -Depth 5`;

      case 'get-app-pool':
        return `${importModule} Get-IISAppPool -Name ${this.quotePs(options.appPoolName ?? '')} | Select-Object Name, Status, ManagedRuntimeVersion, ManagedPipelineMode, StartMode, @{Name='ProcessModel';Expression={$_.processModel}}, @{Name='Recycling';Expression={$_.recycling}}, @{Name='Failure';Expression={$_.failure}} | ConvertTo-Json -Depth 5`;

      case 'create-app-pool':
        return `${importModule} New-WebAppPool -Name ${this.quotePs(options.appPoolName ?? '')} ${options.managedRuntimeVersion ? `-Force` : ''}; ${options.managedRuntimeVersion ? `Set-ItemProperty IIS:\\AppPools\\${options.appPoolName} -Name managedRuntimeVersion -Value ${this.quotePs(options.managedRuntimeVersion)};` : ''} ${options.managedPipelineMode ? `Set-ItemProperty IIS:\\AppPools\\${options.appPoolName} -Name managedPipelineMode -Value ${this.quotePs(options.managedPipelineMode)};` : ''}`;

      case 'delete-app-pool':
        return `${importModule} Remove-WebAppPool -Name ${this.quotePs(options.appPoolName ?? '')}`;

      case 'start-app-pool':
        return `${importModule} Start-WebAppPool -Name ${this.quotePs(options.appPoolName ?? '')}`;

      case 'stop-app-pool':
        return `${importModule} Stop-WebAppPool -Name ${this.quotePs(options.appPoolName ?? '')}`;

      case 'restart-app-pool':
        return `${importModule} Restart-WebAppPool -Name ${this.quotePs(options.appPoolName ?? '')}`;

      case 'recycle-app-pool':
        return `${importModule} Restart-WebAppPool -Name ${this.quotePs(options.appPoolName ?? '')}`;

      // Binding operations
      case 'list-bindings':
        return `${importModule} Get-WebBinding ${options.siteName ? `-Name ${this.quotePs(options.siteName)}` : ''} | Select-Object protocol, bindingInformation, @{Name='SiteName';Expression={(Get-ItemProperty $_.ItemXPath).name}}, certificateHash, certificateStoreName | ConvertTo-Json -Depth 5`;

      case 'add-binding':
        return `${importModule} New-WebBinding -Name ${this.quotePs(options.siteName ?? '')} -Protocol ${this.quotePs(options.protocol ?? 'http')} ${options.ipAddress ? `-IPAddress ${this.quotePs(options.ipAddress)}` : ''} ${options.port ? `-Port ${options.port}` : ''} ${options.hostHeader ? `-HostHeader ${this.quotePs(options.hostHeader)}` : ''}`;

      case 'remove-binding':
        return `${importModule} Remove-WebBinding -Name ${this.quotePs(options.siteName ?? '')} -Protocol ${this.quotePs(options.protocol ?? 'http')} ${options.bindingInformation ? `-BindingInformation ${this.quotePs(options.bindingInformation)}` : ''}`;

      // SSL certificate operations
      case 'list-ssl-bindings':
        return `${importModule} Get-ChildItem -Path IIS:SSLBindings | Select-Object IPAddress, Port, @{Name='Thumbprint';Expression={$_.Thumbprint}}, @{Name='Subject';Expression={(Get-ChildItem Cert:\\LocalMachine\\My\\$($_.Thumbprint) -ErrorAction SilentlyContinue).Subject}}, @{Name='NotAfter';Expression={(Get-ChildItem Cert:\\LocalMachine\\My\\$($_.Thumbprint) -ErrorAction SilentlyContinue).NotAfter}}, @{Name='Issuer';Expression={(Get-ChildItem Cert:\\LocalMachine\\My\\$($_.Thumbprint) -ErrorAction SilentlyContinue).Issuer}} | ConvertTo-Json -Depth 5`;

      case 'list-certificates':
        return `Get-ChildItem -Path Cert:\\LocalMachine\\My | Select-Object Subject, Issuer, Thumbprint, NotBefore, NotAfter, @{Name='DaysUntilExpiry';Expression={($_.NotAfter - (Get-Date)).Days}}, HasPrivateKey, @{Name='KeyUsage';Expression={$_.Extensions | Where-Object {$_.Oid.FriendlyName -eq 'Key Usage'} | Select-Object -ExpandProperty Format -First 1}} | Sort-Object NotAfter | ConvertTo-Json -Depth 5`;

      case 'bind-certificate':
        return `${importModule} $cert = Get-ChildItem -Path Cert:\\LocalMachine\\My\\${options.certificateHash ?? ''}; New-Item -Path IIS:SSLBindings\\${options.ipAddress ?? '0.0.0.0'}!${options.port ?? 443} -Value $cert -Force`;

      // Configuration operations
      case 'get-site-config':
        return `${importModule} Get-WebConfiguration -Filter "/system.webServer/*" -PSPath "IIS:\\Sites\\${options.siteName ?? ''}" | Select-Object PSPath, Filter, @{Name='Value';Expression={$_.Value}} | ConvertTo-Json -Depth 5`;

      case 'set-authentication':
        return `${importModule} ${options.anonymousAuth !== undefined ? `Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/anonymousAuthentication" -Name enabled -Value $${options.anonymousAuth} -PSPath "IIS:\\Sites\\${options.siteName ?? ''}";` : ''} ${options.windowsAuth !== undefined ? `Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/windowsAuthentication" -Name enabled -Value $${options.windowsAuth} -PSPath "IIS:\\Sites\\${options.siteName ?? ''}";` : ''} ${options.basicAuth !== undefined ? `Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/basicAuthentication" -Name enabled -Value $${options.basicAuth} -PSPath "IIS:\\Sites\\${options.siteName ?? ''}";` : ''} Write-Output "Authentication settings updated"`;

      case 'list-virtual-directories':
        return `${importModule} Get-WebVirtualDirectory -Site ${this.quotePs(options.siteName ?? '')} | Select-Object Path, PhysicalPath, @{Name='Site';Expression={$_.ItemXPath -replace '.*name=''([^'']+)''.*','$1'}} | ConvertTo-Json -Depth 5`;

      case 'create-virtual-directory':
        return `${importModule} New-WebVirtualDirectory -Site ${this.quotePs(options.siteName ?? '')} -Name ${this.quotePs(options.vdirPath ?? '')} -PhysicalPath ${this.quotePs(options.vdirPhysicalPath ?? '')}`;

      case 'delete-virtual-directory':
        return `${importModule} Remove-WebVirtualDirectory -Site ${this.quotePs(options.siteName ?? '')} -Name ${this.quotePs(options.vdirPath ?? '')}`;

      // Log operations
      case 'get-log-settings':
        return `${importModule} Get-WebConfiguration -Filter "/system.applicationHost/sites/site[@name='${options.siteName ?? ''}']/logFile" | Select-Object directory, period, logFormat, @{Name='logExtFileFlags';Expression={$_.logExtFileFlags}} | ConvertTo-Json -Depth 5`;

      case 'parse-recent-logs':
        return this.buildParseLogsScript(options);

      default:
        throw new Error(`Unknown IIS operation: ${operation}`);
    }
  }

  private buildParseLogsScript(options: IISOperationOptions): string {
    const maxLines = options.maxLogLines ?? 100;
    const logPath = options.logPath ?? 'C:\\inetpub\\logs\\LogFiles\\W3SVC1';
    return `
$logFiles = Get-ChildItem -Path ${this.quotePs(logPath)} -Filter "*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1;
if ($logFiles) {
  $content = Get-Content $logFiles.FullName -Tail ${maxLines} -ErrorAction SilentlyContinue;
  $parsed = $content | Where-Object {$_ -notmatch '^#'} | ForEach-Object {
    $fields = $_ -split '\\s+';
    if ($fields.Count -ge 9) {
      [pscustomobject]@{
        Date = $fields[0];
        Time = $fields[1];
        ClientIP = $fields[2];
        Method = $fields[3];
        UriStem = $fields[4];
        Status = $fields[6];
        TimeTaken = $fields[8];
      }
    }
  };
  $parsed | ConvertTo-Json -Depth 5;
} else {
  Write-Output "[]";
}
    `.trim();
  }

  private async executeScript(
    script: string,
    options: IISConnectionOptions
  ): Promise<CommandResult> {
    const mode = options.host ? 'remote' : 'local';

    if (mode === 'local') {
      const command = `pwsh -Command "${script.replace(/"/g, '\\"')}"`;
      return this.runner.run(command, { requiresSudo: false, timeoutMs: 120000 });
    } else {
      // Remote execution via WinRM
      const passwordEnvVar = options.passwordEnvVar ?? 'WINDOWS_REMOTE_PASSWORD';
      const password = options.password ?? process.env[passwordEnvVar] ?? '';
      const username = options.username ?? 'Administrator';
      const useSsl = options.useSsl ?? false;
      const port = options.port ?? (useSsl ? 5986 : 5985);
      const auth = options.authentication ?? 'Default';
      const ignoreCertErrors = options.ignoreCertErrors ?? false;

      const encodedScript = Buffer.from(script, 'utf16le').toString('base64');

      const sessionOptions: string[] = [];
      if (useSsl) sessionOptions.push('-UseSSL');
      if (ignoreCertErrors) {
        sessionOptions.push(
          '-SessionOption (New-PSSessionOption -SkipCACheck -SkipCNCheck -SkipRevocationCheck)'
        );
      }

      const invokeCommand = `pwsh -Command "$password = ConvertTo-SecureString '${password}' -AsPlainText -Force; $cred = New-Object System.Management.Automation.PSCredential('${username}', $password); Invoke-Command -ComputerName ${options.host} -Port ${port} -Credential $cred -Authentication ${auth} ${sessionOptions.join(' ')} -ScriptBlock { [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${encodedScript}')) | Invoke-Expression }"`;

      return this.runner.run(invokeCommand, { requiresSudo: false, timeoutMs: 120000 });
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
