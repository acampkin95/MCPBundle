import { Router, Response } from 'express';
import { WireGuardService } from '../services/wireguardService';
import { QRCodeService } from '../services/qrService';
import { AuthenticatedRequest, authenticate, extractUser } from '../middleware/auth';
import { asyncHandler, NotFoundError } from '../middleware/error';
import { configDownloadLimiter } from '../middleware/rateLimit';
import { logger } from '../utils/logger';

const router = Router();
const wireguardService = new WireGuardService();
const qrService = new QRCodeService();

/**
 * GET /api/config/peers - Get all peers for current user
 */
router.get(
  '/peers',
  authenticate(),
  extractUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const peers = await wireguardService.getPeersByUser(req.user!.sub);

    res.json({
      peers: peers.map((peer) => ({
        id: peer.id,
        deviceName: peer.deviceName,
        ipAddress: peer.ipAddress,
        status: peer.status,
        lastHandshake: peer.lastHandshake,
        bytesReceived: peer.bytesReceived,
        bytesSent: peer.bytesSent,
        createdAt: peer.createdAt,
      })),
    });
  })
);

/**
 * GET /api/config/peers/:peerId - Get peer details
 */
router.get(
  '/peers/:peerId',
  authenticate(),
  extractUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { peerId } = req.params;
    const peer = await wireguardService.getPeerById(peerId);

    // Verify ownership
    if (peer.userId !== req.user!.sub) {
      throw new NotFoundError('Peer not found');
    }

    res.json({
      id: peer.id,
      deviceName: peer.deviceName,
      ipAddress: peer.ipAddress,
      status: peer.status,
      lastHandshake: peer.lastHandshake,
      bytesReceived: peer.bytesReceived,
      bytesSent: peer.bytesSent,
      createdAt: peer.createdAt,
    });
  })
);

/**
 * GET /api/config/download/:peerId/:platform - Download config file
 */
router.get(
  '/download/:peerId/:platform',
  authenticate(),
  extractUser,
  configDownloadLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { peerId, platform } = req.params;

    const validPlatforms = ['windows', 'macos', 'linux', 'android', 'ios'];
    if (!validPlatforms.includes(platform)) {
      res.status(400).json({ error: 'Invalid platform' });
      return;
    }

    const peer = await wireguardService.getPeerById(peerId);

    // Verify ownership
    if (peer.userId !== req.user!.sub) {
      throw new NotFoundError('Peer not found');
    }

    logger.info('Config downloaded', {
      peerId: peer.id,
      platform,
      userId: req.user!.email,
    });

    if (platform === 'ios') {
      // iOS mobile config
      const mobileConfig = wireguardService.generateIOSMobileConfig(
        peer,
        peer.deviceName || 'MCP VPN'
      );

      res.setHeader('Content-Type', 'application/x-apple-aspen-config');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="mcp-vpn-${peer.ipAddress}.mobileconfig"`
      );
      res.send(mobileConfig);
    } else {
      // Standard WireGuard config
      const config = wireguardService.generateConfigFile(
        peer,
        platform as 'windows' | 'macos' | 'linux' | 'android'
      );

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="mcp-vpn-${peer.ipAddress}.conf"`);
      res.send(config);
    }
  })
);

/**
 * GET /api/config/qr/:peerId - Get QR code for mobile setup
 */
router.get(
  '/qr/:peerId',
  authenticate(),
  extractUser,
  configDownloadLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { peerId } = req.params;
    const format = (req.query.format as string) || 'png';

    const peer = await wireguardService.getPeerById(peerId);

    // Verify ownership
    if (peer.userId !== req.user!.sub) {
      throw new NotFoundError('Peer not found');
    }

    logger.info('QR code generated', {
      peerId: peer.id,
      format,
      userId: req.user!.email,
    });

    if (format === 'svg') {
      const qrCodeSVG = await qrService.generateQRCodeSVG(peer);
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(qrCodeSVG);
    } else if (format === 'json') {
      const qrCodeDataURL = await qrService.generateQRCode(peer);
      res.json({ qrCode: qrCodeDataURL });
    } else {
      // Default: PNG buffer
      const qrCodeBuffer = await qrService.generateQRCodeBuffer(peer);
      res.setHeader('Content-Type', 'image/png');
      res.send(qrCodeBuffer);
    }
  })
);

/**
 * DELETE /api/config/peers/:peerId - Revoke peer access
 */
router.delete(
  '/peers/:peerId',
  authenticate(),
  extractUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { peerId } = req.params;
    const peer = await wireguardService.getPeerById(peerId);

    // Verify ownership
    if (peer.userId !== req.user!.sub) {
      throw new NotFoundError('Peer not found');
    }

    await wireguardService.removePeer(peerId);

    logger.info('Peer revoked', {
      peerId: peer.id,
      userId: req.user!.email,
    });

    res.json({
      message: 'Peer access revoked successfully',
      peerId: peer.id,
    });
  })
);

export default router;
