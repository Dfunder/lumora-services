import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Campaign } from './campaign.entity';
import { User } from './user.entity';

@Entity()
export class Donation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  amount: number;

  @Column()
  asset: string;

  @ManyToOne(() => User)
  donor: User;

  @Index()
  @ManyToOne(() => Campaign, (campaign) => campaign.donations)
  campaign: Campaign;

  @Column()
  createdAt: Date;
}
