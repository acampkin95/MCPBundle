import { Router, Response } from 'express';
import { InviteService } from '../services/inviteService';
import { WireGuardService } from '../services/wireguardService';
import { QRCodeService } from '../services/qrService';
import { AuthenticatedRequest, authenticate, extractUser, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { inviteCreationLimiter } from '../middleware/rateLimit';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();
const inviteService = new InviteService();
const wireguardService = new WireGuardService();
const qrService = new QRCodeService();

// Validation schemas
const createInviteSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().min(1).max(255).optional(),
  notes: z.string().max(1000).optional(),
});

const claimInviteSchema = z.object({
  deviceName: z.string().min(1).max(255).optional(),
});

/**
 * POST /api/invites - Create a new invite
 */
router.post(
  '/',
  authenticate(),
  extractUser,
  inviteCreationLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const validation = createInviteSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Invalid request data', details: validation.error });
      return;
    }

    const { recipientEmail, recipientName, notes } = validation.data;

    const invite = await inviteService.createInvite(
      req.user!.sub,
      req.user!.email,
      recipientEmail,
      recipientName,
      notes
    );

    logger.info('Invite created', {
      inviteId: invite.id,
      createdBy: req.user!.email,
      recipientEmail,
    });

    res.status(201).json({
      id: invite.id,
      token: invite.token,
      recipientEmail: invite.recipientEmail,
      recipientName: invite.recipientName,
      notes: invite.notes,
      status: invite.status,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      inviteUrl: `${process.env.FRONTEND_URL}/invite/${invite.token}`,
    });
  })
);

/**
 * GET /api/invites - Get all invites for current user
 */
router.get(
  '/',
  authenticate(),
  extractUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const invites = await inviteService.getInvitesByUser(req.user!.sub);

    res.json({
      invites: invites.map((invite) => ({
        id: invite.id,
        token: invite.token,
        recipientEmail: invite.recipientEmail,
        recipientName: invite.recipientName,
        notes: invite.notes,
        status: invite.status,
        expiresAt: invite.expiresAt,
        claimedAt: invite.claimedAt,
        claimedBy: invite.claimedBy,
        createdAt: invite.createdAt,
        hasPeer: !!invite.peer,
      })),
    });
  })
);

/**
 * GET /api/invites/all - Get all invites (admin only)
 */
router.get(
  '/all',
  authenticate(),
  extractUser,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const invites = await inviteService.getAllInvites(limit, offset);

    res.json({
      invites: invites.map((invite) => ({
        id: invite.id,
        token: invite.token,
        createdBy: invite.createdBy,
        createdByEmail: invite.createdByEmail,
        recipientEmail: invite.recipientEmail,
        recipientName: invite.recipientName,
        status: invite.status,
        expiresAt: invite.expiresAt,
        claimedAt: invite.claimedAt,
        claimedBy: invite.claimedBy,
        createdAt: invite.createdAt,
        hasPeer: !!invite.peer,
      })),
      pagination: {
        limit,
        offset,
        total: invites.length,
      },
    });
  })
);

/**
 * GET /api/invites/stats - Get invite statistics (admin only)
 */
router.get(
  '/stats',
  authenticate(),
  extractUser,
  requireAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await inviteService.getInviteStats();
    res.json(stats);
  })
);

/**
 * GET /api/invites/:token - Get invite details
 */
router.get(
  '/:token',
  asyncHandler(async (req, res: Response) => {
    const { token } = req.params;
    const invite = await inviteService.getInviteByToken(token);

    // Check if expired
    if (invite.isExpired() && invite.status === 'pending') {
      invite.status = 'expired';
      await inviteService.expireOldInvites();
    }

    res.json({
      id: invite.id,
      recipientEmail: invite.recipientEmail,
      recipientName: invite.recipientName,
      status: invite.status,
      expiresAt: invite.expiresAt,
      claimedAt: invite.claimedAt,
      canBeClaimed: invite.canBeClaimed(),
    });
  })
);

/**
 * POST /api/invites/:token/claim - Claim an invite
 */
router.post(
  '/:token/claim',
  authenticate(),
  extractUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { token } = req.params;
    const validation = claimInviteSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ error: 'Invalid request data', details: validation.error });
      return;
    }

    const { deviceName } = validation.data;
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';

    // Claim the invite
    const invite = await inviteService.claimInvite(token, req.user!.sub, ipAddress);

    // Create WireGuard peer
    const peer = await wireguardService.createPeer(
      invite,
      req.user!.sub,
      req.user!.email,
      deviceName
    );

    logger.info('Invite claimed', {
      inviteId: invite.id,
      peerId: peer.id,
      claimedBy: req.user!.email,
      ipAddress: peer.ipAddress,
    });

    res.status(201).json({
      message: 'Invite claimed successfully',
      peerId: peer.id,
      ipAddress: peer.ipAddress,
      status: peer.status,
    });
  })
);

/**
 * DELETE /api/invites/:id - Revoke an invite
 */
router.delete(
  '/:id',
  authenticate(),
  extractUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;

    const invite = await inviteService.revokeInvite(id, req.user!.sub);

    logger.info('Invite revoked', {
      inviteId: invite.id,
      revokedBy: req.user!.email,
    });

    res.json({
      message: 'Invite revoked successfully',
      invite: {
        id: invite.id,
        status: invite.status,
      },
    });
  })
);

export default router;
