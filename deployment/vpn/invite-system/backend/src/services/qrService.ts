import QRCode from 'qrcode';
import { WireGuardService } from './wireguardService';
import { Peer } from '../models/Peer';

export class QRCodeService {
  private wireguardService: WireGuardService;

  constructor() {
    this.wireguardService = new WireGuardService();
  }

  /**
   * Generate QR code for WireGuard config
   */
  async generateQRCode(peer: Peer): Promise<string> {
    const configContent = this.wireguardService.generateConfigFile(peer, 'android');

    try {
      // Generate QR code as data URL
      const qrCodeDataURL = await QRCode.toDataURL(configContent, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      return qrCodeDataURL;
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error}`);
    }
  }

  /**
   * Generate QR code as SVG
   */
  async generateQRCodeSVG(peer: Peer): Promise<string> {
    const configContent = this.wireguardService.generateConfigFile(peer, 'android');

    try {
      const qrCodeSVG = await QRCode.toString(configContent, {
        errorCorrectionLevel: 'M',
        type: 'svg',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      return qrCodeSVG;
    } catch (error) {
      throw new Error(`Failed to generate QR code SVG: ${error}`);
    }
  }

  /**
   * Generate QR code as buffer
   */
  async generateQRCodeBuffer(peer: Peer): Promise<Buffer> {
    const configContent = this.wireguardService.generateConfigFile(peer, 'android');

    try {
      const buffer = await QRCode.toBuffer(configContent, {
        errorCorrectionLevel: 'M',
        type: 'png',
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      return buffer;
    } catch (error) {
      throw new Error(`Failed to generate QR code buffer: ${error}`);
    }
  }

  /**
   * Validate if config can be encoded as QR
   */
  validateConfigSize(peer: Peer): { valid: boolean; size: number; maxSize: number } {
    const configContent = this.wireguardService.generateConfigFile(peer, 'android');
    const size = Buffer.from(configContent).length;
    const maxSize = 2953; // Max bytes for QR code with error correction level M

    return {
      valid: size <= maxSize,
      size,
      maxSize,
    };
  }
}
