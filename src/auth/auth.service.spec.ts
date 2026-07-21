import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { RedisService } from '../redis/redis.service';

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: { fromPublicKey: jest.fn() },
}));

type MockFn = jest.Mock;
type MockedRedis = Record<
  'exists' | 'get' | 'del' | 'set' | 'sadd' | 'srem' | 'smembers',
  MockFn
>;
type MockedRepo = Record<'findOne' | 'create' | 'save', MockFn>;
type MockedJwt = Record<'signAsync' | 'verifyAsync' | 'decodeAsync', MockFn>;

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

  const walletAddress =
    'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXWKZMWL4M7RFCNARX6DOX';

  const challenge = 'lumora-test-challenge-abc123';
  const signedChallenge = Buffer.from('mock-sig').toString('base64');
  const mockVerify = jest.fn();

  const mockUser: User = {
    id: 'uuid-1',
    walletAddress,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (Keypair.fromPublicKey as jest.Mock).mockReturnValue({
      verify: mockVerify,
    });
    mockVerify.mockReturnValue(true);

    redisService = {
      exists: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      set: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
    };
    userRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
      verifyAsync: jest.fn(),
      decodeAsync: jest.fn(),
    };

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
      redisService.sadd.mockResolvedValue(1);
      userRepository.findOne.mockResolvedValue(mockUser);
    });

    it('returns accessToken and refreshToken on valid verification', async () => {
      const result = await service.verify({ walletAddress, signedChallenge });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('stores the refresh token in Redis and tracks the session', async () => {
      await service.verify({ walletAddress, signedChallenge });

      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:refresh:/),
        'mock-jwt-token',
        expect.any(Number),
      );
      expect(redisService.sadd).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
        expect.any(String),
      );
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
      (Keypair.fromPublicKey as jest.Mock).mockImplementation(() => {
        throw new Error('invalid key');
      });

      const err = await service
        .verify({ walletAddress, signedChallenge })
        .catch((e: unknown) => e);

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

  describe('refresh', () => {
    const refreshToken = 'mock-refresh-token';
    const refreshJti = 'refresh-jti-1';

    beforeEach(() => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: mockUser.id,
        walletAddress: mockUser.walletAddress,
        role: mockUser.role,
        jti: refreshJti,
        type: 'refresh',
      });
      redisService.get.mockResolvedValue(refreshToken);
      userRepository.findOne.mockResolvedValue(mockUser);
      redisService.sadd.mockResolvedValue(1);
    });

    it('returns new accessToken and refreshToken for a valid refresh token', async () => {
      const result = await service.refresh({ refreshToken });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('rotates the refresh token: old refresh token stops working after new one is issued', async () => {
      const firstResult = await service.refresh({ refreshToken });

      expect(firstResult).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:refresh:/),
      );
      expect(redisService.srem).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
        refreshJti,
      );

      const newRefreshToken = (redisService.set.mock.calls[0] as string[])[1];

      redisService.get.mockResolvedValue(newRefreshToken);
      redisService.del.mockClear();
      redisService.srem.mockClear();
      redisService.set.mockClear();
      redisService.sadd.mockClear();

      const secondResult = await service.refresh({
        refreshToken: newRefreshToken,
      });

      expect(secondResult).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(redisService.sadd).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
        expect.any(String),
      );

      redisService.get.mockResolvedValue(null);
      const err = await service
        .refresh({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });

    it('removes the old refresh token from Redis and session set during rotation', async () => {
      await service.refresh({ refreshToken });

      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:refresh:/),
      );
      expect(redisService.srem).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
        refreshJti,
      );
    });

    it('throws 401 when the refresh token is not found in Redis', async () => {
      redisService.get.mockResolvedValue(null);

      const err = await service
        .refresh({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when the stored refresh token does not match the provided one', async () => {
      redisService.get.mockResolvedValue('different-token');

      const err = await service
        .refresh({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when verifyAsync fails', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

      const err = await service
        .refresh({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when token type is not refresh', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: mockUser.id,
        jti: refreshJti,
        type: 'access',
      });

      const err = await service
        .refresh({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    const refreshToken = 'mock-refresh-token';
    const refreshJti = 'refresh-jti-1';

    beforeEach(() => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: mockUser.id,
        walletAddress: mockUser.walletAddress,
        jti: refreshJti,
        type: 'refresh',
      });
      redisService.del.mockResolvedValue(undefined);
      redisService.srem.mockResolvedValue(1);
    });

    it('invalidates the refresh token by deleting it from Redis', async () => {
      await service.logout({ refreshToken });

      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:refresh:/),
      );
    });

    it('removes the refresh token jti from the user session set', async () => {
      await service.logout({ refreshToken });

      expect(redisService.srem).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
        refreshJti,
      );
    });

    it('throws 401 when the refresh token is invalid', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

      const err = await service
        .logout({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });

    it('throws 401 when token type is not refresh', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: mockUser.id,
        jti: refreshJti,
        type: 'access',
      });

      const err = await service
        .logout({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logoutAll', () => {
    const jtis = ['jti-1', 'jti-2', 'jti-3'];

    beforeEach(() => {
      redisService.smembers.mockResolvedValue(jtis);
      redisService.del.mockResolvedValue(undefined);
    });

    it('deletes all refresh tokens for the user from Redis', async () => {
      await service.logoutAll(mockUser.id);

      expect(redisService.del).toHaveBeenCalledTimes(jtis.length + 1);
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
      );
      jtis.forEach((jti) => {
        expect(redisService.del).toHaveBeenCalledWith(`auth:refresh:${jti}`);
      });
    });

    it('clears the user session set from Redis', async () => {
      await service.logoutAll(mockUser.id);

      expect(redisService.del).toHaveBeenCalledWith(
        `auth:sessions:${mockUser.id}`,
      );
    });

    it('handles users with no active sessions gracefully', async () => {
      redisService.smembers.mockResolvedValue([]);

      await service.logoutAll(mockUser.id);

      expect(redisService.del).toHaveBeenCalledWith(
        `auth:sessions:${mockUser.id}`,
      );
      expect(redisService.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeAccessToken', () => {
    it('stores the jti in the blacklist with the given TTL', async () => {
      await service.revokeAccessToken('access-jti-1', 900);

      expect(redisService.set).toHaveBeenCalledWith(
        'auth:token:blacklist:access-jti-1',
        '1',
        900,
      );
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
