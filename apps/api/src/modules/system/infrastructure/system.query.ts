import { Injectable } from '@nestjs/common';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, SearchMode } from '@ax-bridge/shared-constants';
import { PrismaService } from '../../../common/database/prisma.service';
import { toInt } from '../../../common/database/numeric';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import type { Paged } from '../../../common/http/api-response.interceptor';

export interface PageOpts {
  page?: number;
  size?: number;
  searchMode?: SearchMode | null;
}

function pageArgs(o: PageOpts): { skip: number; take: number; page: number; size: number } {
  const page = Math.max(1, o.page ?? 1);
  const size = Math.min(PAGE_SIZE_MAX, Math.max(1, o.size ?? PAGE_SIZE_DEFAULT));
  return { skip: (page - 1) * size, take: size, page, size };
}

/** Exact / Like 를 규약대로 만든다. 프로시저의 search_mode 불균일을 여기서 흡수한다(§12.3). */
function textFilter(value: string | null | undefined, mode: SearchMode | null | undefined) {
  if (!value) return undefined;
  return mode === SearchMode.Exact ? { equals: value } : { contains: value };
}

/**
 * SYSTEM 조회 Query Service (설계서 §10.3, D2).
 *
 * 페이징·정렬을 여기서 구현한다 — 82개 프로시저 전체에 OFFSET/FETCH 가 없다.
 * `usp_*_list` 는 Lookup 팝업 등 소량 조회에만 쓰고, Head Grid 는 이 계층이 담당한다.
 *
 * 직접 SELECT 를 쓰므로 다음을 반드시 함께 옮긴다:
 *   · company_id + entity_id 스코프 (§5)
 *   · status 극성 — system_* 는 **활성 = 0** (§9.9)
 *   · user_pass 제외 (§6.1)
 */
@Injectable()
export class SystemQuery {
  constructor(private readonly db: PrismaService) {}

  async companies(o: PageOpts & { name?: string; activeOnly?: boolean }): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...(textFilter(o.name, o.searchMode) ? { company_name_ko: textFilter(o.name, o.searchMode) } : {}),
      ...(o.activeOnly ? { status: false } : {}), // 활성 = status 0 → bit false
    };
    const [items, total] = await Promise.all([
      this.db.system_company.findMany({ where, skip, take, orderBy: { company_id: 'asc' } }),
      this.db.system_company.count({ where }),
    ]);
    return { items, page, size, total };
  }

  async entities(companyId: string, o: PageOpts & { name?: string; activeOnly?: boolean }): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      company_id: companyId,
      ...(textFilter(o.name, o.searchMode) ? { entity_name_ko: textFilter(o.name, o.searchMode) } : {}),
      ...(o.activeOnly ? { status: false } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.system_entity.findMany({ where, skip, take, orderBy: { entity_id: 'asc' } }),
      this.db.system_entity.count({ where }),
    ]);
    return { items, page, size, total };
  }

  async pods(scope: CompanyScope, o: PageOpts & { keyword?: string; activeOnly?: boolean }): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...scope.toWhere(),
      ...(textFilter(o.keyword, o.searchMode) ? { pod_name: textFilter(o.keyword, o.searchMode) } : {}),
      ...(o.activeOnly ? { status: false } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.system_pod.findMany({ where, skip, take, orderBy: { pod_id: 'asc' } }),
      this.db.system_pod.count({ where }),
    ]);
    return { items, page, size, total };
  }

  /** 부서 — 오너/리더/Pod 명을 함께 돌려준다(화면기획서 5-4). */
  async teams(scope: CompanyScope, o: PageOpts & { keyword?: string; activeOnly?: boolean }): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...scope.toWhere(),
      ...(textFilter(o.keyword, o.searchMode) ? { team_name_ko: textFilter(o.keyword, o.searchMode) } : {}),
      ...(o.activeOnly ? { status: false } : {}),
    };
    const [rows, total] = await Promise.all([
      this.db.system_team.findMany({
        where,
        skip,
        take,
        orderBy: { Team_id: 'asc' },
        include: { system_pod: { select: { pod_name: true } } },
      }),
      this.db.system_team.count({ where }),
    ]);
    return { items: rows, page, size, total };
  }

  /** 직원 — `user_pass` 를 select 에서 명시적으로 제외한다. */
  async employees(
    scope: CompanyScope,
    o: PageOpts & { teamId?: string; name?: string; empStatus?: string; userYn?: boolean; activeOnly?: boolean },
  ): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...scope.toWhere(),
      ...(o.teamId ? { Team_id: o.teamId } : {}),
      ...(textFilter(o.name, o.searchMode) ? { employee_name: textFilter(o.name, o.searchMode) } : {}),
      ...(o.empStatus ? { status: o.empStatus } : {}),
      ...(o.userYn !== undefined ? { user_yn: o.userYn } : {}),
      ...(o.activeOnly ? { status: 'active' } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.system_employee.findMany({
        where,
        skip,
        take,
        orderBy: { employee_Id: 'asc' },
        select: {
          company_id: true, entity_id: true, Team_id: true, employee_Id: true,
          employee_name: true, english_name: true, email: true, title: true,
          title_abbr: true, employment_type: true, status: true,
          start_date: true, departure_date: true, phone: true,
          user_yn: true, user_id: true, last_login: true,
          // user_pass 는 절대 포함하지 않는다.
        },
      }),
      this.db.system_employee.count({ where }),
    ]);
    return { items, page, size, total };
  }

  /** 회사 기수 — company_year/actual_year 는 numeric(10,2) 이므로 경계에서 정수화한다(D6). */
  async years(scope: CompanyScope, o: PageOpts): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = scope.toWhere();
    const [rows, total] = await Promise.all([
      this.db.system_year.findMany({ where, skip, take, orderBy: { actual_year: 'desc' } }),
      this.db.system_year.count({ where }),
    ]);
    const items = rows.map((r: (typeof rows)[number]) => ({
      companyId: r.company_id,
      entityId: r.entity_id,
      companyYearId: r.company_year_id,
      companyYear: toInt(r.company_year),
      actualYear: toInt(r.actual_year),
    }));
    return { items, page, size, total };
  }
}
