import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { RedisService } from '../redis/redis.service';
import { User } from './entities/user.entity';
import { AuditLog, AuditAction } from './entities/audit-log.entity';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { RefreshAuthDto } from './dto/refresh-auth.dto';
import { LogoutAuthDto } from './dto/logout-auth.dto';
import { AUTH_CONSTANTS } from './constants/auth.constant';
import { JwtPayload } from './guards/jwt-auth.guard';

interface ChallengeData {
  challengeId: string;
  challenge: string;
  walletAddress: string;
  createdAt: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  // --- Challenge Generation ---------------------------------------------------

  async challenge(walletAddress: string): Promise<{ challenge: string }> {
    const challengeId = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const challengeString = `stellaraid:login:${nonce}:${timestamp}`;

    const challengeData: ChallengeData = {
      challengeId,
      challenge: challengeString,
      walletAddress,
      createdAt: timestamp,
    };

    const challengeKey = `${AUTH_CONSTANTS.CHALLENGE_PREFIX}${challengeId}`;
    await this.redisService.set(
      challengeKey,
      JSON.stringify(challengeData),
      AUTH_CONSTANTS.CHALLENGE_TTL,
    );

    const walletChallengeKey = `${AUTH_CONSTANTS.CHALLENGE_PREFIX}wallet:${walletAddress}`;
    const previousChallengeId = await this.redisService.get(walletChallengeKey);
    if (previousChallengeId) {
      await this.redisService.del(
        `${AUTH_CONSTANTS.CHALLENGE_PREFIX}${previousChallengeId}`,
      );
    }
    await this.redisService.set(
      walletChallengeKey,
      challengeId,
      AUTH_CONSTANTS.CHALLENGE_TTL,
    );

    await this.auditLog({
      action: AuditAction.CHALLENGE_GENERATED,
      walletAddress,
      details: { challengeId },
    });

    return { challenge: challengeString };
  }

  // --- Challenge Verification (Atomic) ---------------------------------------

  async verify(
    dto: VerifyAuthDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { walletAddress, signedChallenge } = dto;

    const consumedKey = this.getConsumedKey(walletAddress, signedChallenge);
    const isReplayed = await this.redisService.exists(consumedKey);
    if (isReplayed) {
      await this.auditLog({
        action: AuditAction.LOGIN_REPLAY_DETECTED,
        walletAddress,
        details: { reason: 'replayed signed challenge' },
      });
      throw new UnauthorizedException({ reason: 'replayed' });
    }

    const walletChallengeKey = `${AUTH_CONSTANTS.CHALLENGE_PREFIX}wallet:${walletAddress}`;
    const challengeId = await this.redisService.get(walletChallengeKey);
    if (!challengeId) {
      throw new UnauthorizedException({ reason: 'expired' });
    }

    const challengeKey = `${AUTH_CONSTANTS.CHALLENGE_PREFIX}${challengeId}`;
    const challengeDataRaw = await this.redisService.get(challengeKey);
    if (!challengeDataRaw) {
      throw new UnauthorizedException({ reason: 'expired' });
    }

    let challengeData: ChallengeData;
    try {
      challengeData = JSON.parse(challengeDataRaw);
    } catch {
      throw new UnauthorizedException({ reason: 'expired' });
    }

    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      const signatureBuffer = Buffer.from(signedChallenge, 'base64');
      const isValid = keypair.verify(
        Buffer.from(challengeData.challenge),
        signatureBuffer,
      );
      if (!isValid) {
        throw new UnauthorizedException({ reason: 'invalid signature' });
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({ reason: 'invalid signature' });
    }

    const consumed = await this.redisService.setnx(
      consumedKey,
      '1',
      AUTH_CONSTANTS.CHALLENGE_CONSUMED_TTL,
    );
    if (!consumed) {
      await this.auditLog({
        action: AuditAction.LOGIN_REPLAY_DETECTED,
        walletAddress,
        details: { reason: 'concurrent challenge consumption' },
      });
      throw new UnauthorizedException({ reason: 'replayed' });
    }

    await this.redisService.del(challengeKey);
    await this.redisService.del(walletChallengeKey);

    let user: User;
    try {
      user = await this.findOrCreateUser(walletAddress);
    } catch (err) {
      await this.redisService.del(consumedKey);
      await this.auditLog({
        action: AuditAction.AUTH_STATE_ROLLBACK,
        walletAddress,
        details: { reason: 'user creation failed', error: String(err) },
      });
      throw err;
    }

    user.lastLoginAt = new Date();
    user.lastSessionAt = new Date();
    await this.userRepository.save(user);

    const tokens = await this.issueTokens(user);

    await this.auditLog({
      action: AuditAction.LOGIN_SUCCESS,
      walletAddress,
      userId: user.id,
      details: { challengeId },
    });

    return tokens;
  }

  // --- Refresh Token Rotation -------------------------------------------------

  async refresh(
    dto: RefreshAuthDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret:
          process.env.JWT_REFRESH_SECRET ??
          process.env.JWT_SECRET + '_refresh',
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }

    const isBlacklisted = await this.redisService.exists(
      `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${payload.jti}`,
    );
    if (isBlacklisted) {
      await this.auditLog({
        action: AuditAction.SESSION_ABUSE_DETECTED,
        userId: payload.sub,
        details: {
          reason: 'blacklisted refresh token used',
          jti: payload.jti,
        },
      });
      await this.logoutAll(payload.sub);
      throw new UnauthorizedException();
    }

    const refreshKey = `${AUTH_CONSTANTS.REFRESH_TOKEN_PREFIX}${payload.jti}`;
    const storedToken = await this.redisService.get(refreshKey);
    if (!storedToken || storedToken !== dto.refreshToken) {
      throw new UnauthorizedException();
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException();
    }

    const refreshTtl = AUTH_CONSTANTS.REFRESH_TOKEN_TTL;
    await this.redisService.set(
      `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${payload.jti}`,
      '1',
      refreshTtl,
    );
    await Promise.all([
      this.redisService.del(refreshKey),
      this.redisService.srem(
        `${AUTH_CONSTANTS.SESSION_PREFIX}${user.id}`,
        payload.jti,
      ),
    ]);

    user.lastSessionAt = new Date();
    await this.userRepository.save(user);

    const tokens = await this.issueTokens(user, payload.jti);

    await this.auditLog({
      action: AuditAction.TOKEN_REFRESHED,
      userId: user.id,
      details: {
        oldJti: payload.jti,
        newJti: (await this.jwtService.decodeAsync(tokens.refreshToken))?.jti,
      },
    });

    return tokens;
  }

  // --- Logout ----------------------------------------------------------------

  async logout(dto: LogoutAuthDto): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret:
          process.env.JWT_REFRESH_SECRET ??
          process.env.JWT_SECRET + '_refresh',
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }

    await this.revokeRefreshToken(payload.jti, payload.sub);

    await this.auditLog({
      action: AuditAction.LOGOUT,
      userId: payload.sub,
      details: { jti: payload.jti },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    const sessionKey = `${AUTH_CONSTANTS.SESSION_PREFIX}${userId}`;
    const jtis = await this.redisService.smembers(sessionKey);

    if (jtis.length > 0) {
      await Promise.all(
        jtis.map((jti) =>
          this.redisService.set(
            `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${jti}`,
            '1',
            AUTH_CONSTANTS.REFRESH_TOKEN_TTL,
          ),
        ),
      );
      await Promise.all(
        jtis.map((jti) =>
          this.redisService.del(
            `${AUTH_CONSTANTS.REFRESH_TOKEN_PREFIX}${jti}`,
          ),
        ),
      );
    }

    await this.redisService.del(sessionKey);

    await this.auditLog({
      action: AuditAction.LOGOUT_ALL,
      userId,
      details: { revokedCount: jtis.length },
    });
  }

  // --- Access Token Revocation -----------------------------------------------

  async revokeAccessToken(jti: string, ttl: number): Promise<void> {
    await this.redisService.set(
      `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${jti}`,
      '1',
      ttl,
    );

    await this.auditLog({
      action: AuditAction.TOKEN_REVOKED,
      details: { jti, tokenType: 'access', ttl },
    });
  }

  // --- Token Issuance (Private) ----------------------------------------------

  private async issueTokens(
    user: User,
    previousRefreshJti?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, issuedAt: now },
        {
          expiresIn: '15m',
          jwtid: accessJti,
        },
      ),
      this.jwtService.signAsync(
        {
          ...payload,
          type: 'refresh',
          jti: refreshJti,
          issuedAt: now,
          lastRotatedAt: previousRefreshJti ? now : undefined,
          previousJti: previousRefreshJti,
        },
        {
          expiresIn: '7d',
          jwtid: refreshJti,
          secret:
            process.env.JWT_REFRESH_SECRET ??
            process.env.JWT_SECRET + '_refresh',
        },
      ),
    ]);

    await Promise.all([
      this.redisService.set(
        `${AUTH_CONSTANTS.REFRESH_TOKEN_PREFIX}${refreshJti}`,
        refreshToken,
        AUTH_CONSTANTS.REFRESH_TOKEN_TTL,
      ),
      this.redisService.sadd(
        `${AUTH_CONSTANTS.SESSION_PREFIX}${user.id}`,
        refreshJti,
      ),
    ]);

    return { accessToken, refreshToken };
  }

  // --- Token Revocation (Private) --------------------------------------------

  private async revokeRefreshToken(
    jti: string,
    userId: string,
  ): Promise<void> {
    const refreshKey = `${AUTH_CONSTANTS.REFRESH_TOKEN_PREFIX}${jti}`;
    const sessionKey = `${AUTH_CONSTANTS.SESSION_PREFIX}${userId}`;

    await this.redisService.set(
      `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${jti}`,
      '1',
      AUTH_CONSTANTS.REFRESH_TOKEN_TTL,
    );

    await Promise.all([
      this.redisService.del(refreshKey),
      this.redisService.srem(sessionKey, jti),
    ]);
  }

  // --- User Management -------------------------------------------------------

  async findOrCreateUser(walletAddress: string): Promise<User> {
    const adminWallets = process.env.ADMIN_ALLOWLIST
      ? process.env.ADMIN_ALLOWLIST.split(',').map((w) =>
          w.trim().toLowerCase(),
        )
      : [];
    const isAdmin = adminWallets.includes(walletAddress.toLowerCase());
    const role = isAdmin ? 'ADMIN' : 'USER';

    const existing = await this.userRepository.findOne({
      where: { walletAddress },
    });

    if (existing) {
      if (existing.role !== role) {
        existing.role = role;
        return await this.userRepository.save(existing);
      }
      return existing;
    }

    try {
      const user = this.userRepository.create({ walletAddress, role });
      return await this.userRepository.save(user);
    } catch (err: unknown) {
      const pgErr = err as Record<string, unknown>;
      if (pgErr.code === '23505') {
        const found = await this.userRepository.findOne({
          where: { walletAddress },
        });
        if (found) {
          if (found.role !== role) {
            found.role = role;
            return await this.userRepository.save(found);
          }
          return found;
        }
      }
      throw err;
    }
  }

  // --- Audit Logging ---------------------------------------------------------

  private async auditLog(params: {
    action: AuditAction;
    userId?: string;
    walletAddress?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const logEntry: Partial<AuditLog> = {
        action: params.action,
        details: params.details ?? {},
      };

      if (params.userId) {
        logEntry.targetUser = { id: params.userId } as User;
      }

      await this.auditLogRepository.save(logEntry);
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }

  // --- Helpers ---------------------------------------------------------------

  private getConsumedKey(
    walletAddress: string,
    signedChallenge: string,
  ): string {
    const hash = crypto
      .createHash('sha256')
      .update(signedChallenge)
      .digest('hex');
    return `${AUTH_CONSTANTS.CHALLENGE_CONSUMED_PREFIX}${walletAddress}:${hash}`;
  }
}
