import { Injectable } from '@nestjs/common';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, SearchMode } from '@ax-bridge/shared-constants';
import { PrismaService } from '../../../common/database/prisma.service';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import type { Paged } from '../../../common/http/api-response.interceptor';

export interface PartnerListOpts {
  page?: number;
  size?: number;
  searchMode?: SearchMode | null;
  keyword?: string;
  status?: 0 | 1;
  activeOnly?: boolean;
}

function pageArgs(o: PartnerListOpts) {
  const page = Math.max(1, o.page ?? 1);
  const size = Math.min(PAGE_SIZE_MAX, Math.max(1, o.size ?? PAGE_SIZE_DEFAULT));
  return { skip: (page - 1) * size, take: size, page, size };
}

function textFilter(value: string | undefined, mode: SearchMode | null | undefined) {
  if (!value) return undefined;
  return mode === SearchMode.Exact ? { equals: value } : { contains: value };
}

/**
 * PARTNER 조회 Query Service (설계서 §10.3, D2).
 *
 * ⚠ **status 극성 주의** — partner_* 는 **활성 = status 1** 이다
 * (system_* 는 활성 = 0). 리터럴을 직접 쓰지 않고 아래 헬퍼로 통일한다(§9.9).
 */
@Injectable()
export class PartnerQuery {
  constructor(private readonly db: PrismaService) {}

  /** partner_* 계열: 활성 = true(1) */
  private statusWhere(o: PartnerListOpts): { status?: boolean } {
    if (o.activeOnly) return { status: true };
    if (o.status !== undefined) return { status: o.status === 1 };
    return {};
  }

  async terms(scope: CompanyScope, o: PartnerListOpts): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...scope.toWhere(),
      ...(textFilter(o.keyword, o.searchMode) ? { term_id: textFilter(o.keyword, o.searchMode) } : {}),
      ...this.statusWhere(o),
    };
    const [items, total] = await Promise.all([
      this.db.partner_term.findMany({ where, skip, take, orderBy: { term_id: 'asc' } }),
      this.db.partner_term.count({ where }),
    ]);
    return { items, page, size, total };
  }

  async clients(scope: CompanyScope, o: PartnerListOpts): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...scope.toWhere(),
      ...(textFilter(o.keyword, o.searchMode) ? { client_name: textFilter(o.keyword, o.searchMode) } : {}),
      ...this.statusWhere(o),
    };
    const [items, total] = await Promise.all([
      this.db.partner_client.findMany({
        where,
        skip,
        take,
        orderBy: { client_id: 'asc' },
        include: { partner_term: { select: { term_condition: true, base_rule: true } } },
      }),
      this.db.partner_client.count({ where }),
    ]);
    return { items, page, size, total };
  }

  async vendors(scope: CompanyScope, o: PartnerListOpts): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);
    const where = {
      ...scope.toWhere(),
      ...(textFilter(o.keyword, o.searchMode) ? { vendor_name: textFilter(o.keyword, o.searchMode) } : {}),
      ...this.statusWhere(o),
    };
    const [items, total] = await Promise.all([
      this.db.partner_vendor.findMany({
        where,
        skip,
        take,
        orderBy: { vendor_id: 'asc' },
        include: { partner_term: { select: { term_condition: true, base_rule: true } } },
      }),
      this.db.partner_vendor.count({ where }),
    ]);
    return { items, page, size, total };
  }
}
