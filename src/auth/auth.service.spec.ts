import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { RedisService } from '../redis/redis.service';

jest.mock('@stellar/stellar-sdk', () => ({ Keypair: { fromPublicKey: jest.fn() } }));


type MockFn = jest.Mock;
type MockedRedis = Record<'exists' | 'get' | 'del' | 'set', MockFn>;
type MockedRepo = Record<'findOne' | 'create' | 'save', MockFn>;
type MockedJwt = Record<'signAsync', MockFn>;

function reason(err: unknown): string {
  if (err instanceof UnauthorizedException) {
    const r = err.getResponse();
    if (typeof r === 'object' && r !== null && 'reason' in r) {
      return (r as Record<string, string>).reason;
    }
  }
  return '';
}

describe('AuthService', () => {
  let service: AuthService;
  let redisService: MockedRedis;
  let userRepository: MockedRepo;
  let jwtService: MockedJwt;

  const walletAddress = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXWKZMWL4M7RFCNARX6DOX';

  const challenge = 'lumora-test-challenge-abc123';
  const signedChallenge = Buffer.from('mock-sig').toString('base64');
  const mockVerify = jest.fn();

  const mockUser: User = {
    id: 'uuid-1',
    walletAddress,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (Keypair.fromPublicKey as jest.Mock).mockReturnValue({ verify: mockVerify } as unknown as InstanceType<typeof Keypair>);
    mockVerify.mockReturnValue(true);

    redisService = {
      exists: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      set: jest.fn(),
    };
    userRepository = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    jwtService = { signAsync: jest.fn().mockResolvedValue('mock-jwt-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: RedisService, useValue: redisService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('verify', () => {
    beforeEach(() => {
      redisService.exists.mockResolvedValue(false);
      redisService.get.mockResolvedValue(challenge);
      redisService.del.mockResolvedValue(undefined);
      redisService.set.mockResolvedValue(undefined);
      userRepository.findOne.mockResolvedValue(mockUser);
    });

    it('returns accessToken and refreshToken on valid verification', async () => {
      const result = await service.verify({ walletAddress, signedChallenge });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('consumes the challenge from Redis on successful verification', async () => {
      await service.verify({ walletAddress, signedChallenge });

      expect(redisService.del).toHaveBeenCalledWith(
        'auth:challenge:' + walletAddress,
      );
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining(
          'auth:challenge:consumed:' + walletAddress + ':',
        ),
        '1',
        300,
      );
    });

    it('throws 401 "expired" when challenge is absent from Redis', async () => {
      redisService.get.mockResolvedValue(null);

      const err = await service
        .verify({ walletAddress, signedChallenge })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(reason(err)).toBe('expired');
    });

    it('throws 401 "invalid signature" when signature does not match challenge', async () => {
      mockVerify.mockReturnValue(false);

      const err = await service
        .verify({ walletAddress, signedChallenge })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(reason(err)).toBe('invalid signature');
    });

    it('throws 401 "invalid signature" when walletAddress is not a valid Stellar key', async () => {
      (Keypair.fromPublicKey as jest.Mock).mockImplementation(() => { throw new Error('invalid key'); });

      const err = await service.verify({ walletAddress, signedChallenge }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(reason(err)).toBe('invalid signature');
    });

    it('throws 401 "replayed" when the same signed challenge is reused', async () => {
      await service.verify({ walletAddress, signedChallenge });

      redisService.exists.mockResolvedValue(true);

      const err = await service
        .verify({ walletAddress, signedChallenge })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(reason(err)).toBe('replayed');
    });

    it('does not touch Redis challenge key when challenge is already replayed', async () => {
      redisService.exists.mockResolvedValue(true);

      await service
        .verify({ walletAddress, signedChallenge })
        .catch(() => undefined);

      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreateUser', () => {
    it('returns existing user without saving when found', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findOrCreateUser(walletAddress);

      expect(result).toBe(mockUser);
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('creates and returns a new user when none exists', async () => {
      userRepository.findOne.mockResolvedValueOnce(null);
      userRepository.create.mockReturnValue({ walletAddress });
      userRepository.save.mockResolvedValue(mockUser);

      const result = await service.findOrCreateUser(walletAddress);

      expect(result).toBe(mockUser);
      expect(userRepository.save).toHaveBeenCalledTimes(1);
    });

    it('handles unique constraint (error code 23505) by returning the already-created user', async () => {
      const uniqueViolation = Object.assign(
        new Error('duplicate key value violates unique constraint'),
        { code: '23505' },
      );

      userRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser);
      userRepository.create.mockReturnValue({ walletAddress });
      userRepository.save.mockRejectedValue(uniqueViolation);

      const result = await service.findOrCreateUser(walletAddress);

      expect(result).toBe(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledTimes(2);
    });

    it('creates exactly one User per wallet even under concurrent requests', async () => {
      let saveCount = 0;

      userRepository.findOne.mockImplementation(() =>
        Promise.resolve(saveCount > 0 ? mockUser : null),
      );
      userRepository.create.mockReturnValue({ walletAddress });
      userRepository.save.mockImplementation(() => {
        if (saveCount++ > 0) {
          return Promise.reject(
            Object.assign(new Error('duplicate key'), { code: '23505' }),
          );
        }
        return Promise.resolve(mockUser);
      });

      const results = await Promise.all([
        service.findOrCreateUser(walletAddress),
        service.findOrCreateUser(walletAddress),
        service.findOrCreateUser(walletAddress),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((u) => expect(u.id).toBe(mockUser.id));
    });
  });
});
