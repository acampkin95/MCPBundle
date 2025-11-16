import { execSync } from 'child_process';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

export interface WireGuardKeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Generate a WireGuard key pair using the wg command
 */
export function generateWireGuardKeyPair(): WireGuardKeyPair {
  try {
    // Generate private key
    const privateKey = execSync('wg genkey', { encoding: 'utf-8' }).trim();

    // Generate public key from private key
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, {
      encoding: 'utf-8',
    }).trim();

    return { privateKey, publicKey };
  } catch (error) {
    throw new Error(`Failed to generate WireGuard keys: ${error}`);
  }
}

/**
 * Generate a WireGuard preshared key
 */
export function generatePresharedKey(): string {
  try {
    const psk = execSync('wg genpsk', { encoding: 'utf-8' }).trim();
    return psk;
  } catch (error) {
    throw new Error(`Failed to generate preshared key: ${error}`);
  }
}

/**
 * Generate a secure invite token
 */
export function generateInviteToken(): string {
  return nanoid(32);
}

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number): string {
  return randomBytes(length).toString('hex');
}

/**
 * Validate WireGuard public key format
 */
export function isValidPublicKey(key: string): boolean {
  // WireGuard keys are base64 encoded and 44 characters long
  return /^[A-Za-z0-9+/]{43}=$/.test(key);
}

/**
 * Validate IPv4 address format
 */
export function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  return parts.every((part) => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255 && part === num.toString();
  });
}

/**
 * Calculate CIDR network address
 */
export function getNetworkAddress(ip: string, cidr: number): string {
  const parts = ip.split('.').map(Number);
  const mask = ~((1 << (32 - cidr)) - 1);

  const network = [
    (parts[0] || 0) & ((mask >>> 24) & 0xff),
    (parts[1] || 0) & ((mask >>> 16) & 0xff),
    (parts[2] || 0) & ((mask >>> 8) & 0xff),
    (parts[3] || 0) & (mask & 0xff),
  ];

  return network.join('.');
}
