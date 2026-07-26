import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository, ILike } from 'typeorm';
import { UsersService } from './users.service';
import { User } from '../auth/entities/user.entity';
import { AdminSearchQueryDto } from './dto/admin-search-query.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { AdminSearchResultItemDto } from './dto/admin-search-result.dto';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepository: any;

  const mockUser = {
    id: 'user-id',
    walletAddress: 'GB123...',
    displayName: 'Test User',
    bio: 'A creator',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'user',
    kycStatus: 'not_submitted',
    isSuspended: false,
    suspensionReason: null,
    email: null,
    socialLinks: {},
    verifiedStatus: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    campaigns: [
      { id: 'c1', raisedAmount: '100', creatorId: 'user-id' },
      { id: 'c2', raisedAmount: '200', creatorId: 'user-id' },
    ],
  };

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPublicProfile', () => {
    it('should return public profile with allowlisted fields', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getPublicProfile('GB123...');

      expect(result).toBeInstanceOf(Object);
      expect(result.displayName).toBe('Test User');
      expect(result.avatarUrl).toBe('https://example.com/avatar.png');
      expect(result.bio).toBe('A creator');
      expect(result.verifiedStatus).toBe(true);
      expect(result.campaignCount).toBe(2);
      expect(result.totalRaised).toBe(300);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { walletAddress: 'GB123...' },
        relations: ['campaigns'],
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getPublicProfile('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchUsers', () => {
    it('should return paginated admin search results', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockUser], 1]);

      const query: AdminSearchQueryDto = { q: 'GB', page: 1, pageSize: 20 };
      const result = await service.searchUsers(query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('user-id');
      expect(result.data[0].walletAddress).toBe('GB123...');
      expect(result.data[0].displayName).toBe('Test User');
      expect(result.data[0].role).toBe('user');
      expect(result.data[0].kycStatus).toBe('not_submitted');
      expect(result.data[0].campaignCount).toBe(2);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it('should search by wallet address prefix using ILike', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const query: AdminSearchQueryDto = { q: 'GA', page: 1, pageSize: 20 };
      await service.searchUsers(query);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { walletAddress: ILike('GA%') },
        relations: ['campaigns'],
        skip: 0,
        take: 20,
        order: { createdAt: 'DESC' },
      });
    });

    it('should return empty results when no query matches', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const query: AdminSearchQueryDto = { q: 'NONEXISTENT', page: 1, pageSize: 20 };
      const result = await service.searchUsers(query);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
