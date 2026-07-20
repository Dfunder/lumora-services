import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { RedisService } from '../redis/redis.service';
import { User } from './entities/user.entity';
import { VerifyAuthDto } from './dto/verify-auth.dto';

@Injectable()
export class AuthService {
  private readonly CHALLENGE_TTL = 300;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

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

    const payload = { sub: user.id, walletAddress: user.walletAddress };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, type: 'refresh' },
      {
        expiresIn: '7d',
        secret:
          process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET + '_refresh',
      },
    );

    return { accessToken, refreshToken };
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
