import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { AUTH_CONSTANTS } from '../constants/auth.constant';

export type JwtPayload = {
  sub: string;
  walletAddress: string;
  role: string;
  jti: string;
  type?: string;
  iat?: number;
  exp?: number;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.type === 'refresh') {
        throw new UnauthorizedException();
      }
      if (
        await this.redisService.exists(
          `${AUTH_CONSTANTS.BLACKLIST_PREFIX}${payload.jti}`,
        )
      ) {
        throw new UnauthorizedException();
      }
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
