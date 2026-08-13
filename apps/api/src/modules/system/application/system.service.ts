import { BadRequestException, Injectable } from '@nestjs/common';
import { EmploymentStatus, SaveMode } from '@ax-bridge/shared-constants';
import { PasswordHasher } from '../../../common/auth/password-hasher';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import { SystemRepository } from '../infrastructure/system.repository';
import { EmployeeAccountPolicy } from '../domain/employee-account.policy';
import type { SaveEmployeeDto, SaveEntityDto, SaveYearDto } from '../presentation/system.dto';

/**
 * SYSTEM Application 서비스 (설계서 §10.3 Command 경로).
 * Application → Domain Policy → Repository(→ usp_*).
 */
@Injectable()
export class SystemService {
  constructor(
    private readonly repo: SystemRepository,
    private readonly hasher: PasswordHasher,
    private readonly accountPolicy: EmployeeAccountPolicy,
  ) {}

  /* ── 회사 ───────────────────────────────────────────────────────────────── */

  saveEntity(mode: SaveMode, companyId: string, entityId: string | undefined, dto: SaveEntityDto) {
    const id = mode === SaveMode.Insert ? dto.entity_id : entityId;
    if (!id) throw new BadRequestException('entity_id 가 필요합니다.');
    return this.repo.saveEntity(mode, companyId, {
      entity_id: id,
      entity_name: dto.entity_name,
      entity_name_ko: dto.entity_name_ko,
      RepName: dto.RepName ?? null,
      RegNum: dto.RegNum ?? null,
      BizNum: dto.BizNum ?? null,
      BizIndustry: dto.BizIndustry ?? null,
      BizCategory: dto.BizCategory ?? null,
      Address: dto.Address ?? null,
      estabilish_date: dto.estabilish_date ?? null,
      PhoneNumber: dto.PhoneNumber ?? null,
      FaxNumber: dto.FaxNumber ?? null,
      note: dto.note ?? null,
      description: dto.description ?? null,
      status: dto.status ?? 0,
    });
  }

  /* ── 직원 ───────────────────────────────────────────────────────────────── */

  /**
   * 직원 저장.
   *
   * 비밀번호는 **여기서 해시**한다. 프로시저는 `@init_pass_hash` 로 해시만 받는다(§6.1).
   * · user_yn=true 이고 신규면 user_id + 초기 비밀번호가 필수다.
   * · 비밀번호 미입력 시 null 을 넘겨 프로시저가 기존 해시를 유지하게 한다.
   * · user_yn=false 면 프로시저가 `!LOCKED!<random>` 을 심어 로그인을 막는다.
   */
  async saveEmployee(
    mode: SaveMode,
    scope: CompanyScope,
    employeeId: string | undefined,
    dto: SaveEmployeeDto,
  ) {
    const id = mode === SaveMode.Insert ? dto.employee_id : employeeId;
    if (!id) throw new BadRequestException('employee_id 가 필요합니다.');

    this.accountPolicy.assertValid({
      mode,
      userYn: dto.user_yn ?? false,
      userId: dto.user_id,
      hasPassword: Boolean(dto.init_password),
      status: dto.status,
    });

    const initPassHash = dto.init_password ? await this.hasher.hash(dto.init_password) : null;

    return this.repo.saveEmployee(mode, scope, {
      employee_id: id,
      team_id: dto.team_id,
      employee_name: dto.employee_name,
      email: dto.email ?? null,
      english_name: dto.english_name ?? null,
      title: dto.title ?? null,
      title_abbr: dto.title_abbr ?? null,
      employment_type: dto.employment_type ?? null,
      status: dto.status,
      start_date: dto.start_date ?? null,
      departure_date: dto.departure_date ?? null,
      timezone: dto.timezone ?? null,
      phone: dto.phone ?? null,
      birthday: dto.birthday ?? null,
      profile_image_url: dto.profile_image_url ?? null,
      slack_user_id: dto.slack_user_id ?? null,
      slack_handle: dto.slack_handle ?? null,
      social_buddy: dto.social_buddy ?? null,
      user_yn: dto.user_yn ? 1 : 0,
      user_id: dto.user_yn ? (dto.user_id ?? null) : null,
      init_pass_hash: initPassHash,
    });
  }

  /**
   * admin 비활성 방지 (설계서 §6.3 — DB 에 강제 장치가 없어 여기서 막는다).
   *
   * 트리거는 `user_id='admin'` 의 **물리 DELETE 만** 차단한다(51001).
   * `status='inactive'` 나 `user_yn=0` 으로 바꾸면 최고관리자 접근수단이 사라진다.
   */
  async assertAdminStaysReachable(scope: CompanyScope, employeeId: string, dto: SaveEmployeeDto) {
    const { rows } = await this.repo.getEmployee(scope, employeeId);
    const cur = rows[0] as { user_id?: string } | undefined;
    if (cur?.user_id !== 'admin') return;

    const losingAccess = dto.user_yn === false || dto.status === EmploymentStatus.Inactive;
    if (losingAccess) {
      throw new BadRequestException(
        'built-in admin 계정은 비활성화할 수 없습니다. 다른 최고관리자 계정을 먼저 확보하세요.',
      );
    }
  }

  /* ── 회사 기수 ──────────────────────────────────────────────────────────── */

  saveYear(mode: SaveMode, scope: CompanyScope, yearId: string | undefined, dto: SaveYearDto) {
    const id = mode === SaveMode.Insert ? dto.company_year_id : yearId;
    if (!id) throw new BadRequestException('company_year_id 가 필요합니다.');
    return this.repo.saveYear(mode, scope, {
      companyYearId: id,
      companyYear: dto.company_year,
      actualYear: dto.actual_year,
    });
  }
}
