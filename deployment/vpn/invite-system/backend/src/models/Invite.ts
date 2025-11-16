import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToOne,
} from 'typeorm';
import { Peer } from './Peer';

@Entity('invites')
@Index(['token'], { unique: true })
@Index(['createdBy'])
@Index(['status'])
export class Invite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  token!: string;

  @Column({ type: 'varchar', length: 255 })
  createdBy!: string;

  @Column({ type: 'varchar', length: 255 })
  createdByEmail!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipientEmail!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipientName!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'claimed', 'expired', 'revoked'],
    default: 'pending',
  })
  status!: 'pending' | 'claimed' | 'expired' | 'revoked';

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  claimedAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  claimedBy!: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  claimedFromIP!: string | null;

  @OneToOne(() => Peer, (peer) => peer.invite, { nullable: true })
  peer!: Peer | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Helper methods
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  canBeClaimed(): boolean {
    return this.status === 'pending' && !this.isExpired();
  }

  claim(userId: string, ipAddress: string): void {
    if (!this.canBeClaimed()) {
      throw new Error('Invite cannot be claimed');
    }
    this.status = 'claimed';
    this.claimedAt = new Date();
    this.claimedBy = userId;
    this.claimedFromIP = ipAddress;
  }

  revoke(): void {
    if (this.status === 'claimed') {
      throw new Error('Cannot revoke a claimed invite');
    }
    this.status = 'revoked';
  }
}
