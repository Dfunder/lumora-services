import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.headers['x-user-id'];
    if (!userId) {
      return false;
    }
    request.user = { id: parseInt(userId, 10) };
    return true;
  }
}
