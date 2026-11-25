import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Routes a user with a temporary password may still call (they must be able to change it and sign out). */
const ALLOWED_WHILE_PASSWORD_CHANGE_PENDING = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const result = super.handleRequest(err, user, info, context, status);
    if (result?.mustChangePassword) {
      const path = String(context.switchToHttp().getRequest().originalUrl ?? '').split('?')[0];
      if (!ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.includes(path)) {
        throw new ForbiddenException('PASSWORD_CHANGE_REQUIRED: choose a new password before continuing');
      }
    }
    return result;
  }
}
