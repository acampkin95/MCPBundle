import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Invite } from './Invite';

@Entity('peers')
@Index(['publicKey'], { unique: true })
@Index(['ipAddress'], { unique: true })
@Index(['userId'])
@Index(['status'])
export class Peer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => Invite, (invite) => invite.peer, { nullable: false })
  @JoinColumn()
  invite!: Invite;

  @Column({ type: 'varchar', length: 255 })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  userEmail!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceName!: string | null;

  @Column({ type: 'varchar', length: 44, unique: true })
  publicKey!: string;

  @Column({ type: 'varchar', length: 44 })
  privateKey!: string;

  @Column({ type: 'varchar', length: 64 })
  presharedKey!: string;

  @Column({ type: 'varchar', length: 15, unique: true })
  ipAddress!: string;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'revoked'],
    default: 'active',
  })
  status!: 'active' | 'inactive' | 'revoked';

  @Column({ type: 'timestamp', nullable: true })
  lastHandshake!: Date | null;

  @Column({ type: 'bigint', default: 0 })
  bytesReceived!: number;

  @Column({ type: 'bigint', default: 0 })
  bytesSent!: number;

  @Column({ type: 'boolean', default: true })
  isDeployed!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Helper methods
  isActive(): boolean {
    return this.status === 'active' && this.isDeployed;
  }

  revoke(): void {
    this.status = 'revoked';
    this.isDeployed = false;
  }

  updateStats(lastHandshake: Date | null, bytesReceived: number, bytesSent: number): void {
    this.lastHandshake = lastHandshake;
    this.bytesReceived = bytesReceived;
    this.bytesSent = bytesSent;
  }

  getFormattedIP(): string {
    return `${this.ipAddress}/32`;
  }
}
