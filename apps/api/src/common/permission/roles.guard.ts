import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, ROLE_RANK } from '@ax-bridge/shared-constants';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user';

export const ROLES_KEY = 'ax:min-role';

/**
 * 엔드포인트 최소 권한 (설계서 §6.2).
 * VIEWER < EDITOR < APPROVER < ADMIN < SUPER — 상위 Role 은 하위를 포함한다.
 */
export const MinRole = (role: Role) => SetMetadata(ROLES_KEY, role);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true; // 권한 표기가 없으면 인증만으로 통과

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('인증 정보가 없습니다.');

    const highest = user.roles.reduce((max, r) => Math.max(max, ROLE_RANK[r] ?? -1), -1);
    if (highest < ROLE_RANK[required]) {
      // 조회전용 사용자가 편집 API 를 호출한 경우가 대표 사례다(FR-UI-07).
      throw new ForbiddenException(`이 기능은 ${required} 이상의 권한이 필요합니다.`);
    }
    return true;
  }
}
