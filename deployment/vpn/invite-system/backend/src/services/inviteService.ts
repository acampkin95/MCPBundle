import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Invite } from '../models/Invite';
import { Peer } from '../models/Peer';
import { generateInviteToken } from '../utils/crypto';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/error';
import { DateTime } from 'luxon';
import dotenv from 'dotenv';

dotenv.config();

const INVITE_EXPIRY_HOURS = parseInt(process.env.INVITE_EXPIRY_HOURS || '2', 10);
const MAX_INVITES_PER_USER = parseInt(process.env.MAX_INVITES_PER_USER || '10', 10);

export class InviteService {
  private inviteRepository: Repository<Invite>;
  private peerRepository: Repository<Peer>;

  constructor() {
    this.inviteRepository = AppDataSource.getRepository(Invite);
    this.peerRepository = AppDataSource.getRepository(Peer);
  }

  /**
   * Create a new invite
   */
  async createInvite(
    createdBy: string,
    createdByEmail: string,
    recipientEmail?: string,
    recipientName?: string,
    notes?: string
  ): Promise<Invite> {
    // Check if user has reached max invites
    const activeInvites = await this.inviteRepository.count({
      where: { createdBy, status: 'pending' },
    });

    if (activeInvites >= MAX_INVITES_PER_USER) {
      throw new ValidationError(
        `Maximum of ${MAX_INVITES_PER_USER} active invites allowed per user`
      );
    }

    // Generate unique token
    let token = generateInviteToken();
    let attempts = 0;
    while (await this.inviteRepository.findOne({ where: { token } })) {
      token = generateInviteToken();
      attempts++;
      if (attempts > 10) {
        throw new Error('Failed to generate unique invite token');
      }
    }

    // Calculate expiry
    const expiresAt = DateTime.now().plus({ hours: INVITE_EXPIRY_HOURS }).toJSDate();

    // Create invite
    const invite = this.inviteRepository.create({
      token,
      createdBy,
      createdByEmail,
      recipientEmail: recipientEmail || null,
      recipientName: recipientName || null,
      notes: notes || null,
      status: 'pending',
      expiresAt,
    });

    return await this.inviteRepository.save(invite);
  }

  /**
   * Get invite by token
   */
  async getInviteByToken(token: string): Promise<Invite> {
    const invite = await this.inviteRepository.findOne({
      where: { token },
      relations: ['peer'],
    });

    if (!invite) {
      throw new NotFoundError('Invite not found');
    }

    return invite;
  }

  /**
   * Get all invites created by a user
   */
  async getInvitesByUser(userId: string): Promise<Invite[]> {
    return await this.inviteRepository.find({
      where: { createdBy: userId },
      order: { createdAt: 'DESC' },
      relations: ['peer'],
    });
  }

  /**
   * Get all invites (admin only)
   */
  async getAllInvites(limit: number = 100, offset: number = 0): Promise<Invite[]> {
    return await this.inviteRepository.find({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
      relations: ['peer'],
    });
  }

  /**
   * Claim an invite
   */
  async claimInvite(token: string, userId: string, ipAddress: string): Promise<Invite> {
    const invite = await this.getInviteByToken(token);

    if (!invite.canBeClaimed()) {
      if (invite.isExpired()) {
        invite.status = 'expired';
        await this.inviteRepository.save(invite);
        throw new ValidationError('Invite has expired');
      }
      throw new ValidationError('Invite cannot be claimed');
    }

    // Check if user already has an active peer
    const existingPeer = await this.peerRepository.findOne({
      where: { userId, status: 'active' },
    });

    if (existingPeer) {
      throw new ConflictError('User already has an active VPN peer');
    }

    invite.claim(userId, ipAddress);
    return await this.inviteRepository.save(invite);
  }

  /**
   * Revoke an invite
   */
  async revokeInvite(inviteId: string, userId: string): Promise<Invite> {
    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
      relations: ['peer'],
    });

    if (!invite) {
      throw new NotFoundError('Invite not found');
    }

    if (invite.createdBy !== userId) {
      throw new ValidationError('You can only revoke your own invites');
    }

    invite.revoke();
    return await this.inviteRepository.save(invite);
  }

  /**
   * Expire old invites (cleanup task)
   */
  async expireOldInvites(): Promise<number> {
    const result = await this.inviteRepository
      .createQueryBuilder()
      .update(Invite)
      .set({ status: 'expired' })
      .where('status = :status', { status: 'pending' })
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    return result.affected || 0;
  }

  /**
   * Get invite statistics
   */
  async getInviteStats(): Promise<{
    total: number;
    pending: number;
    claimed: number;
    expired: number;
    revoked: number;
  }> {
    const [total, pending, claimed, expired, revoked] = await Promise.all([
      this.inviteRepository.count(),
      this.inviteRepository.count({ where: { status: 'pending' } }),
      this.inviteRepository.count({ where: { status: 'claimed' } }),
      this.inviteRepository.count({ where: { status: 'expired' } }),
      this.inviteRepository.count({ where: { status: 'revoked' } }),
    ]);

    return { total, pending, claimed, expired, revoked };
  }
}
