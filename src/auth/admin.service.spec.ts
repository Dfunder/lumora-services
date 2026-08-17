import { NotFoundException, BadRequestException } from '@nestjs/common';
import { User, KYCStatus } from './entities/user.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { AdminService } from './admin.service';
import { UpdateKYCStatusDto } from './dto/update-kyc-status.dto';
import { SuspendUserDto, UnsuspendUserDto } from './dto/suspend-user.dto';

describe('AdminService', () => {
  let service: AdminService;
  let mockUserRepository: any;
  let mockAuditLogRepository: any;
  let mockQueueService: any;

  beforeEach(() => {
    mockUserRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockAuditLogRepository = {
      save: jest.fn(),
    };

    mockQueueService = {
      sendNotificationEmail: jest.fn().mockResolvedValue({}),
    };

    service = new AdminService(
      mockUserRepository,
      mockAuditLogRepository,
      mockQueueService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateKYCStatus', () => {
    it('should update user KYC status to VERIFIED', async () => {
      const mockUser = {
        id: 'test-uuid',
        walletAddress: 'test-wallet',
        kycStatus: KYCStatus.UNVERIFIED,
        email: 'test@example.com',
      } as User;

      const updatedUser = { ...mockUser, kycStatus: KYCStatus.VERIFIED };
      const dto: UpdateKYCStatusDto = {
        kycStatus: KYCStatus.VERIFIED,
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);
      mockUserRepository.save.mockResolvedValueOnce(updatedUser);
      mockAuditLogRepository.save.mockResolvedValueOnce({});

      const result = await service.updateKYCStatus('test-uuid', 'admin-id', dto);

      expect(result.kycStatus).toBe(KYCStatus.VERIFIED);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-uuid' },
      });
      expect(mockQueueService.sendNotificationEmail).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      const dto: UpdateKYCStatusDto = {
        kycStatus: KYCStatus.VERIFIED,
      };

      mockUserRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateKYCStatus('non-existent', 'admin-id', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should log audit action on KYC status update', async () => {
      const mockUser = {
        id: 'test-uuid',
        walletAddress: 'test-wallet',
        kycStatus: KYCStatus.UNVERIFIED,
      } as User;

      const updatedUser = { ...mockUser, kycStatus: KYCStatus.REJECTED };
      const dto: UpdateKYCStatusDto = {
        kycStatus: KYCStatus.REJECTED,
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);
      mockUserRepository.save.mockResolvedValueOnce(updatedUser);
      mockAuditLogRepository.save.mockResolvedValueOnce({});

      await service.updateKYCStatus('test-uuid', 'admin-id', dto);

      expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.KYC_STATUS_UPDATED,
        }),
      );
    });
  });

  describe('suspendUser', () => {
    it('should suspend a user', async () => {
      const mockUser = {
        id: 'test-uuid',
        walletAddress: 'test-wallet',
        isSuspended: false,
        email: 'test@example.com',
      } as User;

      const suspendedUser = {
        ...mockUser,
        isSuspended: true,
        suspensionReason: 'Suspicious activity',
      };

      const dto: SuspendUserDto = {
        reason: 'Suspicious activity',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);
      mockUserRepository.save.mockResolvedValueOnce(suspendedUser);
      mockAuditLogRepository.save.mockResolvedValueOnce({});

      const result = await service.suspendUser('test-uuid', 'admin-id', dto);

      expect(result.isSuspended).toBe(true);
      expect(result.suspensionReason).toBe('Suspicious activity');
      expect(mockQueueService.sendNotificationEmail).toHaveBeenCalled();
    });

    it('should throw BadRequestException if user is already suspended', async () => {
      const mockUser = {
        id: 'test-uuid',
        isSuspended: true,
      } as User;

      const dto: SuspendUserDto = {
        reason: 'Another reason',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.suspendUser('test-uuid', 'admin-id', dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit action on user suspension', async () => {
      const mockUser = {
        id: 'test-uuid',
        isSuspended: false,
      } as User;

      const suspendedUser = {
        ...mockUser,
        isSuspended: true,
        suspensionReason: 'Violation of terms',
      };

      const dto: SuspendUserDto = {
        reason: 'Violation of terms',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);
      mockUserRepository.save.mockResolvedValueOnce(suspendedUser);
      mockAuditLogRepository.save.mockResolvedValueOnce({});

      await service.suspendUser('test-uuid', 'admin-id', dto);

      expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_SUSPENDED,
          details: expect.objectContaining({ reason: dto.reason }),
        }),
      );
    });
  });

  describe('unsuspendUser', () => {
    it('should unsuspend a user', async () => {
      const mockUser = {
        id: 'test-uuid',
        isSuspended: true,
        suspensionReason: 'Old reason',
        email: 'test@example.com',
      } as User;

      const unsuspendedUser = {
        ...mockUser,
        isSuspended: false,
        suspensionReason: undefined,
      };

      const dto: UnsuspendUserDto = {
        notes: 'Appeal approved',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);
      mockUserRepository.save.mockResolvedValueOnce(unsuspendedUser);
      mockAuditLogRepository.save.mockResolvedValueOnce({});

      const result = await service.unsuspendUser('test-uuid', 'admin-id', dto);

      expect(result.isSuspended).toBe(false);
      expect(mockQueueService.sendNotificationEmail).toHaveBeenCalled();
    });

    it('should throw BadRequestException if user is not suspended', async () => {
      const mockUser = {
        id: 'test-uuid',
        isSuspended: false,
      } as User;

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.unsuspendUser('test-uuid', 'admin-id'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log audit action on user unsuspension', async () => {
      const mockUser = {
        id: 'test-uuid',
        isSuspended: true,
      } as User;

      const unsuspendedUser = {
        ...mockUser,
        isSuspended: false,
      };

      const dto: UnsuspendUserDto = {
        notes: 'Manual review approved',
      };

      mockUserRepository.findOne.mockResolvedValueOnce(mockUser);
      mockUserRepository.save.mockResolvedValueOnce(unsuspendedUser);
      mockAuditLogRepository.save.mockResolvedValueOnce({});

      await service.unsuspendUser('test-uuid', 'admin-id', dto);

      expect(mockAuditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.USER_UNSUSPENDED,
        }),
      );
    });
  });
});
