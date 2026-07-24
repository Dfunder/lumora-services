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
import { Milestone } from './campaign.entity';

@Entity('campaign_drafts')
export class CampaignDraft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  creatorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column({ nullable: true })
  title?: string;

  @Column('text', { nullable: true })
  description?: string;

  @Column('text', { nullable: true })
  story?: string;

  @Column({ nullable: true })
  coverImageUrl?: string;

  @Column({ nullable: true })
  category?: string;

  @Column('decimal', { precision: 18, scale: 7, nullable: true })
  goalAmount?: string;

  @Column('simple-array', { nullable: true })
  acceptedAssets?: string[];

  @Column('timestamptz', { nullable: true })
  endDate?: Date;

  @Column('jsonb', { nullable: true })
  milestones?: Milestone[];

  @Column({ nullable: true })
  contractId?: string;

  @Column({ nullable: true })
  network?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
