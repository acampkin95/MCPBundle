import { CommandRunner, type CommandResult } from '../utils/commandRunner.js';

export interface ServiceActionOptions {
  readonly service: string;
  readonly action: 'start' | 'stop' | 'restart' | 'status' | 'enable' | 'disable';
  readonly requiresSudo?: boolean;
}

export interface PackageUpdateOptions {
  readonly upgrade?: boolean;
  readonly autoRemove?: boolean;
  readonly requiresSudo?: boolean;
}

export interface DockerActionOptions {
  readonly command:
    | 'status'
    | 'ps'
    | 'images'
    | 'prune'
    | 'compose-up'
    | 'compose-down'
    | 'logs'
    | 'stats'
    | 'inspect'
    | 'diff'
    | 'export'
    | 'commit'
    | 'logs-label';
  readonly composeFile?: string;
  readonly services?: string[];
  readonly tail?: number;
  readonly build?: boolean;
  readonly pull?: boolean;
  readonly envFile?: string;
  readonly container?: string;
  readonly format?: string;
  readonly exportPath?: string;
  readonly imageName?: string;
  readonly labelFilter?: string;
  readonly since?: string;
  readonly requiresSudo?: boolean;
}

export interface PostgreActionOptions {
  readonly command:
    | 'status'
    | 'connections'
    | 'vacuum'
    | 'custom'
    | 'repack'
    | 'backup'
    | 'restore'
    | 'wal'
    | 'isready';
  readonly database?: string;
  readonly customSql?: string;
  readonly backupPath?: string;
  readonly restorePath?: string;
  readonly requiresSudo?: boolean;
}

export interface NetworkDiagnosticsOptions {
  readonly interfaceName?: string;
  readonly analyzeRoutes?: boolean;
  readonly capture?: boolean;
  readonly destination?: string;
}

export interface VirtualminOptions {
  readonly command:
    | 'list-domains'
    | 'list-users'
    | 'restart-service'
    | 'create-domain'
    | 'backup-domain'
    | 'check-config'
    | 'custom';
  readonly domain?: string;
  readonly user?: string;
  readonly service?: string;
  readonly destination?: string;
  readonly options?: string;
  readonly customArgs?: string;
}

export interface FilesystemAction {
  readonly command:
    | 'list-shares'
    | 'test-smb'
    | 'reload-samba'
    | 'check-samba-config'
    | 'show-nfs-shares'
    | 'file-permissions'
    | 'set-permissions'
    | 'windows-acl-note'
    | 'repair-postgres'
    | 'add-share'
    | 'remove-share'
    | 'add-samba-user'
    | 'list-samba-users'
    | 'update-nfs'
    | 'permissions-snapshot'
    | 'permissions-restore'
    | 'set-acl'
    | 'ownership';
  readonly path?: string;
  readonly user?: string;
  readonly mode?: string;
  readonly recursive?: boolean;
  readonly sharesFile?: string;
  readonly service?: 'smb' | 'winbind' | 'nmbd' | 'nfs';
  readonly postgresDb?: string;
  readonly postgresFix?: 'reindex' | 'vacuum' | 'fsck';
  readonly shareName?: string;
  readonly sharePath?: string;
  readonly shareComment?: string;
  readonly nfsEntry?: string;
  readonly dryRun?: boolean;
  readonly snapshotFile?: string;
  readonly restoreFile?: string;
  readonly aclSpec?: string;
  readonly owner?: string;
  readonly group?: string;
}

export interface SecurityAction {
  readonly command:
    | 'generate-ssh-key'
    | 'list-authorized-keys'
    | 'harden-ssh'
    | 'ufw'
    | 'iptables'
    | 'tcp-health'
    | 'ipv6-health'
    | 'docker-troubleshoot'
    | 'storage-info'
    | 'storage-sync'
    | 'rotate-ssh-key'
    | 'clean-known-hosts'
    | 'fail2ban'
    | 'auditd'
    | 'suricata'
    | 'cis-audit'
    | 'apparmor-status'
    | 'selinux-status'
    | 'lynis'
    | 'ssh-trust-report';
  readonly keyType?: string;
  readonly keyComment?: string;
  readonly keyPath?: string;
  readonly user?: string;
  readonly ufwAction?: 'enable' | 'disable' | 'status' | 'allow' | 'deny';
  readonly ufwRule?: string;
  readonly iptablesRule?: string;
  readonly target?: string;
  readonly interfaceName?: string;
  readonly dockerLog?: string;
  readonly bucketProvider?: 'aws' | 'gcs' | 'azure' | 'minio';
  readonly bucketName?: string;
  readonly bucketPath?: string;
  readonly syncDestination?: string;
  readonly knownHost?: string;
}

export interface KubernetesActionOptions {
  readonly command:
    | 'context'
    | 'get-pods'
    | 'describe-node'
    | 'logs'
    | 'restart-deployment'
    | 'get-nodes';
  readonly namespace?: string;
  readonly resource?: string;
  readonly container?: string;
  readonly since?: string;
  readonly deployment?: string;
}

export class UbuntuAdminService {
  public constructor(private readonly runner: CommandRunner) {}

  public updatePackages(options: PackageUpdateOptions = {}): Promise<CommandResult[]> {
    const commands: string[] = ['sudo apt-get update'];
    if (options.upgrade !== false) {
      commands.push('sudo apt-get upgrade -y');
    }
    if (options.autoRemove) {
      commands.push('sudo apt-get autoremove -y');
    }

    return this.executeSeries(commands, { requiresSudo: options.requiresSudo ?? true });
  }

  public manageService(options: ServiceActionOptions): Promise<CommandResult> {
    const command = `systemctl ${options.action} ${options.service}`;
    return this.runner.run(command, { requiresSudo: options.requiresSudo ?? true });
  }

  public nginxTestConfiguration(): Promise<CommandResult> {
    return this.runner.run('nginx -t', { requiresSudo: true });
  }

  public nginxReload(): Promise<CommandResult> {
    return this.runner.run('systemctl reload nginx', { requiresSudo: true });
  }

  public pm2Status(): Promise<CommandResult> {
    return this.runner.run('pm2 status');
  }

  public pm2Logs(app?: string): Promise<CommandResult> {
    return this.runner.run(app ? `pm2 logs ${app}` : 'pm2 logs');
  }

  public dockerAction(options: DockerActionOptions): Promise<CommandResult> {
    switch (options.command) {
      case 'status':
        return this.runner.run('systemctl status docker', {
          requiresSudo: options.requiresSudo ?? true,
        });
      case 'ps':
        return this.runner.run("docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'");
      case 'images':
        return this.runner.run('docker images');
      case 'prune':
        return this.runner.run('docker system prune -f', {
          requiresSudo: options.requiresSudo ?? true,
        });
      case 'stats':
        return this.runner.run('docker stats --no-stream');
      case 'inspect':
        if (!options.container) {
          throw new Error("Docker inspect requires 'container'.");
        }
        return this.runner.run(
          `docker inspect${options.format ? ` --format '${options.format}'` : ''} ${options.container}`
        );
      case 'diff':
        if (!options.container) {
          throw new Error("Docker diff requires 'container'.");
        }
        return this.runner.run(`docker diff ${options.container}`);
      case 'export':
        if (!options.container || !options.exportPath) {
          throw new Error("Docker export requires 'container' and 'exportPath'.");
        }
        return this.runner.run(`docker export ${options.container} -o ${options.exportPath}`);
      case 'commit':
        if (!options.container || !options.imageName) {
          throw new Error("Docker commit requires 'container' and 'imageName'.");
        }
        return this.runner.run(`docker commit ${options.container} ${options.imageName}`);
      case 'logs-label':
        if (!options.labelFilter) {
          throw new Error("Docker logs-label requires 'labelFilter'.");
        }
        return this.runner.run(
          `for cid in $(docker ps --filter "label=${options.labelFilter}" -q); do echo "Logs for $cid"; docker logs${options.since ? ` --since ${options.since}` : ''} $cid; done`
        );
      case 'compose-up':
        return this.runner.run(
          this.dockerComposeCommand('up -d', options.composeFile, options.services, {
            build: options.build,
            pull: options.pull,
            envFile: options.envFile,
          }),
          { requiresSudo: options.requiresSudo ?? true }
        );
      case 'compose-down':
        return this.runner.run(
          this.dockerComposeCommand('down', options.composeFile, options.services),
          { requiresSudo: options.requiresSudo ?? true }
        );
      case 'logs':
        return this.runner.run(
          this.dockerComposeCommand(
            `logs${options.tail ? ` --tail=${options.tail}` : ''}`,
            options.composeFile,
            options.services
          ),
          { requiresSudo: options.requiresSudo ?? true }
        );
      default:
        throw new Error(`Unsupported Docker command: ${options.command}`);
    }
  }

  public postgresAction(options: PostgreActionOptions): Promise<CommandResult> {
    switch (options.command) {
      case 'status':
        return this.runner.run('systemctl status postgresql', {
          requiresSudo: options.requiresSudo ?? true,
        });
      case 'connections':
        return this.runner.run(
          `sudo -u postgres psql${options.database ? ` ${options.database}` : ''} -c "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"`,
          { requiresSudo: true }
        );
      case 'vacuum':
        return this.runner.run(`sudo -u postgres vacuumdb --all --analyze`, { requiresSudo: true });
      case 'custom':
        if (!options.customSql) {
          throw new Error("Custom SQL command requires 'customSql' input.");
        }
        return this.runner.run(
          `sudo -u postgres psql${options.database ? ` ${options.database}` : ''} -c "${options.customSql.replace(/"/g, '\\"')}"`,
          { requiresSudo: true }
        );
      case 'repack':
        return this.runner.run(`sudo -u postgres pg_repack --all`, { requiresSudo: true });
      case 'backup':
        if (!options.backupPath) {
          throw new Error("PostgreSQL backup requires 'backupPath'.");
        }
        return this.runner.run(`sudo -u postgres pg_dumpall > ${options.backupPath}`, {
          requiresSudo: true,
        });
      case 'restore':
        if (!options.restorePath) {
          throw new Error("PostgreSQL restore requires 'restorePath'.");
        }
        return this.runner.run(`sudo -u postgres psql -f ${options.restorePath}`, {
          requiresSudo: true,
        });
      case 'wal':
        return this.runner.run(
          `sudo -u postgres psql -c "SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());"`,
          { requiresSudo: true }
        );
      case 'isready':
        return this.runner.run(`pg_isready${options.database ? ` -d ${options.database}` : ''}`, {
          requiresSudo: options.requiresSudo ?? false,
        });
      default:
        throw new Error(`Unsupported PostgreSQL command: ${options.command}`);
    }
  }

  public async networkDiagnostics(options: NetworkDiagnosticsOptions): Promise<CommandResult[]> {
    const commands: string[] = [];
    const iface = options.interfaceName ?? 'eth0';
    commands.push(`ip addr show ${iface}`);
    commands.push('ip route show');

    if (options.analyzeRoutes) {
      commands.push('netstat -rn');
      commands.push('ss -tulpn');
    }

    if (options.destination) {
      commands.push(`mtr -rwc 5 ${options.destination}`);
    }

    if (options.capture) {
      commands.push(`sudo tcpdump -i ${iface} -c 100`);
    }

    return this.executeSeries(commands, { requiresSudo: false });
  }

  public virtualminCommand(options: VirtualminOptions): Promise<CommandResult> {
    const base = 'sudo virtualmin';
    switch (options.command) {
      case 'list-domains':
        return this.runner.run(`${base} list-domains --name-only`);
      case 'list-users':
        return this.runner.run(`${base} list-users --multiline`);
      case 'restart-service':
        if (!options.service) {
          throw new Error("Virtualmin service restart requires 'service'.");
        }
        return this.runner.run(`${base} restart-service --service ${options.service}`);
      case 'create-domain':
        if (!options.domain) {
          throw new Error("Virtualmin create-domain requires 'domain'.");
        }
        return this.runner.run(
          `${base} create-domain --domain ${options.domain}${
            options.user ? ` --unix-user ${options.user}` : ''
          }${options.options ? ` ${options.options}` : ''}`
        );
      case 'backup-domain':
        if (!options.domain || !options.destination) {
          throw new Error("Virtualmin backup-domain requires 'domain' and 'destination'.");
        }
        return this.runner.run(
          `${base} backup-domain --domain ${options.domain} --dest ${options.destination}`
        );
      case 'check-config':
        return this.runner.run(`${base} check-config`);
      case 'custom':
        if (!options.customArgs) {
          throw new Error("Virtualmin custom command requires 'customArgs'.");
        }
        return this.runner.run(`${base} ${options.customArgs}`);
      default:
        throw new Error(`Unsupported Virtualmin command: ${options.command}`);
    }
  }

  public async filesystemAction(options: FilesystemAction): Promise<CommandResult[]> {
    switch (options.command) {
      case 'list-shares': {
        const cmd = options.sharesFile ? `testparm -s ${options.sharesFile}` : 'testparm -s';
        return this.executeSeries([cmd], { requiresSudo: true });
      }
      case 'test-smb': {
        if (!options.user || !options.path) {
          throw new Error("SMB testing requires 'user' and 'path'.");
        }
        return this.executeSeries(
          [
            `smbclient -L localhost -U ${options.user}`,
            `smbclient ${options.path} -U ${options.user} -c 'dir'`,
          ],
          { requiresSudo: false }
        );
      }
      case 'reload-samba': {
        const cmd = options.service
          ? `systemctl reload ${options.service}`
          : 'systemctl reload smbd';
        return this.executeSeries([cmd], { requiresSudo: true });
      }
      case 'check-samba-config':
        return this.executeSeries(['testparm -s'], { requiresSudo: true });
      case 'show-nfs-shares':
        return this.executeSeries(['exportfs -v'], { requiresSudo: true });
      case 'file-permissions':
        if (!options.path) {
          throw new Error("File permissions check requires 'path'.");
        }
        return this.executeSeries([`ls -alh ${options.path}`, `stat ${options.path}`], {
          requiresSudo: false,
        });
      case 'set-permissions':
        if (!options.path || !options.mode) {
          throw new Error("Setting permissions requires 'path' and 'mode'.");
        }
        return this.executeSeries(
          [
            `${options.recursive ? 'chmod -R' : 'chmod'} ${options.mode} ${options.path}`,
            `ls -alh ${options.path}`,
          ],
          { requiresSudo: true }
        );
      case 'windows-acl-note':
        return this.executeSeries(
          [
            `echo "Windows ACL management requires PowerShell or Samba vfs_acl_xattr configuration."`,
            `echo "Refer to: https://wiki.samba.org/index.php/Setting_up_a_Share_Using_Windows_ACLs"`,
          ],
          { requiresSudo: false }
        );
      case 'repair-postgres':
        return this.handlePostgresRepair(options);
      case 'add-share': {
        if (!options.shareName || !options.sharePath) {
          throw new Error("Adding a share requires 'shareName' and 'sharePath'.");
        }
        const comment = options.shareComment ?? 'Managed by ubuntu-admin';
        return this.executeSeries(
          [
            `sudo net usershare add ${options.shareName} ${options.sharePath} "${comment}" everyone:F`,
            'sudo net usershare info',
          ],
          { requiresSudo: true }
        );
      }
      case 'remove-share': {
        if (!options.shareName) {
          throw new Error("Removing a share requires 'shareName'.");
        }
        return this.executeSeries(
          [`sudo net usershare delete ${options.shareName}`, 'sudo net usershare info'],
          { requiresSudo: true }
        );
      }
      case 'add-samba-user': {
        if (!options.user) {
          throw new Error("Adding Samba user requires 'user'.");
        }
        return this.executeSeries([`sudo smbpasswd -a ${options.user}`, 'sudo pdbedit -L'], {
          requiresSudo: true,
        });
      }
      case 'list-samba-users':
        return this.executeSeries(['sudo pdbedit -L'], { requiresSudo: true });
      case 'update-nfs': {
        if (!options.nfsEntry) {
          throw new Error("Updating NFS exports requires 'nfsEntry'.");
        }
        if (options.dryRun) {
          return this.executeSeries(
            [`echo "Would append to /etc/exports: ${options.nfsEntry}"`, 'exportfs -s'],
            { requiresSudo: false }
          );
        }
        return this.executeSeries(
          [`sudo sh -c "echo '${options.nfsEntry}' >> /etc/exports"`, 'sudo exportfs -arv'],
          { requiresSudo: true }
        );
      }
      case 'permissions-snapshot': {
        if (!options.path || !options.snapshotFile) {
          throw new Error("Permissions snapshot requires 'path' and 'snapshotFile'.");
        }
        return this.executeSeries([`getfacl -R ${options.path} > ${options.snapshotFile}`], {
          requiresSudo: true,
        });
      }
      case 'permissions-restore': {
        if (!options.restoreFile) {
          throw new Error("Permissions restore requires 'restoreFile'.");
        }
        return this.executeSeries([`setfacl --restore=${options.restoreFile}`], {
          requiresSudo: true,
        });
      }
      case 'set-acl': {
        if (!options.path || !options.aclSpec) {
          throw new Error("Setting ACL requires 'path' and 'aclSpec'.");
        }
        return this.executeSeries(
          [
            `setfacl ${options.recursive ? '-R' : ''} -m ${options.aclSpec} ${options.path}`,
            `getfacl ${options.path}`,
          ],
          { requiresSudo: true }
        );
      }
      case 'ownership': {
        if (!options.path || (!options.owner && !options.group)) {
          throw new Error("Ownership change requires 'path' and at least 'owner' or 'group'.");
        }
        const ownerSpec = `${options.owner ?? ''}${options.group ? `:${options.group}` : ''}`;
        return this.executeSeries(
          [
            `${options.recursive ? 'chown -R' : 'chown'} ${ownerSpec} ${options.path}`,
            `ls -alh ${options.path}`,
          ],
          { requiresSudo: true }
        );
      }
      default:
        throw new Error(`Unsupported filesystem command: ${options.command}`);
    }
  }

  public async securityAction(options: SecurityAction): Promise<CommandResult[]> {
    switch (options.command) {
      case 'generate-ssh-key': {
        const keyType = options.keyType ?? 'ed25519';
        const comment = options.keyComment ?? 'mcp-key';
        const keyPath = options.keyPath ?? `~/.ssh/${comment}`;
        return this.executeSeries(
          [`ssh-keygen -t ${keyType} -C "${comment}" -f ${keyPath} -N ""`, `ls -alh ${keyPath}*`],
          { requiresSudo: false }
        );
      }
      case 'list-authorized-keys': {
        const user = options.user ?? '$USER';
        return this.executeSeries([`sudo -u ${user} cat ~/.ssh/authorized_keys`], {
          requiresSudo: true,
        });
      }
      case 'harden-ssh':
        return this.executeSeries(
          [
            "sudo sed -i.bak -e 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config",
            "sudo sed -i -e 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config",
            'sudo systemctl restart sshd',
          ],
          { requiresSudo: true }
        );
      case 'ufw': {
        const action = options.ufwAction ?? 'status';
        const rule = options.ufwRule ?? '';
        const command = `sudo ufw ${action}${rule ? ` ${rule}` : ''}`;
        return this.executeSeries([command, 'sudo ufw status verbose'], { requiresSudo: true });
      }
      case 'iptables': {
        if (!options.iptablesRule) {
          throw new Error("iptables action requires 'iptablesRule'.");
        }
        return this.executeSeries(
          [`sudo iptables ${options.iptablesRule}`, 'sudo iptables -L -n -v'],
          { requiresSudo: true }
        );
      }
      case 'tcp-health': {
        const iface = options.interfaceName ?? 'eth0';
        const target = options.target ?? '8.8.8.8';
        return this.executeSeries(
          [`ethtool ${iface}`, `ss -s`, `sudo tcpdump -i ${iface} -c 50`, `mtr -rwc 5 ${target}`],
          { requiresSudo: false }
        );
      }
      case 'ipv6-health': {
        const target = options.target ?? '2001:4860:4860::8888';
        return this.executeSeries(
          [
            'sysctl net.ipv6.conf.all.disable_ipv6',
            'ip -6 addr',
            `ping6 -c 3 ${target}`,
            `traceroute6 ${target}`,
          ],
          { requiresSudo: false }
        );
      }
      case 'docker-troubleshoot':
        return this.executeSeries(
          [
            'docker ps -a',
            'docker system df',
            'docker events --since 1h --until 0s',
            options.dockerLog
              ? `docker logs ${options.dockerLog}`
              : "echo 'Set dockerLog to fetch container logs'",
          ],
          { requiresSudo: false }
        );
      case 'rotate-ssh-key': {
        const keyType = options.keyType ?? 'ed25519';
        const comment = options.keyComment ?? `rotated-${Date.now()}`;
        const keyPath = options.keyPath ?? `~/.ssh/${comment}`;
        return this.executeSeries(
          [
            `ssh-keygen -t ${keyType} -C "${comment}" -f ${keyPath} -N ""`,
            options.target
              ? `ssh-keygen -R ${options.target}`
              : "echo 'Provide securityTarget to clean known host entry'",
            `ls -alh ${keyPath}*`,
          ],
          { requiresSudo: false }
        );
      }
      case 'clean-known-hosts':
        if (!options.knownHost) {
          throw new Error("Cleaning known hosts requires 'knownHost'.");
        }
        return this.executeSeries(
          [
            `ssh-keygen -R ${options.knownHost}`,
            `grep ${options.knownHost} ~/.ssh/known_hosts || echo 'Entry removed.'`,
          ],
          { requiresSudo: false }
        );
      case 'fail2ban':
        return this.executeSeries(
          ['sudo fail2ban-client status', 'sudo fail2ban-client status sshd'],
          { requiresSudo: true }
        );
      case 'auditd':
        return this.executeSeries(['sudo service auditd status', 'sudo aureport --summary'], {
          requiresSudo: true,
        });
      case 'suricata':
        return this.executeSeries(
          ['sudo systemctl status suricata', 'sudo tail -n 100 /var/log/suricata/suricata.log'],
          { requiresSudo: true }
        );
      case 'cis-audit':
        return this.executeSeries(
          [
            "echo 'Running CIS audit via lynis --tests-from-group cis'",
            'sudo lynis audit system --tests-from-group cis --quick',
          ],
          { requiresSudo: true }
        );
      case 'apparmor-status':
        return this.executeSeries(['sudo aa-status'], { requiresSudo: true });
      case 'selinux-status':
        return this.executeSeries(['sestatus'], { requiresSudo: false });
      case 'lynis':
        return this.executeSeries(['sudo lynis audit system --cronjob'], { requiresSudo: true });
      case 'ssh-trust-report':
        return this.executeSeries(['sudo find /home -name authorized_keys -print -exec cat {} ;'], {
          requiresSudo: true,
        });
      case 'storage-info': {
        const provider = options.bucketProvider ?? 'aws';
        switch (provider) {
          case 'aws':
            return this.executeSeries(
              options.bucketName ? [`aws s3 ls s3://${options.bucketName}`] : ['aws s3 ls'],
              { requiresSudo: false }
            );
          case 'gcs':
            return this.executeSeries(
              options.bucketName ? [`gsutil ls gs://${options.bucketName}`] : ['gsutil ls'],
              { requiresSudo: false }
            );
          case 'azure':
            return this.executeSeries(
              options.bucketName
                ? [`az storage blob list --container-name ${options.bucketName} --output table`]
                : ['az storage container list --output table'],
              { requiresSudo: false }
            );
          case 'minio':
            return this.executeSeries(
              options.bucketName ? [`mc ls myminio/${options.bucketName}`] : ['mc ls myminio'],
              { requiresSudo: false }
            );
          default:
            throw new Error(`Unsupported bucket provider: ${provider}`);
        }
      }
      case 'storage-sync': {
        if (!options.bucketProvider || !options.bucketName || !options.syncDestination) {
          throw new Error('Storage sync requires provider, bucketName, and syncDestination.');
        }
        const destination = options.syncDestination;
        switch (options.bucketProvider) {
          case 'aws':
            return this.executeSeries(
              [`aws s3 sync s3://${options.bucketName}${options.bucketPath ?? ''} ${destination}`],
              { requiresSudo: false }
            );
          case 'gcs':
            return this.executeSeries(
              [
                `gsutil -m rsync -r gs://${options.bucketName}${options.bucketPath ?? ''} ${destination}`,
              ],
              { requiresSudo: false }
            );
          case 'azure':
            return this.executeSeries(
              [
                `az storage blob sync --container ${options.bucketName} --source ${destination} --destination ${options.bucketPath ?? ''}`,
              ],
              { requiresSudo: false }
            );
          case 'minio':
            return this.executeSeries(
              [`mc mirror myminio/${options.bucketName}${options.bucketPath ?? ''} ${destination}`],
              { requiresSudo: false }
            );
          default:
            throw new Error(`Unsupported bucket provider: ${options.bucketProvider}`);
        }
      }
      default:
        throw new Error(`Unsupported security command: ${options.command}`);
    }
  }

  public kubernetesAction(options: KubernetesActionOptions): Promise<CommandResult> {
    switch (options.command) {
      case 'context':
        return this.runner.run('kubectl config get-contexts');
      case 'get-pods':
        return this.runner.run(
          `kubectl get pods${options.namespace ? ` -n ${options.namespace}` : ''} -o wide`
        );
      case 'get-nodes':
        return this.runner.run('kubectl get nodes -o wide');
      case 'describe-node':
        if (!options.resource) {
          throw new Error("Describe node requires 'resource'.");
        }
        return this.runner.run(`kubectl describe node ${options.resource}`);
      case 'logs':
        if (!options.resource) {
          throw new Error("Fetching logs requires 'resource' (pod name).");
        }
        return this.runner.run(
          `kubectl logs ${options.resource}${options.container ? ` -c ${options.container}` : ''}${options.namespace ? ` -n ${options.namespace}` : ''}${options.since ? ` --since=${options.since}` : ''}`
        );
      case 'restart-deployment':
        if (!options.deployment) {
          throw new Error("Restart deployment requires 'deployment'.");
        }
        return this.runner.run(
          `kubectl rollout restart deployment/${options.deployment}${options.namespace ? ` -n ${options.namespace}` : ''}`
        );
      default:
        throw new Error(`Unsupported Kubernetes command: ${options.command}`);
    }
  }

  private dockerComposeCommand(
    action: string,
    composeFile?: string,
    services?: string[],
    options?: { build?: boolean; pull?: boolean; envFile?: string }
  ): string {
    const parts = ['docker compose'];
    if (composeFile) {
      parts.push('-f', composeFile);
    }
    if (options?.envFile) {
      parts.push('--env-file', options.envFile);
    }
    parts.push(action);
    if (options?.build) {
      parts.push('--build');
    }
    if (options?.pull) {
      parts.push('--pull');
    }
    if (services?.length) {
      parts.push(...services);
    }
    return parts.join(' ');
  }

  private async executeSeries(
    commands: string[],
    options: { requiresSudo: boolean }
  ): Promise<CommandResult[]> {
    const results: CommandResult[] = [];
    for (const command of commands) {
      results.push(await this.runner.run(command, { requiresSudo: options.requiresSudo }));
    }
    return results;
  }

  private async handlePostgresRepair(options: FilesystemAction): Promise<CommandResult[]> {
    const db = options.postgresDb ?? 'postgres';
    switch (options.postgresFix) {
      case 'reindex':
        return this.executeSeries([`sudo -u postgres reindexdb --all`], { requiresSudo: true });
      case 'vacuum':
        return this.executeSeries([`sudo -u postgres vacuumdb --all --analyze --verbose`], {
          requiresSudo: true,
        });
      case 'fsck':
        return this.executeSeries(
          [
            'systemctl stop postgresql',
            'sudo fsck -y /var/lib/postgresql',
            'systemctl start postgresql',
          ],
          { requiresSudo: true }
        );
      default:
        return this.executeSeries(
          [
            `sudo -u postgres psql ${db} -c 'CHECKPOINT;'`,
            `sudo -u postgres psql ${db} -c 'SELECT datname, last_vacuum, last_autovacuum FROM pg_stat_database;'`,
          ],
          { requiresSudo: true }
        );
    }
  }
}
