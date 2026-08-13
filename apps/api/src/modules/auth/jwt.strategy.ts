import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { toAuthUser, type AuthUser, type JwtClaims } from '../../common/auth/auth-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** 반환값이 req.user 가 된다. company_id/entity_id 는 여기서만 나온다(FR-Bank-08). */
  validate(payload: JwtClaims): AuthUser {
    return toAuthUser(payload);
  }
}
