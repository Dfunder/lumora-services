import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Campaign } from './campaign.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: 'user' })
  role: string;

  @OneToMany(() => Campaign, (campaign) => campaign.creator)
  campaigns: Campaign[];
}
