import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { RedisService } from '../redis/redis.service';

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: { fromPublicKey: jest.fn() },
}));

type MockFn = jest.Mock;
type MockedRedis = Record<
  | 'exists'
  | 'get'
  | 'del'
  | 'set'
  | 'setnx'
  | 'sadd'
  | 'srem'
  | 'smembers',
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
  let auditLogRepository: MockedRepo;

  const walletAddress =
    'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGXWKZMWL4M7RFCNARX6DOX';

  const challengeString = 'stellaraid:login:abc123def456:1700000000';
  const signedChallenge = Buffer.from('mock-sig').toString('base64');
  const mockVerify = jest.fn();

  const mockUser: User = {
    id: 'uuid-1',
    walletAddress,
    role: 'user',
    displayName: null,
    avatarUrl: null,
    bio: null,
    verifiedStatus: false,
    kycStatus: 'not_submitted',
    isSuspended: null,
    suspensionReason: null,
    email: null,
    socialLinks: {},
    lastLoginAt: null,
    lastSessionAt: null,
    campaigns: [],
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
      setnx: jest.fn(),
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
    auditLogRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: getRepositoryToken(AuditLog), useValue: auditLogRepository },
        { provide: RedisService, useValue: redisService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('challenge', () => {
    beforeEach(() => {
      redisService.set.mockResolvedValue(undefined);
      redisService.get.mockResolvedValue(null);
      redisService.del.mockResolvedValue(undefined);
      auditLogRepository.save.mockResolvedValue({});
    });

    it('returns a challenge in the format stellaraid:login:<nonce>:<timestamp>', async () => {
      const result = await service.challenge(walletAddress);

      expect(result.challenge).toMatch(
        /^stellaraid:login:[0-9a-f]{64}:\d+$/,
      );
    });

    it('stores the challenge in Redis with UUID-based key and 5-minute TTL', async () => {
      const result = await service.challenge(walletAddress);

      // Should store challenge data as JSON under auth:challenge:<uuid>
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:challenge:[0-9a-f-]{36}$/),
        expect.stringContaining('"challengeId"'),
        300,
      );

      // Should also store wallet -> challengeId mapping
      expect(redisService.set).toHaveBeenCalledWith(
        `auth:challenge:wallet:${walletAddress}`,
        expect.any(String),
        300,
      );
    });

    it('generates a unique nonce on each call', async () => {
      const first = await service.challenge(walletAddress);
      const second = await service.challenge(walletAddress);

      expect(first.challenge).not.toBe(second.challenge);
    });

    it('invalidates previous challenge when a new one is generated', async () => {
      redisService.get.mockResolvedValue('previous-challenge-id');

      await service.challenge(walletAddress);

      // Should delete the previous challenge
      expect(redisService.del).toHaveBeenCalledWith(
        'auth:challenge:previous-challenge-id',
      );
    });

    it('creates an audit log entry', async () => {
      await service.challenge(walletAddress);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CHALLENGE_GENERATED,
        }),
      );
    });
  });

  describe('verify', () => {
    const challengeId = 'test-challenge-id';
    const challengeData = JSON.stringify({
      challengeId,
      challenge: challengeString,
      walletAddress,
      createdAt: Math.floor(Date.now() / 1000),
    });

    beforeEach(() => {
      redisService.exists.mockResolvedValue(false);
      redisService.setnx.mockResolvedValue(true);
      redisService.get
        .mockResolvedValueOnce(challengeId) // wallet challenge key
        .mockResolvedValueOnce(challengeData); // challenge data
      redisService.del.mockResolvedValue(undefined);
      redisService.set.mockResolvedValue(undefined);
      redisService.sadd.mockResolvedValue(1);
      redisService.srem.mockResolvedValue(1);
      redisService.smembers.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      auditLogRepository.save.mockResolvedValue({});
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

    it('consumes the challenge atomically via SETNX', async () => {
      await service.verify({ walletAddress, signedChallenge });

      // Should use SETNX for atomic consumption
      expect(redisService.setnx).toHaveBeenCalledWith(
        expect.stringContaining('auth:challenge:consumed:'),
        '1',
        300,
      );
    });

    it('deletes the challenge and wallet challenge key after verification', async () => {
      await service.verify({ walletAddress, signedChallenge });

      expect(redisService.del).toHaveBeenCalledWith(
        `auth:challenge:${challengeId}`,
      );
      expect(redisService.del).toHaveBeenCalledWith(
        `auth:challenge:wallet:${walletAddress}`,
      );
    });

    it('updates user session metadata on successful login', async () => {
      await service.verify({ walletAddress, signedChallenge });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastLoginAt: expect.any(Date),
          lastSessionAt: expect.any(Date),
        }),
      );
    });

    it('throws 401 "expired" when challenge is absent from Redis', async () => {
      redisService.get.mockReset();
      redisService.get.mockResolvedValue(null); // no wallet challenge key

      const err = await service
        .verify({ walletAddress, signedChallenge })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(reason(err)).toBe('expired');
    });

    it('throws 401 "expired" when challenge data is invalid JSON', async () => {
      redisService.get
        .mockResolvedValueOnce(challengeId)
        .mockResolvedValueOnce('not-valid-json');

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

    it('throws 401 "replayed" when SETNX fails (concurrent consumption)', async () => {
      // First call succeeds
      await service.verify({ walletAddress, signedChallenge });

      // Reset for second call - exists returns false but setnx returns false
      redisService.exists.mockResolvedValue(false);
      redisService.setnx.mockResolvedValue(false);
      redisService.get
        .mockResolvedValueOnce(challengeId)
        .mockResolvedValueOnce(challengeData);

      const err = await service
        .verify({ walletAddress, signedChallenge })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(reason(err)).toBe('replayed');
    });

    it('creates replay detection audit log when challenge is reused', async () => {
      redisService.exists.mockResolvedValue(true);

      await service
        .verify({ walletAddress, signedChallenge })
        .catch(() => undefined);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LOGIN_REPLAY_DETECTED,
        }),
      );
    });

    it('creates login success audit log', async () => {
      await service.verify({ walletAddress, signedChallenge });

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LOGIN_SUCCESS,
        }),
      );
    });

    it('rolls back consumed key when user creation fails', async () => {
      userRepository.findOne.mockRejectedValue(new Error('db error'));

      await service
        .verify({ walletAddress, signedChallenge })
        .catch(() => undefined);

      // Should delete the consumed key on rollback
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringContaining('auth:challenge:consumed:'),
      );
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
      redisService.exists.mockResolvedValue(false); // not blacklisted
      redisService.get.mockResolvedValue(refreshToken);
      redisService.set.mockResolvedValue(undefined);
      redisService.del.mockResolvedValue(undefined);
      redisService.srem.mockResolvedValue(1);
      redisService.sadd.mockResolvedValue(1);
      redisService.smembers.mockResolvedValue([]);
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      jwtService.decodeAsync.mockResolvedValue({ jti: 'new-refresh-jti' });
      auditLogRepository.save.mockResolvedValue({});
    });

    it('returns new accessToken and refreshToken for a valid refresh token', async () => {
      const result = await service.refresh({ refreshToken });

      expect(result).toHaveProperty('accessToken', 'mock-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mock-jwt-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
    });

    it('blacklists the old refresh token before issuing new ones', async () => {
      await service.refresh({ refreshToken });

      // Should blacklist old token
      expect(redisService.set).toHaveBeenCalledWith(
        `auth:token:blacklist:${refreshJti}`,
        '1',
        expect.any(Number),
      );

      // Should delete old token from storage
      expect(redisService.del).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:refresh:/),
      );

      // Should remove from session set
      expect(redisService.srem).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:sessions:/),
        refreshJti,
      );
    });

    it('detects use of blacklisted refresh token and revokes all sessions', async () => {
      redisService.exists.mockResolvedValue(true); // token is blacklisted
      redisService.smembers.mockResolvedValue(['jti-1', 'jti-2']);

      const err = await service
        .refresh({ refreshToken })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(UnauthorizedException);

      // Should have triggered logoutAll - blacklisting all tokens
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:token:blacklist:/),
        '1',
        expect.any(Number),
      );

      // Should create abuse detection audit log
      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.SESSION_ABUSE_DETECTED,
        }),
      );
    });

    it('updates user session metadata on refresh', async () => {
      await service.refresh({ refreshToken });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSessionAt: expect.any(Date),
        }),
      );
    });

    it('creates token refreshed audit log', async () => {
      await service.refresh({ refreshToken });

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.TOKEN_REFRESHED,
        }),
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
      redisService.set.mockResolvedValue(undefined);
      redisService.srem.mockResolvedValue(1);
      auditLogRepository.save.mockResolvedValue({});
    });

    it('blacklists and invalidates the refresh token', async () => {
      await service.logout({ refreshToken });

      // Should blacklist the token
      expect(redisService.set).toHaveBeenCalledWith(
        `auth:token:blacklist:${refreshJti}`,
        '1',
        expect.any(Number),
      );

      // Should delete from storage
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

    it('creates logout audit log', async () => {
      await service.logout({ refreshToken });

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LOGOUT,
        }),
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
      redisService.set.mockResolvedValue(undefined);
      auditLogRepository.save.mockResolvedValue({});
    });

    it('blacklists all refresh tokens before deleting them', async () => {
      await service.logoutAll(mockUser.id);

      // Should blacklist each token
      expect(redisService.set).toHaveBeenCalledTimes(jtis.length);
      jtis.forEach((jti) => {
        expect(redisService.set).toHaveBeenCalledWith(
          `auth:token:blacklist:${jti}`,
          '1',
          expect.any(Number),
        );
      });

      // Should delete each token from storage
      expect(redisService.del).toHaveBeenCalledTimes(jtis.length + 1);
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

    it('creates logout all audit log with revoked count', async () => {
      await service.logoutAll(mockUser.id);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.LOGOUT_ALL,
          details: { revokedCount: 3 },
        }),
      );
    });

    it('handles users with no active sessions gracefully', async () => {
      redisService.smembers.mockResolvedValue([]);

      await service.logoutAll(mockUser.id);

      expect(redisService.del).toHaveBeenCalledWith(
        `auth:sessions:${mockUser.id}`,
      );
      expect(redisService.del).toHaveBeenCalledTimes(1);
      // Should not blacklist anything since there are no tokens
      expect(redisService.set).not.toHaveBeenCalledWith(
        expect.stringMatching(/^auth:token:blacklist:/),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('revokeAccessToken', () => {
    beforeEach(() => {
      auditLogRepository.save.mockResolvedValue({});
    });

    it('stores the jti in the blacklist with the given TTL', async () => {
      await service.revokeAccessToken('access-jti-1', 900);

      expect(redisService.set).toHaveBeenCalledWith(
        'auth:token:blacklist:access-jti-1',
        '1',
        900,
      );
    });

    it('creates token revoked audit log', async () => {
      await service.revokeAccessToken('access-jti-1', 900);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.TOKEN_REVOKED,
          details: { jti: 'access-jti-1', tokenType: 'access', ttl: 900 },
        }),
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
