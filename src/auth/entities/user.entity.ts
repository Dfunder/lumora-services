import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
