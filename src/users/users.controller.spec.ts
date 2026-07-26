import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AdminSearchQueryDto } from './dto/admin-search-query.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { AdminSearchResponseDto } from './dto/admin-search-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            getPublicProfile: jest.fn(),
            searchUsers: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPublicProfile', () => {
    it('should return public profile by wallet address', async () => {
      const walletAddress = 'GB...';
      const result: PublicProfileDto = {
        displayName: 'Test User',
        avatarUrl: null,
        bio: 'Bio',
        verifiedStatus: false,
        campaignCount: 0,
        totalRaised: 0,
      };
      jest.spyOn(service, 'getPublicProfile').mockResolvedValue(result);

      expect(await controller.getPublicProfile(walletAddress)).toBe(result);
      expect(service.getPublicProfile).toHaveBeenCalledWith(walletAddress);
    });
  });

  describe('searchUsers', () => {
    it('should return paginated admin search results', async () => {
      const query: AdminSearchQueryDto = { q: 'GB', page: 1, pageSize: 20 };
      const result: AdminSearchResponseDto = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
      jest.spyOn(service, 'searchUsers').mockResolvedValue(result);

      expect(await controller.searchUsers(query)).toBe(result);
      expect(service.searchUsers).toHaveBeenCalledWith(query);
    });
  });
});
