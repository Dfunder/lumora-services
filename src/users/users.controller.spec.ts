import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

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
            getProfile: jest.fn(),
            updateProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const req = { user: { sub: 'user-id' } } as any;
      const result = { id: 'user-id', displayName: 'Test User' };
      jest.spyOn(service, 'getProfile').mockResolvedValue(result as any);

      expect(await controller.getProfile(req)).toBe(result);
      expect(service.getProfile).toHaveBeenCalledWith('user-id');
    });
  });

  describe('updateProfile', () => {
    it('should update and return user profile', async () => {
      const req = { user: { sub: 'user-id' } } as any;
      const dto = { displayName: 'Updated User' };
      const result = { id: 'user-id', displayName: 'Updated User' };
      jest.spyOn(service, 'updateProfile').mockResolvedValue(result as any);

      expect(await controller.updateProfile(req, dto)).toBe(result);
      expect(service.updateProfile).toHaveBeenCalledWith('user-id', dto);
    });
  });
});
