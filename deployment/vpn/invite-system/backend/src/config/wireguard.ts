import dotenv from 'dotenv';

dotenv.config();

export interface WireGuardConfig {
  interface: string;
  port: number;
  serverPublicKey: string;
  serverPrivateKeyPath: string;
  endpoint: string;
  network: string;
  dns: string;
  ipPoolStart: string;
  ipPoolEnd: string;
  allowedIPs: string;
  configPath: string;
}

export const wireguardConfig: WireGuardConfig = {
  interface: process.env.WG_INTERFACE || 'wg1',
  port: parseInt(process.env.WG_PORT || '51823', 10),
  serverPublicKey: process.env.WG_SERVER_PUBLIC_KEY || '',
  serverPrivateKeyPath: process.env.WG_SERVER_PRIVATE_KEY || '/etc/wireguard/wg1-private.key',
  endpoint: process.env.WG_ENDPOINT || '154.26.158.31:51823',
  network: process.env.WG_NETWORK || '10.10.10.0/24',
  dns: process.env.WG_DNS || '10.10.10.1',
  ipPoolStart: process.env.WG_IP_POOL_START || '10.10.10.10',
  ipPoolEnd: process.env.WG_IP_POOL_END || '10.10.10.250',
  allowedIPs: process.env.WG_ALLOWED_IPS || '10.10.10.0/24,10.0.50.0/24,10.0.51.0/24,10.0.52.0/24',
  configPath: `/etc/wireguard/${process.env.WG_INTERFACE || 'wg1'}.conf`,
};

export function validateWireGuardConfig(): void {
  const required = ['serverPublicKey', 'endpoint'];
  const missing = required.filter((key) => !wireguardConfig[key as keyof WireGuardConfig]);

  if (missing.length > 0) {
    throw new Error(`Missing required WireGuard configuration: ${missing.join(', ')}`);
  }
}

export function parseIPRange(start: string, end: string): string[] {
  const startParts = start.split('.').map(Number);
  const endParts = end.split('.').map(Number);
  const ips: string[] = [];

  if (startParts.length !== 4 || endParts.length !== 4) {
    throw new Error('Invalid IP address format');
  }

  const startNum = startParts[3] || 0;
  const endNum = endParts[3] || 0;
  const prefix = startParts.slice(0, 3).join('.');

  for (let i = startNum; i <= endNum; i++) {
    ips.push(`${prefix}.${i}`);
  }

  return ips;
}

export function getNextAvailableIP(usedIPs: string[]): string {
  const allIPs = parseIPRange(wireguardConfig.ipPoolStart, wireguardConfig.ipPoolEnd);
  const availableIP = allIPs.find((ip) => !usedIPs.includes(ip));

  if (!availableIP) {
    throw new Error('No available IP addresses in the pool');
  }

  return availableIP;
}
