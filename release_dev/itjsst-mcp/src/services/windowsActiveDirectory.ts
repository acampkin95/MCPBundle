import { CommandRunner, type CommandResult } from "../utils/commandRunner.js";

export type ADOperation =
  // Read operations (low risk)
  | "get-user"
  | "get-group"
  | "get-computer"
  | "get-ou"
  | "list-users"
  | "list-groups"
  | "list-computers"
  | "list-ous"
  | "get-domain-info"
  | "get-domain-controllers"
  | "get-fsmo-roles"
  | "get-replication-status"
  | "search-locked-accounts"
  | "search-disabled-accounts"
  | "search-expired-passwords"
  | "search-stale-objects"
  | "get-gpo-list"
  | "get-gpo-report"
  // Write operations - User Management (medium risk)
  | "create-user"
  | "modify-user"
  | "delete-user"
  | "enable-user"
  | "disable-user"
  | "unlock-user"
  | "reset-password"
  | "set-password-never-expires"
  | "force-password-change"
  // Write operations - Group Management (medium risk)
  | "create-group"
  | "modify-group"
  | "delete-group"
  | "add-group-member"
  | "remove-group-member"
  | "get-group-members"
  // Write operations - Computer Management (medium risk)
  | "create-computer"
  | "delete-computer"
  | "disable-computer"
  | "enable-computer"
  | "reset-computer-password"
  // Write operations - OU Management (high risk)
  | "create-ou"
  | "delete-ou"
  | "move-object"
  // Write operations - GPO Management (high risk)
  | "create-gpo"
  | "delete-gpo"
  | "link-gpo"
  | "unlink-gpo";

export interface ADUserInfo {
  readonly SamAccountName?: string;
  readonly UserPrincipalName?: string;
  readonly GivenName?: string;
  readonly Surname?: string;
  readonly DisplayName?: string;
  readonly EmailAddress?: string;
  readonly Enabled?: boolean;
  readonly LockedOut?: boolean;
  readonly PasswordExpired?: boolean;
  readonly PasswordNeverExpires?: boolean;
  readonly PasswordLastSet?: string;
  readonly LastLogonDate?: string;
  readonly DistinguishedName?: string;
  readonly Description?: string;
  readonly MemberOf?: string[];
}

export interface ADGroupInfo {
  readonly SamAccountName?: string;
  readonly Name?: string;
  readonly GroupScope?: string;
  readonly GroupCategory?: string;
  readonly DistinguishedName?: string;
  readonly Description?: string;
  readonly MemberCount?: number;
  readonly Members?: string[];
}

export interface ADComputerInfo {
  readonly Name?: string;
  readonly DNSHostName?: string;
  readonly OperatingSystem?: string;
  readonly OperatingSystemVersion?: string;
  readonly Enabled?: boolean;
  readonly LastLogonDate?: string;
  readonly DistinguishedName?: string;
  readonly IPv4Address?: string;
}

export interface ADResult {
  readonly success: boolean;
  readonly operation: ADOperation;
  readonly data?: unknown;
  readonly message?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

export interface ADOperationOptions {
  readonly operation: ADOperation;
  readonly dryRun?: boolean;
  // Connection parameters (all optional for local execution)
  readonly host?: string;
  readonly username?: string;
  readonly password?: string;
  readonly passwordEnvVar?: string;
  readonly useSsl?: boolean;
  readonly port?: number;
  readonly authentication?: "Default" | "Negotiate" | "Kerberos" | "Basic" | "Credssp";
  readonly ignoreCertErrors?: boolean;
  // Common parameters
  readonly identity?: string;
  readonly name?: string;
  readonly distinguishedName?: string;
  readonly searchBase?: string;
  readonly filter?: string;
  // User-specific parameters
  readonly givenName?: string;
  readonly surname?: string;
  readonly displayName?: string;
  readonly emailAddress?: string;
  readonly mustChangePassword?: boolean;
  readonly passwordNeverExpires?: boolean;
  readonly enabled?: boolean;
  readonly description?: string;
  // Group-specific parameters
  readonly groupScope?: "DomainLocal" | "Global" | "Universal";
  readonly groupCategory?: "Distribution" | "Security";
  readonly members?: string[];
  readonly memberToAdd?: string;
  readonly memberToRemove?: string;
  // OU-specific parameters
  readonly path?: string;
  readonly targetPath?: string;
  // GPO-specific parameters
  readonly gpoName?: string;
  readonly gpoGuid?: string;
  readonly linkTarget?: string;
  readonly linkEnabled?: boolean;
  readonly linkOrder?: number;
}

export class WindowsActiveDirectoryService {
  public constructor(private readonly runner: CommandRunner) {}

  public async executeOperation(options: ADOperationOptions): Promise<ADResult> {
    const { operation, dryRun = false } = options;

    // Build PowerShell script based on operation
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

    // Execute the script
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

  private isWriteOperation(operation: ADOperation): boolean {
    const writeOperations: ADOperation[] = [
      "create-user",
      "modify-user",
      "delete-user",
      "enable-user",
      "disable-user",
      "unlock-user",
      "reset-password",
      "set-password-never-expires",
      "force-password-change",
      "create-group",
      "modify-group",
      "delete-group",
      "add-group-member",
      "remove-group-member",
      "create-computer",
      "delete-computer",
      "disable-computer",
      "enable-computer",
      "reset-computer-password",
      "create-ou",
      "delete-ou",
      "move-object",
      "create-gpo",
      "delete-gpo",
      "link-gpo",
      "unlink-gpo",
    ];
    return writeOperations.includes(operation);
  }

  private buildScript(options: ADOperationOptions): string {
    const { operation } = options;

    switch (operation) {
      // Read operations - Users
      case "get-user":
        return this.buildGetUserScript(options);
      case "list-users":
        return this.buildListUsersScript(options);
      case "search-locked-accounts":
        return `Search-ADAccount -LockedOut | Select-Object Name, SamAccountName, LockedOut, LockoutTime, DistinguishedName | ConvertTo-Json -Depth 5`;
      case "search-disabled-accounts":
        return `Search-ADAccount -AccountDisabled | Select-Object Name, SamAccountName, Enabled, LastLogonDate, DistinguishedName | ConvertTo-Json -Depth 5`;
      case "search-expired-passwords":
        return `Search-ADAccount -PasswordExpired | Select-Object Name, SamAccountName, PasswordExpired, PasswordLastSet, DistinguishedName | ConvertTo-Json -Depth 5`;
      case "search-stale-objects":
        return `$date = (Get-Date).AddDays(-90); Search-ADAccount -AccountInactive -TimeSpan 90 | Select-Object Name, SamAccountName, LastLogonDate, DistinguishedName | ConvertTo-Json -Depth 5`;

      // Read operations - Groups
      case "get-group":
        return this.buildGetGroupScript(options);
      case "get-group-members":
        return this.buildGetGroupMembersScript(options);
      case "list-groups":
        return this.buildListGroupsScript(options);

      // Read operations - Computers
      case "get-computer":
        return this.buildGetComputerScript(options);
      case "list-computers":
        return this.buildListComputersScript(options);

      // Read operations - OUs
      case "get-ou":
        return `Get-ADOrganizationalUnit -Identity ${this.quotePs(options.distinguishedName ?? options.identity ?? "")} -Properties * | Select-Object Name, DistinguishedName, Description, City, Country, ManagedBy, Created, Modified | ConvertTo-Json -Depth 5`;
      case "list-ous":
        return `Get-ADOrganizationalUnit -Filter * ${options.searchBase ? `-SearchBase ${this.quotePs(options.searchBase)}` : ""} | Select-Object Name, DistinguishedName, Description | Sort-Object DistinguishedName | ConvertTo-Json -Depth 5`;

      // Read operations - Domain
      case "get-domain-info":
        return `Get-ADDomain | Select-Object Name, Forest, DomainMode, PDCEmulator, RIDMaster, InfrastructureMaster, DomainControllersContainer, UsersContainer, ComputersContainer, SystemsContainer, ForeignSecurityPrincipalsContainer | ConvertTo-Json -Depth 5`;
      case "get-domain-controllers":
        return `Get-ADDomainController -Filter * | Select-Object Name, Domain, IPv4Address, IPv6Address, OperatingSystem, OperatingSystemVersion, IsGlobalCatalog, IsReadOnly, Enabled | ConvertTo-Json -Depth 5`;
      case "get-fsmo-roles":
        return `$domain = Get-ADDomain; $forest = Get-ADForest; [pscustomobject]@{PDCEmulator=$domain.PDCEmulator; RIDMaster=$domain.RIDMaster; InfrastructureMaster=$domain.InfrastructureMaster; SchemaMaster=$forest.SchemaMaster; DomainNamingMaster=$forest.DomainNamingMaster} | ConvertTo-Json -Depth 5`;
      case "get-replication-status":
        return `Get-ADReplicationPartnerMetadata -Target * -Scope Domain | Select-Object Server, Partner, LastReplicationSuccess, LastReplicationResult, ConsecutiveReplicationFailures, LastReplicationAttempt | ConvertTo-Json -Depth 5`;

      // Read operations - GPO
      case "get-gpo-list":
        return `Get-GPO -All | Select-Object DisplayName, Id, GpoStatus, CreationTime, ModificationTime, Description | Sort-Object DisplayName | ConvertTo-Json -Depth 5`;
      case "get-gpo-report":
        return `Get-GPOReport -Name ${this.quotePs(options.gpoName ?? options.name ?? "")} -ReportType Xml`;

      // Write operations - User Management
      case "create-user":
        return this.buildCreateUserScript(options);
      case "modify-user":
        return this.buildModifyUserScript(options);
      case "delete-user":
        return `Remove-ADUser -Identity ${this.quotePs(options.identity ?? "")} -Confirm:$false`;
      case "enable-user":
        return `Enable-ADAccount -Identity ${this.quotePs(options.identity ?? "")}`;
      case "disable-user":
        return `Disable-ADAccount -Identity ${this.quotePs(options.identity ?? "")}`;
      case "unlock-user":
        return `Unlock-ADAccount -Identity ${this.quotePs(options.identity ?? "")}`;
      case "reset-password":
        return this.buildResetPasswordScript(options);
      case "set-password-never-expires":
        return `Set-ADUser -Identity ${this.quotePs(options.identity ?? "")} -PasswordNeverExpires $${options.passwordNeverExpires ? "true" : "false"}`;
      case "force-password-change":
        return `Set-ADUser -Identity ${this.quotePs(options.identity ?? "")} -ChangePasswordAtLogon $true`;

      // Write operations - Group Management
      case "create-group":
        return this.buildCreateGroupScript(options);
      case "modify-group":
        return this.buildModifyGroupScript(options);
      case "delete-group":
        return `Remove-ADGroup -Identity ${this.quotePs(options.identity ?? "")} -Confirm:$false`;
      case "add-group-member":
        return `Add-ADGroupMember -Identity ${this.quotePs(options.identity ?? "")} -Members ${this.quotePs(options.memberToAdd ?? "")}`;
      case "remove-group-member":
        return `Remove-ADGroupMember -Identity ${this.quotePs(options.identity ?? "")} -Members ${this.quotePs(options.memberToRemove ?? "")} -Confirm:$false`;

      // Write operations - Computer Management
      case "create-computer":
        return `New-ADComputer -Name ${this.quotePs(options.name ?? "")} ${options.path ? `-Path ${this.quotePs(options.path)}` : ""} ${options.description ? `-Description ${this.quotePs(options.description)}` : ""} ${options.enabled !== undefined ? `-Enabled $${options.enabled}` : ""}`;
      case "delete-computer":
        return `Remove-ADComputer -Identity ${this.quotePs(options.identity ?? "")} -Confirm:$false`;
      case "disable-computer":
        return `Disable-ADAccount -Identity ${this.quotePs(options.identity ?? "")}`;
      case "enable-computer":
        return `Enable-ADAccount -Identity ${this.quotePs(options.identity ?? "")}`;
      case "reset-computer-password":
        return `Reset-ComputerMachinePassword -Server ${this.quotePs(options.host ?? "")}`;

      // Write operations - OU Management
      case "create-ou":
        return `New-ADOrganizationalUnit -Name ${this.quotePs(options.name ?? "")} -Path ${this.quotePs(options.path ?? "")} ${options.description ? `-Description ${this.quotePs(options.description)}` : ""}`;
      case "delete-ou":
        return `Remove-ADOrganizationalUnit -Identity ${this.quotePs(options.distinguishedName ?? options.identity ?? "")} -Confirm:$false`;
      case "move-object":
        return `Move-ADObject -Identity ${this.quotePs(options.identity ?? "")} -TargetPath ${this.quotePs(options.targetPath ?? "")}`;

      // Write operations - GPO Management
      case "create-gpo":
        return `New-GPO -Name ${this.quotePs(options.gpoName ?? options.name ?? "")} ${options.description ? `-Comment ${this.quotePs(options.description)}` : ""}`;
      case "delete-gpo":
        return `Remove-GPO -Name ${this.quotePs(options.gpoName ?? options.name ?? "")}`;
      case "link-gpo":
        return `New-GPLink -Name ${this.quotePs(options.gpoName ?? options.name ?? "")} -Target ${this.quotePs(options.linkTarget ?? "")} ${options.linkEnabled !== undefined ? `-LinkEnabled ${options.linkEnabled ? "Yes" : "No"}` : ""} ${options.linkOrder ? `-Order ${options.linkOrder}` : ""}`;
      case "unlink-gpo":
        return `Remove-GPLink -Name ${this.quotePs(options.gpoName ?? options.name ?? "")} -Target ${this.quotePs(options.linkTarget ?? "")}`;

      default:
        throw new Error(`Unknown AD operation: ${operation}`);
    }
  }

  private buildGetUserScript(options: ADOperationOptions): string {
    const identity = options.identity ?? options.name ?? "";
    return `Get-ADUser -Identity ${this.quotePs(identity)} -Properties * | Select-Object SamAccountName, UserPrincipalName, GivenName, Surname, DisplayName, EmailAddress, Enabled, LockedOut, PasswordExpired, PasswordNeverExpires, PasswordLastSet, LastLogonDate, Created, Modified, DistinguishedName, Description, MemberOf, Manager, Title, Department, Company, Office, OfficePhone, MobilePhone | ConvertTo-Json -Depth 5`;
  }

  private buildListUsersScript(options: ADOperationOptions): string {
    const filter = options.filter ?? "*";
    const searchBase = options.searchBase ? `-SearchBase ${this.quotePs(options.searchBase)}` : "";
    return `Get-ADUser -Filter ${this.quotePs(filter)} ${searchBase} -Properties SamAccountName, DisplayName, EmailAddress, Enabled, LastLogonDate, DistinguishedName | Select-Object SamAccountName, DisplayName, EmailAddress, Enabled, LastLogonDate, DistinguishedName | Sort-Object SamAccountName | ConvertTo-Json -Depth 5`;
  }

  private buildGetGroupScript(options: ADOperationOptions): string {
    const identity = options.identity ?? options.name ?? "";
    return `Get-ADGroup -Identity ${this.quotePs(identity)} -Properties * | Select-Object SamAccountName, Name, GroupScope, GroupCategory, DistinguishedName, Description, Created, Modified, ManagedBy, Members | ConvertTo-Json -Depth 5`;
  }

  private buildGetGroupMembersScript(options: ADOperationOptions): string {
    const identity = options.identity ?? options.name ?? "";
    return `Get-ADGroupMember -Identity ${this.quotePs(identity)} -Recursive | Select-Object Name, SamAccountName, objectClass, DistinguishedName | Sort-Object Name | ConvertTo-Json -Depth 5`;
  }

  private buildListGroupsScript(options: ADOperationOptions): string {
    const filter = options.filter ?? "*";
    const searchBase = options.searchBase ? `-SearchBase ${this.quotePs(options.searchBase)}` : "";
    return `Get-ADGroup -Filter ${this.quotePs(filter)} ${searchBase} -Properties SamAccountName, Name, GroupScope, GroupCategory, Description, DistinguishedName | Select-Object SamAccountName, Name, GroupScope, GroupCategory, Description, DistinguishedName | Sort-Object Name | ConvertTo-Json -Depth 5`;
  }

  private buildGetComputerScript(options: ADOperationOptions): string {
    const identity = options.identity ?? options.name ?? "";
    return `Get-ADComputer -Identity ${this.quotePs(identity)} -Properties * | Select-Object Name, DNSHostName, OperatingSystem, OperatingSystemVersion, Enabled, LastLogonDate, Created, Modified, DistinguishedName, IPv4Address, IPv6Address, Description | ConvertTo-Json -Depth 5`;
  }

  private buildListComputersScript(options: ADOperationOptions): string {
    const filter = options.filter ?? "*";
    const searchBase = options.searchBase ? `-SearchBase ${this.quotePs(options.searchBase)}` : "";
    return `Get-ADComputer -Filter ${this.quotePs(filter)} ${searchBase} -Properties Name, DNSHostName, OperatingSystem, Enabled, LastLogonDate, DistinguishedName | Select-Object Name, DNSHostName, OperatingSystem, Enabled, LastLogonDate, DistinguishedName | Sort-Object Name | ConvertTo-Json -Depth 5`;
  }

  private buildCreateUserScript(options: ADOperationOptions): string {
    const parts = [`New-ADUser`];
    parts.push(`-Name ${this.quotePs(options.name ?? "")}`);
    if (options.givenName) parts.push(`-GivenName ${this.quotePs(options.givenName)}`);
    if (options.surname) parts.push(`-Surname ${this.quotePs(options.surname)}`);
    if (options.displayName) parts.push(`-DisplayName ${this.quotePs(options.displayName)}`);
    if (options.emailAddress) parts.push(`-EmailAddress ${this.quotePs(options.emailAddress)}`);
    if (options.description) parts.push(`-Description ${this.quotePs(options.description)}`);
    if (options.path) parts.push(`-Path ${this.quotePs(options.path)}`);
    if (options.enabled !== undefined) parts.push(`-Enabled $${options.enabled}`);
    if (options.password) {
      parts.push(`-AccountPassword (ConvertTo-SecureString ${this.quotePs(options.password)} -AsPlainText -Force)`);
    }
    if (options.mustChangePassword) parts.push(`-ChangePasswordAtLogon $true`);
    if (options.passwordNeverExpires) parts.push(`-PasswordNeverExpires $true`);
    return parts.join(" ");
  }

  private buildModifyUserScript(options: ADOperationOptions): string {
    const parts = [`Set-ADUser -Identity ${this.quotePs(options.identity ?? "")}`];
    if (options.givenName) parts.push(`-GivenName ${this.quotePs(options.givenName)}`);
    if (options.surname) parts.push(`-Surname ${this.quotePs(options.surname)}`);
    if (options.displayName) parts.push(`-DisplayName ${this.quotePs(options.displayName)}`);
    if (options.emailAddress) parts.push(`-EmailAddress ${this.quotePs(options.emailAddress)}`);
    if (options.description) parts.push(`-Description ${this.quotePs(options.description)}`);
    if (options.enabled !== undefined) parts.push(`-Enabled $${options.enabled}`);
    return parts.join(" ");
  }

  private buildResetPasswordScript(options: ADOperationOptions): string {
    if (!options.password) {
      throw new Error("Password is required for reset-password operation");
    }
    return `Set-ADAccountPassword -Identity ${this.quotePs(options.identity ?? "")} -NewPassword (ConvertTo-SecureString ${this.quotePs(options.password)} -AsPlainText -Force) -Reset`;
  }

  private buildCreateGroupScript(options: ADOperationOptions): string {
    const parts = [`New-ADGroup -Name ${this.quotePs(options.name ?? "")}`];
    if (options.groupScope) parts.push(`-GroupScope ${options.groupScope}`);
    if (options.groupCategory) parts.push(`-GroupCategory ${options.groupCategory}`);
    if (options.path) parts.push(`-Path ${this.quotePs(options.path)}`);
    if (options.description) parts.push(`-Description ${this.quotePs(options.description)}`);
    return parts.join(" ");
  }

  private buildModifyGroupScript(options: ADOperationOptions): string {
    const parts = [`Set-ADGroup -Identity ${this.quotePs(options.identity ?? "")}`];
    if (options.displayName) parts.push(`-DisplayName ${this.quotePs(options.displayName)}`);
    if (options.description) parts.push(`-Description ${this.quotePs(options.description)}`);
    if (options.groupCategory) parts.push(`-GroupCategory ${options.groupCategory}`);
    return parts.join(" ");
  }

  private async executeScript(script: string, options: ADOperationOptions): Promise<CommandResult> {
    const mode = options.host ? "remote" : "local";

    if (mode === "local") {
      const command = `pwsh -Command "${script.replace(/"/g, '\\"')}"`;
      return this.runner.run(command, { requiresSudo: false, timeoutMs: 120000 });
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
