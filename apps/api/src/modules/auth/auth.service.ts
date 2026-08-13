import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as sql from 'mssql';
import { EmploymentStatus, Role } from '@ax-bridge/shared-constants';
import { PasswordHasher } from '../../common/auth/password-hasher';
import type { JwtClaims } from '../../common/auth/auth-user';
import { StoredProcExecutor } from '../../common/database/stored-proc.executor';

/** usp_auth_get_credential 이 반환하는 행 — 전체 75개 중 user_pass 를 주는 유일한 프로시저 */
interface CredentialRow {
  company_id: string;
  entity_id: string;
  employee_Id: string;
  employee_name: string;
  user_id: string;
  user_pass: string;
  user_yn: boolean;
  status: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  user: {
    userId: string;
    employeeId: string;
    employeeName: string;
    companyId: string;
    entityId: string;
    roles: Role[];
  };
}

/**
 * 인증 서비스 (설계서 §6.1).
 *
 * 해시 검증은 **WAS 가 수행**한다. DB 는 해시를 저장·조회만 한다.
 * `usp_auth_get_credential` 의 결과(특히 user_pass)는 어떤 API 응답에도 넣지 않는다.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly proc: StoredProcExecutor,
    private readonly hasher: PasswordHasher,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(userId: string, password: string): Promise<LoginResult> {
    // 실패 사유를 구분해 노출하지 않는다 — 계정 존재 여부를 추측할 수 없게 한다.
    const fail = () => new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');

    const { rows } = await this.proc.exec<CredentialRow>('usp_auth_get_credential', {
      in: { user_id: userId },
    });
    const cred = rows[0];
    if (!cred) throw fail();

    // 프로시저가 이미 user_yn=1 AND status<>'inactive' 로 걸러주지만 재확인한다(FR-Emp-07).
    if (!cred.user_yn || cred.status === EmploymentStatus.Inactive) throw fail();

    const ok = await this.hasher.verify(cred.user_pass, password);
    if (!ok) throw fail();

    await this.proc.exec('usp_auth_update_last_login', { in: { user_id: userId } });

    const roles = this.resolveRoles(cred);
    const claims: JwtClaims = {
      sub: cred.user_id,
      user_id: cred.user_id,
      employee_id: cred.employee_Id,
      company_id: cred.company_id,
      entity_id: cred.entity_id,
      roles,
    };

    return {
      access_token: await this.signAccess(claims),
      refresh_token: await this.signRefresh(claims),
      user: {
        userId: cred.user_id,
        employeeId: cred.employee_Id,
        employeeName: cred.employee_name,
        companyId: cred.company_id,
        entityId: cred.entity_id,
        roles,
      },
    };
  }

  async refresh(refreshToken: string): Promise<{ access_token: string }> {
    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh 토큰이 유효하지 않습니다.');
    }
    // 토큰 발급 이후 계정이 비활성화되었을 수 있으므로 재조회한다.
    const { rows } = await this.proc.exec<CredentialRow>('usp_auth_get_credential', {
      in: { user_id: claims.user_id },
    });
    const cred = rows[0];
    if (!cred || !cred.user_yn || cred.status === EmploymentStatus.Inactive) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }
    const fresh: JwtClaims = { ...claims, roles: this.resolveRoles(cred) };
    return { access_token: await this.signAccess(fresh) };
  }

  /** 본인 비밀번호 변경 — 현재 비밀번호를 검증한 뒤 새 해시를 저장한다. */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const { rows } = await this.proc.exec<CredentialRow>('usp_auth_get_credential', {
      in: { user_id: userId },
    });
    const cred = rows[0];
    if (!cred) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    if (!(await this.hasher.verify(cred.user_pass, currentPassword))) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    }
    await this.setHash(cred.company_id, cred.entity_id, cred.employee_Id, newPassword);
  }

  /** 관리자 초기화 — 현재 비밀번호를 묻지 않는다(ADMIN 권한으로 보호). */
  async resetPassword(
    companyId: string,
    entityId: string,
    employeeId: string,
    newPassword: string,
  ): Promise<void> {
    await this.setHash(companyId, entityId, employeeId, newPassword);
  }

  private async setHash(
    companyId: string,
    entityId: string,
    employeeId: string,
    plain: string,
  ): Promise<void> {
    const hash = await this.hasher.hash(plain);
    await this.proc.exec('usp_auth_change_password', {
      in: {
        company_id: companyId,
        entity_id: entityId,
        employee_id: employeeId,
        new_pass_hash: hash,
      },
    });
  }

  private signAccess(claims: JwtClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '30m') as never,
    });
  }

  private signRefresh(claims: JwtClaims): Promise<string> {
    return this.jwt.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '14d') as never,
    });
  }

  /**
   * Role 결정 (설계서 §6.2 · D9).
   *
   * ⚠ 원본 산출물 21개 테이블에는 **Role 을 저장하는 컬럼·테이블이 없다.**
   * `system_employee` 에는 `user_yn`(사용자 여부)만 있고 권한 등급이 없다.
   *
   * **D9 결정 — 모든 인증 사용자에게 전체 권한을 부여한다.**
   * 권한 테이블을 신설하지 않고, 로그인한 사용자는 SUPER 까지 모두 갖는다.
   * `ROLE_RANK` 가 최댓값으로 판정하므로 모든 `@MinRole()` 게이트를 통과한다.
   *
   * 엔드포인트의 `@MinRole()` 표기는 **의도적으로 유지**한다 —
   *   · API 명세서가 규정한 필요 권한을 코드에 문서로 남기고,
   *   · 향후 실제 권한 체계를 도입할 때 이 메서드 한 곳만 바꾸면 되도록 한다.
   */
  private resolveRoles(_cred: CredentialRow): Role[] {
    return [Role.Viewer, Role.Editor, Role.Approver, Role.Admin, Role.Super];
  }
}
