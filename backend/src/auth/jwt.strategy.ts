import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './auth.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'fallback_secret'),
    });
  }

  async validate(payload: JwtPayload) {
    // Tokens issued before ids became numbers carry a UUID. MySQL would read its leading digits as a number and could
    // match the wrong user, so anything that is not a whole number is refused and the user signs in again.
    if (!Number.isInteger(payload.sub)) throw new UnauthorizedException('Please sign in again');
    // An administrator can deactivate an account while its token is still valid: stop it at the next request.
    const current = await this.usersService.findById(payload.sub);
    if (!current || !current.isActive) throw new UnauthorizedException('Your account is inactive');
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      companyId: payload.companyId,
      name: payload.name,
      mustChangePassword: !!payload.mcp,
    };
  }
}
