import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '../../auth/guards/jwt-auth.guard';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
