import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { RedisService } from '../redis/redis.service';
import { User } from './entities/user.entity';
import { VerifyAuthDto } from './dto/verify-auth.dto';
import { RefreshAuthDto } from './dto/refresh-auth.dto';
import { LogoutAuthDto } from './dto/logout-auth.dto';
import { AUTH_CONSTANTS } from './constants/auth.constant';
import { JwtPayload } from './guards/jwt-auth.guard';

@Injectable()
export class AuthService {
  private readonly CHALLENGE_TTL = 300;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  async challenge(walletAddress: string): Promise<{ challenge: string }> {
    const nonce = crypto.randomBytes(32).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const challengeString = `stellaraid:login:${nonce}:${timestamp}`;

    const challengeKey = this.getChallengeKey(walletAddress);
    await this.redisService.set(
      challengeKey,
      challengeString,
      this.CHALLENGE_TTL,
    );

    return { challenge: challengeString };
  }

  async verify(
    dto: VerifyAuthDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { walletAddress, signedChallenge } = dto;

    const consumedKey = this.getConsumedKey(walletAddress, signedChallenge);
    const isReplayed = await this.redisService.exists(consumedKey);
    if (isReplayed) {
      throw new UnauthorizedException({ reason: 'replayed' });
    }

    const challengeKey = this.getChallengeKey(walletAddress);
    const challenge = await this.redisService.get(challengeKey);
    if (!challenge) {
      throw new UnauthorizedException({ reason: 'expired' });
    }

    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      const signatureBuffer = Buffer.from(signedChallenge, 'base64');
      const isValid = keypair.verify(Buffer.from(challenge), signatureBuffer);
      if (!isValid) {
        throw new UnauthorizedException({ reason: 'invalid signature' });
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({ reason: 'invalid signature' });
    }

    await this.redisService.del(challengeKey);
    await this.redisService.set(consumedKey, '1', this.CHALLENGE_TTL);

    const user = await this.findOrCreateUser(walletAddress);

    return this.issueTokens(user);
  }

  async refresh(
    dto: RefreshAuthDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret:
          process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET + '_refresh',
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.type !== 'refresh') {
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

    await this.revokeRefreshToken(payload.jti, user.id);

    return this.issueTokens(user);
  }

  async logout(dto: LogoutAuthDto): Promise<void> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret:
          process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET + '_refresh',
      });
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException();
    }

    await this.revokeRefreshToken(payload.jti, payload.sub);
  }

  async logoutAll(userId: string): Promise<void> {
    const sessionKey = `${AUTH_CONSTANTS.SESSION_PREFIX}${userId}`;
    const jtis = await this.redisService.smembers(sessionKey);

    if (jtis.length > 0) {
      await Promise.all(
        jtis.map((jti) =>
          this.redisService.del(`${AUTH_CONSTANTS.REFRESH_TOKEN_PREFIX}${jti}`),
        ),
      );
    }

    await this.redisService.del(sessionKey);
  }

  async revokeAccessToken(jti: string, ttl: number): Promise<void> {
    await this.redisService.set(
      `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${jti}`,
      '1',
      ttl,
    );
  }

  private async issueTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const payload = {
      sub: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '15m',
        jwtid: accessJti,
      }),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh', jti: refreshJti },
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

  private async revokeRefreshToken(jti: string, userId: string): Promise<void> {
    const refreshKey = `${AUTH_CONSTANTS.REFRESH_TOKEN_PREFIX}${jti}`;
    const sessionKey = `${AUTH_CONSTANTS.SESSION_PREFIX}${userId}`;
    await Promise.all([
      this.redisService.del(refreshKey),
      this.redisService.srem(sessionKey, jti),
    ]);
  }

  async findOrCreateUser(walletAddress: string): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: { walletAddress },
    });
    if (existing) return existing;

    try {
      const user = this.userRepository.create({ walletAddress });
      return await this.userRepository.save(user);
    } catch (err: unknown) {
      const pgErr = err as Record<string, unknown>;
      if (pgErr.code === '23505') {
        const found = await this.userRepository.findOne({
          where: { walletAddress },
        });
        if (found) return found;
      }
      throw err;
    }
  }

  private getChallengeKey(walletAddress: string): string {
    return 'auth:challenge:' + walletAddress;
  }

  private getConsumedKey(
    walletAddress: string,
    signedChallenge: string,
  ): string {
    const hash = crypto
      .createHash('sha256')
      .update(signedChallenge)
      .digest('hex');
    return 'auth:challenge:consumed:' + walletAddress + ':' + hash;
  }
}
