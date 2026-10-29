import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCREEN_KEY, ScreenMeta } from './screen.decorator';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { LEVEL_RANK } from '../role-permissions/role-permissions';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Enforces the role → screen permission matrix (stored in MySQL) on API routes. Use after JwtAuthGuard. */
@Injectable()
export class ScreenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: RolePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<ScreenMeta | undefined>(SCREEN_KEY, [context.getHandler(), context.getClass()]);
    if (!meta) return true;
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;

    const write = !READ_METHODS.has(req.method);
    const screens = write ? meta.write : meta.read;
    let best = 0;
    for (const s of screens) best = Math.max(best, LEVEL_RANK[await this.permissions.levelForUser(user.id, user.role, s)]);

    // read (1) allows reads only; own (2) and full (3) allow changes too
    if (best >= (write ? LEVEL_RANK.own : LEVEL_RANK.read)) return true;
    throw new ForbiddenException(
      best === LEVEL_RANK.read
        ? 'You have read-only access to this screen'
        : 'You do not have access to this screen',
    );
  }
}
