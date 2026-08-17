import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, KYCStatus } from './entities/user.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { QueueService } from '../queues/queue.service';
import { UpdateKYCStatusDto } from './dto/update-kyc-status.dto';
import { SuspendUserDto, UnsuspendUserDto } from './dto/suspend-user.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly queueService: QueueService,
  ) {}

  async updateKYCStatus(
    userId: string,
    adminId: string,
    dto: UpdateKYCStatusDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const previousStatus = user.kycStatus;
    user.kycStatus = dto.kycStatus;

    await this.userRepository.save(user);

    // Log the audit action
    await this.auditLogRepository.save({
      admin: { id: adminId },
      targetUser: user,
      action: AuditAction.KYC_STATUS_UPDATED,
      details: {
        previousStatus,
        newStatus: dto.kycStatus,
      },
    });

    // Send email notification
    if (user.email) {
      const emailSubject =
        dto.kycStatus === KYCStatus.VERIFIED
          ? 'Your account has been verified'
          : 'Your KYC verification status has been updated';

      const emailTemplate =
        dto.kycStatus === KYCStatus.VERIFIED
          ? 'kyc-verified'
          : 'kyc-updated';

      await this.queueService.sendNotificationEmail({
        to: user.email,
        subject: emailSubject,
        template: emailTemplate,
        context: {
          status: dto.kycStatus,
          userName: user.walletAddress,
        },
      });
    }

    return user;
  }

  async suspendUser(
    userId: string,
    adminId: string,
    dto: SuspendUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isSuspended) {
      throw new BadRequestException('User is already suspended');
    }

    user.isSuspended = true;
    user.suspensionReason = dto.reason;

    await this.userRepository.save(user);

    // Log the audit action
    await this.auditLogRepository.save({
      admin: { id: adminId },
      targetUser: user,
      action: AuditAction.USER_SUSPENDED,
      details: {
        reason: dto.reason,
      },
    });

    // Send email notification
    if (user.email) {
      await this.queueService.sendNotificationEmail({
        to: user.email,
        subject: 'Your account has been suspended',
        template: 'account-suspended',
        context: {
          reason: dto.reason,
          userName: user.walletAddress,
        },
      });
    }

    return user;
  }

  async unsuspendUser(
    userId: string,
    adminId: string,
    dto?: UnsuspendUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isSuspended) {
      throw new BadRequestException('User is not suspended');
    }

    user.isSuspended = false;
    user.suspensionReason = undefined as any;

    await this.userRepository.save(user);

    // Log the audit action
    await this.auditLogRepository.save({
      admin: { id: adminId },
      targetUser: user,
      action: AuditAction.USER_UNSUSPENDED,
      details: {
        notes: dto?.notes || '',
      },
    });

    // Send email notification
    if (user.email) {
      await this.queueService.sendNotificationEmail({
        to: user.email,
        subject: 'Your account has been restored',
        template: 'account-restored',
        context: {
          userName: user.walletAddress,
        },
      });
    }

    return user;
  }
}
