import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
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
