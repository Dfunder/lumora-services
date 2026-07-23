import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Campaign } from '../../campaign/entities/campaign.entity';

export enum KYCStatus {
  UNVERIFIED = 'UNVERIFIED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  walletAddress: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: 'user' })
  role: string;

  @Column({
    type: 'enum',
    enum: KYCStatus,
    default: KYCStatus.UNVERIFIED,
  })
  kycStatus: KYCStatus;

  @Column({ nullable: true })
  isSuspended: boolean;

  @Column({ nullable: true })
  suspensionReason: string;

  @Column({ nullable: true })
  email: string;
  @Column({ default: 'none' })
  kycStatus: string;

  @Column({ type: 'jsonb', default: {} })
  socialLinks: Record<string, string>;
  @Column({ nullable: true, type: 'varchar' })
  displayName: string | null;

  @Column({ nullable: true, type: 'varchar' })
  avatarUrl: string | null;

  @Column({ nullable: true, type: 'varchar' })
  bio: string | null;

  @Column({ default: false })
  verifiedStatus: boolean;

  @Column({ default: 'not_submitted' })
  kycStatus: string;

  @OneToMany(() => Campaign, (campaign) => campaign.creator)
  campaigns: Campaign[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
