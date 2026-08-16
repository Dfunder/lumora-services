import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum CampaignStatus {
  ACTIVE = 'ACTIVE',
  PENDING_REVIEW = 'PENDING_REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export interface Milestone {
  title: string;
  description: string;
  targetAmount: string;
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  creatorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column('text')
  story: string;

  @Column()
  coverImageUrl: string;

  @Column()
  category: string;

  @Column('decimal', { precision: 18, scale: 7 })
  goalAmount: string;

  @Column('decimal', { precision: 18, scale: 7, default: 0 })
  raisedAmount: string;

  @Column('simple-array')
  acceptedAssets: string[]; // e.g., ['XLM', 'USDC:GA5Z...']

  @Column('timestamptz')
  endDate: Date;

  @Column('jsonb')
  milestones: Milestone[];

  @Column()
  contractId: string;

  @Column({ default: 'testnet' })
  network: string;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.ACTIVE,
  })
  status: CampaignStatus;

  @Column({ default: false })
  isFeatured: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
