import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class SuspensionGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      return true; // Let JwtAuthGuard handle authentication
    }

    const dbUser = await this.userRepository.findOne({
      where: { id: user.sub },
    });

    if (!dbUser) {
      return true; // Let other guards handle missing users
    }

    if (dbUser.isSuspended) {
      throw new ForbiddenException(
        `User account is suspended. Reason: ${dbUser.suspensionReason}`,
      );
    }

    return true;
  }
}
