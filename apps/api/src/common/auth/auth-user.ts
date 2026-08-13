import { Role } from '@ax-bridge/shared-constants';

/** JWT claim (설계서 §6.1 / API 공통정책) */
export interface JwtClaims {
  sub: string; // user_id
  user_id: string;
  employee_id: string;
  company_id: string;
  entity_id: string;
  roles: Role[];
}

/** req.user 에 주입되는 인증 주체 */
export interface AuthUser {
  userId: string;
  employeeId: string;
  companyId: string;
  entityId: string;
  roles: Role[];
}

export function toAuthUser(c: JwtClaims): AuthUser {
  return {
    userId: c.user_id,
    employeeId: c.employee_id,
    companyId: c.company_id,
    entityId: c.entity_id,
    roles: c.roles ?? [],
  };
}
