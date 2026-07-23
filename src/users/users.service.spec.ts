import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from '../auth/entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepository: any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
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

  describe('getProfile', () => {
    it('should return user with computed stats', async () => {
      const user = { id: 'user-id', walletAddress: '0x123' };
      mockRepository.findOne.mockResolvedValue(user);

      const result = await service.getProfile('user-id');
      expect(result).toEqual({
        ...user,
        totalRaised: 0,
        totalDonated: 0,
        campaignCount: 0,
      });
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 'user-id' } });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getProfile('user-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update and return user profile', async () => {
      const user = { id: 'user-id', displayName: 'Old Name' };
      mockRepository.findOne.mockResolvedValue(user);
      mockRepository.save.mockResolvedValue({ ...user, displayName: 'New Name' });

      const dto = { displayName: 'New Name' };
      const result = await service.updateProfile('user-id', dto);

      expect(user.displayName).toBe('New Name');
      expect(mockRepository.save).toHaveBeenCalledWith(user);
      expect(result.displayName).toBe('New Name');
    });

    it('should throw NotFoundException if user not found on update', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.updateProfile('user-id', {})).rejects.toThrow(NotFoundException);
    });
  });
});
