import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Peer } from '../models/Peer';
import { Invite } from '../models/Invite';
import { wireguardConfig, getNextAvailableIP } from '../config/wireguard';
import { generateWireGuardKeyPair, generatePresharedKey, isValidPublicKey } from '../utils/crypto';
import { ValidationError, NotFoundError } from '../middleware/error';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export interface PeerConfig {
  privateKey: string;
  publicKey: string;
  presharedKey: string;
  ipAddress: string;
  serverPublicKey: string;
  endpoint: string;
  dns: string;
  allowedIPs: string;
}

export class WireGuardService {
  private peerRepository: Repository<Peer>;
  private inviteRepository: Repository<Invite>;

  constructor() {
    this.peerRepository = AppDataSource.getRepository(Peer);
    this.inviteRepository = AppDataSource.getRepository(Invite);
  }

  /**
   * Create a new WireGuard peer from an invite
   */
  async createPeer(
    invite: Invite,
    userId: string,
    userEmail: string,
    deviceName?: string
  ): Promise<Peer> {
    // Generate keys
    const keyPair = generateWireGuardKeyPair();
    const presharedKey = generatePresharedKey();

    // Get next available IP
    const usedIPs = await this.getAllUsedIPs();
    const ipAddress = getNextAvailableIP(usedIPs);

    // Create peer
    const peer = this.peerRepository.create({
      invite,
      userId,
      userEmail,
      deviceName: deviceName || null,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      presharedKey,
      ipAddress,
      status: 'active',
      isDeployed: false,
    });

    const savedPeer = await this.peerRepository.save(peer);

    // Deploy to WireGuard
    try {
      await this.deployPeer(savedPeer);
      savedPeer.isDeployed = true;
      await this.peerRepository.save(savedPeer);
    } catch (error) {
      console.error('Failed to deploy peer:', error);
      // Peer is created but not deployed - can be retried later
    }

    return savedPeer;
  }

  /**
   * Get peer configuration for client
   */
  getPeerConfig(peer: Peer): PeerConfig {
    return {
      privateKey: peer.privateKey,
      publicKey: peer.publicKey,
      presharedKey: peer.presharedKey,
      ipAddress: peer.ipAddress,
      serverPublicKey: wireguardConfig.serverPublicKey,
      endpoint: wireguardConfig.endpoint,
      dns: wireguardConfig.dns,
      allowedIPs: wireguardConfig.allowedIPs,
    };
  }

  /**
   * Deploy peer to WireGuard interface
   */
  async deployPeer(peer: Peer): Promise<void> {
    const cmd = `wg set ${wireguardConfig.interface} peer ${peer.publicKey} preshared-key <(echo "${peer.presharedKey}") allowed-ips ${peer.getFormattedIP()}`;

    try {
      execSync(cmd, { shell: '/bin/bash' });

      // Save configuration
      await this.saveWireGuardConfig();
    } catch (error) {
      throw new Error(`Failed to deploy peer to WireGuard: ${error}`);
    }
  }

  /**
   * Remove peer from WireGuard interface
   */
  async removePeer(peerId: string): Promise<void> {
    const peer = await this.peerRepository.findOne({ where: { id: peerId } });

    if (!peer) {
      throw new NotFoundError('Peer not found');
    }

    try {
      execSync(`wg set ${wireguardConfig.interface} peer ${peer.publicKey} remove`);

      // Update peer status
      peer.revoke();
      await this.peerRepository.save(peer);

      // Save configuration
      await this.saveWireGuardConfig();
    } catch (error) {
      throw new Error(`Failed to remove peer from WireGuard: ${error}`);
    }
  }

  /**
   * Get all used IP addresses
   */
  private async getAllUsedIPs(): Promise<string[]> {
    const peers = await this.peerRepository.find({
      select: ['ipAddress'],
      where: { status: 'active' },
    });

    return peers.map((peer) => peer.ipAddress);
  }

  /**
   * Save WireGuard configuration to disk
   */
  private async saveWireGuardConfig(): Promise<void> {
    try {
      execSync(`wg-quick save ${wireguardConfig.interface}`);
    } catch (error) {
      console.error('Failed to save WireGuard config:', error);
    }
  }

  /**
   * Get all peers
   */
  async getAllPeers(): Promise<Peer[]> {
    return await this.peerRepository.find({
      relations: ['invite'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get peers by user
   */
  async getPeersByUser(userId: string): Promise<Peer[]> {
    return await this.peerRepository.find({
      where: { userId },
      relations: ['invite'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get peer by ID
   */
  async getPeerById(peerId: string): Promise<Peer> {
    const peer = await this.peerRepository.findOne({
      where: { id: peerId },
      relations: ['invite'],
    });

    if (!peer) {
      throw new NotFoundError('Peer not found');
    }

    return peer;
  }

  /**
   * Update peer statistics from WireGuard
   */
  async updatePeerStats(): Promise<void> {
    try {
      const output = execSync(`wg show ${wireguardConfig.interface} dump`, {
        encoding: 'utf-8',
      });

      const lines = output.trim().split('\n').slice(1); // Skip header

      for (const line of lines) {
        const [publicKey, presharedKey, endpoint, allowedIps, latestHandshake, rxBytes, txBytes] =
          line.split('\t');

        const peer = await this.peerRepository.findOne({ where: { publicKey } });

        if (peer) {
          const lastHandshake =
            latestHandshake && latestHandshake !== '0'
              ? new Date(parseInt(latestHandshake, 10) * 1000)
              : null;

          peer.updateStats(
            lastHandshake,
            parseInt(rxBytes || '0', 10),
            parseInt(txBytes || '0', 10)
          );

          await this.peerRepository.save(peer);
        }
      }
    } catch (error) {
      console.error('Failed to update peer stats:', error);
    }
  }

  /**
   * Generate WireGuard config file content
   */
  generateConfigFile(peer: Peer, platform: 'windows' | 'macos' | 'linux' | 'android'): string {
    const config = this.getPeerConfig(peer);

    return `[Interface]
PrivateKey = ${config.privateKey}
Address = ${config.ipAddress}/32
DNS = ${config.dns}

[Peer]
PublicKey = ${config.serverPublicKey}
PresharedKey = ${config.presharedKey}
Endpoint = ${config.endpoint}
AllowedIPs = ${config.allowedIPs}
PersistentKeepalive = 25
`;
  }

  /**
   * Generate iOS mobile config
   */
  generateIOSMobileConfig(peer: Peer, deviceName: string): string {
    const config = this.getPeerConfig(peer);
    const uuid1 = this.generateUUID();
    const uuid2 = this.generateUUID();

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.wireguard.ios.config</string>
            <key>PayloadUUID</key>
            <string>${uuid1}</string>
            <key>PayloadIdentifier</key>
            <string>com.wireguard.ios.${uuid1}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>WireGuardConfig</key>
            <string>${this.generateConfigFile(peer, 'linux')}</string>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>MCP VPN - ${deviceName}</string>
    <key>PayloadIdentifier</key>
    <string>com.mcp.vpn.${uuid2}</string>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${uuid2}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
