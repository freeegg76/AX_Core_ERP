import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { CompanyScope } from './company-scope';
import type { AuthUser } from '../auth/auth-user';

export const SCOPE_HEADER_COMPANY = 'x-company-id';
export const SCOPE_HEADER_ENTITY = 'x-entity-id';

/**
 * @Scope() — 컨트롤러 핸들러에 CompanyScope 를 주입한다.
 *
 * 출처는 **JWT claim 이 정본**이다. 헤더가 함께 오면 claim 과 일치하는지 검증하고
 * 불일치면 403 으로 막는다 — 클라이언트가 헤더를 바꿔 타 회사에 접근하는 것을 차단한다.
 * 요청 본문·쿼리의 company_id / entity_id 는 어떤 경우에도 신뢰하지 않는다(FR-Bank-08).
 */
export const Scope = createParamDecorator((_data: unknown, ctx: ExecutionContext): CompanyScope => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  const user = req.user;
  if (!user) throw new ForbiddenException('인증 정보가 없습니다.');

  const hCompany = req.headers[SCOPE_HEADER_COMPANY];
  const hEntity = req.headers[SCOPE_HEADER_ENTITY];
  const headerCompany = Array.isArray(hCompany) ? hCompany[0] : hCompany;
  const headerEntity = Array.isArray(hEntity) ? hEntity[0] : hEntity;

  if (headerCompany && headerCompany !== user.companyId) {
    throw new ForbiddenException('요청한 그룹이 로그인 정보와 일치하지 않습니다.');
  }
  if (headerEntity && headerEntity !== user.entityId) {
    throw new ForbiddenException('요청한 회사가 로그인 정보와 일치하지 않습니다.');
  }

  return CompanyScope.of(user.companyId, user.entityId);
});
