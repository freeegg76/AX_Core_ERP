import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { SaveMode } from '@ax-bridge/shared-constants';
import { escapeLike, NUMERIC_10_2 } from '../../../common/database/numeric';
import { StoredProcExecutor } from '../../../common/database/stored-proc.executor';
import type { CompanyScope } from '../../../common/tenant/company-scope';

/**
 * SYSTEM 쓰기 Repository — 제공된 `usp_system_*` 프로시저를 실행한다 (설계서 §10.1·§10.2).
 *
 * Domain 은 이 클래스를 모른다. Application 이 인터페이스로 주입받는다.
 * 모든 프로시저가 `@company_id`/`@entity_id` 를 받고 WHERE 에 포함하므로,
 * **격리는 여기서 scope 를 정확히 전달하는 것에 전적으로 의존한다**(§5).
 */
@Injectable()
export class SystemRepository {
  constructor(private readonly proc: StoredProcExecutor) {}

  /* ── system_company (그룹) ─────────────────────────────────────────────── */

  saveCompany(mode: SaveMode, p: {
    companyId: string;
    companyName: string;
    companyNameKo: string;
    note?: string | null;
    description?: string | null;
    status: 0 | 1;
  }) {
    return this.proc.exec('usp_system_company_save', {
      in: {
        mode,
        company_id: p.companyId,
        company_name: p.companyName,
        company_name_ko: p.companyNameKo,
        note: p.note ?? null,
        description: p.description ?? null,
        status: p.status,
      },
    });
  }

  deleteCompany(companyId: string) {
    return this.proc.exec('usp_system_company_delete', { in: { company_id: companyId } });
  }

  listCompanies(p: { companyName?: string | null; status?: 0 | 1 | null; searchMode?: string | null }) {
    return this.proc.exec('usp_system_company_list', {
      in: {
        company_name: escapeLike(p.companyName),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
      },
    });
  }

  getCompany(companyId: string) {
    return this.proc.exec('usp_system_company_get', { in: { company_id: companyId } });
  }

  /* ── system_entity (회사) ──────────────────────────────────────────────── */

  saveEntity(mode: SaveMode, companyId: string, p: Record<string, unknown>) {
    return this.proc.exec('usp_system_entity_save', {
      in: { mode, company_id: companyId, ...p },
    });
  }

  deleteEntity(scope: CompanyScope) {
    return this.proc.exec('usp_system_entity_delete', { in: scope.toProcInput() });
  }

  listEntities(companyId: string, p: { entityName?: string | null; status?: 0 | 1 | null; searchMode?: string | null }) {
    return this.proc.exec('usp_system_entity_list', {
      in: {
        company_id: companyId,
        entity_name: escapeLike(p.entityName),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
      },
    });
  }

  getEntity(scope: CompanyScope) {
    return this.proc.exec('usp_system_entity_get', { in: scope.toProcInput() });
  }

  /* ── system_pod ────────────────────────────────────────────────────────── */

  savePod(mode: SaveMode, scope: CompanyScope, p: { podId: string; podName: string; status: 0 | 1 }) {
    return this.proc.exec('usp_system_pod_save', {
      in: { mode, ...scope.toProcInput(), pod_id: p.podId, pod_name: p.podName, status: p.status },
    });
  }

  deletePod(scope: CompanyScope, podId: string) {
    return this.proc.exec('usp_system_pod_delete', { in: { ...scope.toProcInput(), pod_id: podId } });
  }

  listPods(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null; activeOnly?: boolean }) {
    return this.proc.exec('usp_system_pod_list', {
      in: {
        ...scope.toProcInput(),
        pod_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  /* ── system_team (부서) ────────────────────────────────────────────────── */

  saveTeam(mode: SaveMode, scope: CompanyScope, p: {
    teamId: string;
    teamName?: string | null;
    teamNameKo?: string | null;
    owner: string;
    leaderUserId: string;
    podId?: string | null;
    note?: string | null;
    status: 0 | 1;
  }) {
    return this.proc.exec('usp_system_team_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        team_id: p.teamId,
        team_name: p.teamName ?? null,
        team_name_ko: p.teamNameKo ?? null,
        owner: p.owner,
        leader_user_id: p.leaderUserId,
        pod_id: p.podId ?? null,
        note: p.note ?? null,
        status: p.status,
      },
    });
  }

  deleteTeam(scope: CompanyScope, teamId: string) {
    return this.proc.exec('usp_system_team_delete', { in: { ...scope.toProcInput(), team_id: teamId } });
  }

  listTeams(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null; activeOnly?: boolean }) {
    return this.proc.exec('usp_system_team_list', {
      in: {
        ...scope.toProcInput(),
        team_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  /* ── system_employee (직원) ────────────────────────────────────────────── */

  /**
   * `@init_pass_hash` 는 **평문이 아니라 해시**다. Application 이 Argon2id 로
   * 해시해서 전달한다(§6.1). 미입력(null)이면 프로시저가 기존 해시를 유지한다.
   */
  saveEmployee(mode: SaveMode, scope: CompanyScope, p: Record<string, unknown>) {
    return this.proc.exec('usp_system_employee_save', {
      in: { mode, ...scope.toProcInput(), ...p },
    });
  }

  deleteEmployee(scope: CompanyScope, employeeId: string) {
    return this.proc.exec('usp_system_employee_delete', {
      in: { ...scope.toProcInput(), employee_id: employeeId },
    });
  }

  listEmployees(scope: CompanyScope, p: {
    teamId?: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    empStatus?: string | null;
    userYn?: 0 | 1 | null;
    searchMode?: string | null;
    activeOnly?: boolean;
  }) {
    return this.proc.exec('usp_system_employee_list', {
      in: {
        ...scope.toProcInput(),
        team_id: p.teamId ?? null,
        employee_id: p.employeeId ?? null,
        employee_name: escapeLike(p.employeeName),
        emp_status: p.empStatus ?? null,
        user_yn: p.userYn ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  getEmployee(scope: CompanyScope, employeeId: string) {
    return this.proc.exec('usp_system_employee_get', {
      in: { ...scope.toProcInput(), employee_id: employeeId },
    });
  }

  /* ── system_year (회사 기수) ───────────────────────────────────────────── */

  saveYear(mode: SaveMode, scope: CompanyScope, p: {
    companyYearId: string;
    companyYear: number;
    actualYear: number;
  }) {
    return this.proc.exec('usp_system_year_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        company_year_id: p.companyYearId,
        company_year: p.companyYear,
        actual_year: p.actualYear,
      },
      // D6 — 정수 의미지만 DB 는 numeric(10,2) 다. 경계에서 되돌려 바인딩한다.
      out: {},
    });
  }

  deleteYear(scope: CompanyScope, companyYearId: string) {
    return this.proc.exec('usp_system_year_delete', {
      in: { ...scope.toProcInput(), company_year_id: companyYearId },
    });
  }

  listYears(scope: CompanyScope, p: { companyYearId?: string | null; companyYear?: number | null; actualYear?: number | null }) {
    const req = { ...scope.toProcInput(), company_year_id: p.companyYearId ?? null } as Record<string, unknown>;
    if (p.companyYear !== null && p.companyYear !== undefined) req.company_year = p.companyYear;
    if (p.actualYear !== null && p.actualYear !== undefined) req.actual_year = p.actualYear;
    return this.proc.exec('usp_system_year_list', { in: req });
  }
}

/** numeric(10,2) 바인딩이 필요한 곳에서 재사용 */
export const SYSTEM_NUMERIC = { NUMERIC_10_2, sqlTypes: sql };
