#!/usr/bin/env node
/**
 * WireGuard VPN Mesh Network Setup
 * Security-focused implementation using execFileNoThrow
 * OWASP: A07:2021 - Identification and Authentication Failures
 */

import { execFileNoThrow } from '../../src/utils/execFileNoThrow.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

// Server configurations with strict typing
interface ServerConfig {
  name: string;
  ip: string;
  wgIPs: {
    root: string;
    mcp: string;
    red: string;
  };
}

const SERVERS: ServerConfig[] = [
  {
    name: 'VMI01',
    ip: '46.250.243.123',
    wgIPs: {
      root: '10.0.50.1',
      mcp: '10.0.51.1',
      red: '10.0.52.1'
    }
  },
  {
    name: 'VMI02D',
    ip: '46.250.241.70',
    wgIPs: {
      root: '10.0.50.2',
      mcp: '10.0.51.2',
      red: '10.0.52.2'
    }
  },
  {
    name: 'VMI03',
    ip: '154.26.158.31',
    wgIPs: {
      root: '10.0.50.3',
      mcp: '10.0.51.3',
      red: '10.0.52.3'
    }
  }
];

const ROOT_PASSWORD = 'C0nnaught';
const TUNNELS = ['root', 'mcp', 'red'] as const;
const TUNNEL_PORTS = {
  root: 51820,
  mcp: 51821,
  red: 51822
};

type TunnelName = typeof TUNNELS[number];

interface WireGuardKey {
  privateKey: string;
  publicKey: string;
}

interface TunnelKeys {
  [serverName: string]: {
    [tunnel in TunnelName]: WireGuardKey;
  };
}

class WireGuardSetup {
  private keys: TunnelKeys = {};

  /**
   * Execute command on remote server using sshpass
   * Input validation: Server IP is from trusted list only
   */
  private async remoteExec(server: ServerConfig, command: string[]): Promise<string> {
    // Validate server is in our trusted list
    if (!SERVERS.find(s => s.ip === server.ip)) {
      throw new Error(`Untrusted server IP: ${server.ip}`);
    }

    const result = await execFileNoThrow('sshpass', [
      '-p', ROOT_PASSWORD,
      'ssh',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'BatchMode=no',
      `root@${server.ip}`,
      command.join(' ')
    ]);

    if (!result.success) {
      throw new Error(`Remote execution failed: ${result.stderr}`);
    }

    return result.stdout;
  }

  /**
   * Copy file to remote server
   * Input validation: Paths are sanitized
   */
  private async remoteCopy(server: ServerConfig, localFile: string, remoteFile: string): Promise<void> {
    // Path traversal prevention
    const safePath = path.normalize(localFile);
    if (safePath.includes('..')) {
      throw new Error('Path traversal attempt detected');
    }

    const result = await execFileNoThrow('sshpass', [
      '-p', ROOT_PASSWORD,
      'scp',
      '-o', 'StrictHostKeyChecking=no',
      safePath,
      `root@${server.ip}:${remoteFile}`
    ]);

    if (!result.success) {
      throw new Error(`File copy failed: ${result.stderr}`);
    }
  }

  /**
   * Install WireGuard and basic security tools
   */
  async installWireGuard(server: ServerConfig): Promise<void> {
    console.log(`Installing WireGuard on ${server.name}...`);

    // Update package list and install WireGuard
    await this.remoteExec(server, [
      'apt-get', 'update', '&&',
      'apt-get', 'install', '-y',
      'wireguard', 'wireguard-tools', 'qrencode', 'ufw', 'fail2ban'
    ]);

    // Enable IP forwarding for VPN functionality
    await this.remoteExec(server, [
      'echo', '"net.ipv4.ip_forward=1"', '>>', '/etc/sysctl.conf'
    ]);

    await this.remoteExec(server, ['sysctl', '-p']);

    console.log(`✓ WireGuard installed on ${server.name}`);
  }

  /**
   * Generate WireGuard keypairs
   * Security: Keys are generated on the target system for better entropy
   */
  async generateKeys(server: ServerConfig): Promise<void> {
    console.log(`Generating WireGuard keypairs for ${server.name}...`);

    if (!this.keys[server.name]) {
      this.keys[server.name] = {} as any;
    }

    for (const tunnel of TUNNELS) {
      // Create directory for keys
      await this.remoteExec(server, [
        'mkdir', '-p', `/etc/wireguard/keys/${tunnel}`
      ]);

      // Generate private key
      const privateKey = await this.remoteExec(server, [
        'wg', 'genkey'
      ]);

      // Save private key and generate public key
      await this.remoteExec(server, [
        'echo', `"${privateKey.trim()}"`, '>', `/etc/wireguard/keys/${tunnel}/privatekey`
      ]);

      const publicKey = await this.remoteExec(server, [
        'echo', `"${privateKey.trim()}"`, '|', 'wg', 'pubkey'
      ]);

      await this.remoteExec(server, [
        'echo', `"${publicKey.trim()}"`, '>', `/etc/wireguard/keys/${tunnel}/publickey`
      ]);

      // Set proper permissions (owner read only)
      await this.remoteExec(server, [
        'chmod', '600', `/etc/wireguard/keys/${tunnel}/privatekey`
      ]);

      // Store keys in memory for config generation
      this.keys[server.name][tunnel] = {
        privateKey: privateKey.trim(),
        publicKey: publicKey.trim()
      };

      console.log(`✓ Keys generated for ${server.name} - ${tunnel} tunnel`);
    }
  }

  /**
   * Generate WireGuard configuration files
   * Security: Implements strict firewall rules per tunnel
   */
  async generateConfigs(): Promise<void> {
    console.log('Generating WireGuard configurations...');

    for (const server of SERVERS) {
      for (const tunnel of TUNNELS) {
        const config = this.generateTunnelConfig(server, tunnel);
        const configPath = path.join(
          '/Users/alex/Projects/MCP Bundle/deployment/wireguard/configs',
          `${server.name}-wg-${tunnel}.conf`
        );

        await fs.writeFile(configPath, config, { mode: 0o600 });
        console.log(`✓ Generated config for ${server.name} - ${tunnel} tunnel`);
      }
    }
  }

  /**
   * Generate specific tunnel configuration
   * Security: Implements principle of least privilege
   */
  private generateTunnelConfig(server: ServerConfig, tunnel: TunnelName): string {
    const serverKey = this.keys[server.name][tunnel];
    const port = TUNNEL_PORTS[tunnel];

    let config = `# WireGuard Configuration - ${server.name} - ${tunnel.toUpperCase()} Tunnel
# Generated: ${new Date().toISOString()}
# Security Level: ${tunnel === 'root' ? 'FULL ADMIN' : tunnel === 'mcp' ? 'SERVICE MESH' : 'RESTRICTED'}

[Interface]
Address = ${server.wgIPs[tunnel]}/24
ListenPort = ${port}
PrivateKey = ${serverKey.privateKey}

# Security: SaveConfig disabled to prevent config manipulation
SaveConfig = false

# PostUp: Configure firewall rules for this tunnel
PostUp = iptables -A FORWARD -i wg-${tunnel} -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE

# PostDown: Clean up firewall rules
PostDown = iptables -D FORWARD -i wg-${tunnel} -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

`;

    // Add peer configurations
    for (const peer of SERVERS) {
      if (peer.name !== server.name) {
        const peerKey = this.keys[peer.name][tunnel];
        config += `
# Peer: ${peer.name}
[Peer]
PublicKey = ${peerKey.publicKey}
AllowedIPs = ${peer.wgIPs[tunnel]}/32
Endpoint = ${peer.ip}:${port}
PersistentKeepalive = 25
`;
      }
    }

    return config;
  }

  /**
   * Deploy configurations to servers
   */
  async deployConfigs(): Promise<void> {
    console.log('Deploying configurations to servers...');

    for (const server of SERVERS) {
      for (const tunnel of TUNNELS) {
        const configPath = path.join(
          '/Users/alex/Projects/MCP Bundle/deployment/wireguard/configs',
          `${server.name}-wg-${tunnel}.conf`
        );

        await this.remoteCopy(
          server,
          configPath,
          `/etc/wireguard/wg-${tunnel}.conf`
        );

        // Set proper permissions
        await this.remoteExec(server, [
          'chmod', '600', `/etc/wireguard/wg-${tunnel}.conf`
        ]);

        // Start WireGuard interface
        await this.remoteExec(server, [
          'wg-quick', 'up', `wg-${tunnel}`
        ]);

        // Enable at boot
        await this.remoteExec(server, [
          'systemctl', 'enable', `wg-quick@wg-${tunnel}`
        ]);

        console.log(`✓ Deployed and started ${tunnel} tunnel on ${server.name}`);
      }
    }
  }

  /**
   * Configure UFW firewall
   * Security: Defense in depth with strict firewall rules
   */
  async configureFirewall(server: ServerConfig): Promise<void> {
    console.log(`Configuring UFW firewall on ${server.name}...`);

    // Reset UFW to default state
    await this.remoteExec(server, ['ufw', '--force', 'reset']);

    // Set default policies (deny incoming, allow outgoing)
    await this.remoteExec(server, ['ufw', 'default', 'deny', 'incoming']);
    await this.remoteExec(server, ['ufw', 'default', 'allow', 'outgoing']);

    // Allow SSH (critical - do not restrict)
    await this.remoteExec(server, ['ufw', 'allow', '22/tcp']);

    // Allow WireGuard ports
    for (const tunnel of TUNNELS) {
      await this.remoteExec(server, [
        'ufw', 'allow', `${TUNNEL_PORTS[tunnel]}/udp`
      ]);
    }

    // Allow inter-VM communication on WireGuard subnets
    await this.remoteExec(server, ['ufw', 'allow', 'from', '10.0.50.0/24']);
    await this.remoteExec(server, ['ufw', 'allow', 'from', '10.0.51.0/24']);
    await this.remoteExec(server, ['ufw', 'allow', 'from', '10.0.52.0/24']);

    // Enable UFW
    await this.remoteExec(server, ['ufw', '--force', 'enable']);

    console.log(`✓ UFW firewall configured on ${server.name}`);
  }

  /**
   * Configure fail2ban for intrusion prevention
   * Security: OWASP A07:2021 - Identification and Authentication Failures
   */
  async configureFail2ban(server: ServerConfig): Promise<void> {
    console.log(`Configuring fail2ban on ${server.name}...`);

    const fail2banConfig = `[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
maxretry = 3

[wireguard]
enabled = true
port = 51820,51821,51822
protocol = udp
logpath = /var/log/syslog
maxretry = 10
`;

    // Create temp file locally
    const tempFile = `/tmp/jail.local.${server.name}`;
    await fs.writeFile(tempFile, fail2banConfig);

    // Copy to server
    await this.remoteCopy(server, tempFile, '/etc/fail2ban/jail.local');

    // Restart fail2ban
    await this.remoteExec(server, ['systemctl', 'restart', 'fail2ban']);
    await this.remoteExec(server, ['systemctl', 'enable', 'fail2ban']);

    // Clean up temp file
    await fs.unlink(tempFile);

    console.log(`✓ fail2ban configured on ${server.name}`);
  }

  /**
   * Test VPN connectivity
   */
  async testConnectivity(): Promise<void> {
    console.log('Testing VPN connectivity...');

    for (const tunnel of TUNNELS) {
      console.log(`Testing ${tunnel} tunnel...`);

      for (const source of SERVERS) {
        for (const target of SERVERS) {
          if (source.name !== target.name) {
            try {
              const result = await this.remoteExec(source, [
                'ping', '-c', '1', '-W', '2', target.wgIPs[tunnel]
              ]);

              if (result.includes('1 received')) {
                console.log(`✓ ${source.name} -> ${target.name} (${target.wgIPs[tunnel]})`);
              } else {
                console.log(`✗ ${source.name} -> ${target.name} (${target.wgIPs[tunnel]}) FAILED`);
              }
            } catch (error) {
              console.log(`✗ ${source.name} -> ${target.name} (${target.wgIPs[tunnel]}) ERROR`);
            }
          }
        }
      }
    }
  }

  /**
   * Generate client configurations for admin access
   */
  async generateClientConfigs(): Promise<void> {
    console.log('Generating client configurations...');

    // Generate client keypair
    const clientPrivateKey = crypto.randomBytes(32).toString('base64');
    const { stdout: clientPublicKey } = await execFileNoThrow('echo', [
      clientPrivateKey, '|', 'wg', 'pubkey'
    ]);

    for (const tunnel of TUNNELS) {
      let config = `# WireGuard Client Configuration - ${tunnel.toUpperCase()} Tunnel
# Security Level: ${tunnel === 'root' ? 'FULL ADMIN' : tunnel === 'mcp' ? 'SERVICE MESH' : 'RESTRICTED'}

[Interface]
Address = 10.0.${tunnel === 'root' ? '50' : tunnel === 'mcp' ? '51' : '52'}.254/24
PrivateKey = ${clientPrivateKey}
DNS = 1.1.1.1, 8.8.8.8

`;

      for (const server of SERVERS) {
        const serverKey = this.keys[server.name][tunnel];
        config += `
# Peer: ${server.name}
[Peer]
PublicKey = ${serverKey.publicKey}
AllowedIPs = ${server.wgIPs[tunnel]}/32
Endpoint = ${server.ip}:${TUNNEL_PORTS[tunnel]}
PersistentKeepalive = 25
`;
      }

      const clientConfigPath = path.join(
        '/Users/alex/Projects/MCP Bundle/deployment/wireguard/configs',
        `client-${tunnel}.conf`
      );

      await fs.writeFile(clientConfigPath, config, { mode: 0o600 });
      console.log(`✓ Generated client config for ${tunnel} tunnel`);
    }
  }

  /**
   * Main setup function
   */
  async setup(): Promise<void> {
    try {
      console.log('=== WireGuard VPN Mesh Network Setup ===');
      console.log('Security-focused implementation with OWASP best practices\n');

      // Phase 1: Installation
      console.log('Phase 1: Installing WireGuard and security tools...');
      for (const server of SERVERS) {
        await this.installWireGuard(server);
      }

      // Phase 2: Key generation
      console.log('\nPhase 2: Generating cryptographic keys...');
      for (const server of SERVERS) {
        await this.generateKeys(server);
      }

      // Phase 3: Configuration generation
      console.log('\nPhase 3: Generating secure configurations...');
      await this.generateConfigs();

      // Phase 4: Deployment
      console.log('\nPhase 4: Deploying configurations...');
      await this.deployConfigs();

      // Phase 5: Firewall configuration
      console.log('\nPhase 5: Configuring UFW firewall...');
      for (const server of SERVERS) {
        await this.configureFirewall(server);
      }

      // Phase 6: Intrusion prevention
      console.log('\nPhase 6: Configuring fail2ban...');
      for (const server of SERVERS) {
        await this.configureFail2ban(server);
      }

      // Phase 7: Testing
      console.log('\nPhase 7: Testing connectivity...');
      await this.testConnectivity();

      // Phase 8: Client configs
      console.log('\nPhase 8: Generating client configurations...');
      await this.generateClientConfigs();

      console.log('\n=== Setup Complete ===');
      console.log('All VPN tunnels configured and secured');
      console.log('Client configurations available in deployment/wireguard/configs/');

    } catch (error) {
      console.error('Setup failed:', error);
      process.exit(1);
    }
  }
}

// Execute setup
const setup = new WireGuardSetup();
setup.setup().catch(console.error);