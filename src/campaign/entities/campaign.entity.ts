import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.campaigns, { nullable: false })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @Column({ name: 'creatorId' })
  creatorId: string;

  @Column({ type: 'decimal', precision: 18, scale: 7, default: 0 })
  raisedAmount: number;

  @CreateDateColumn()
  createdAt: Date;
}
