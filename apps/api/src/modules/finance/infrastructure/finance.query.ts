import { Injectable } from '@nestjs/common';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, SearchMode } from '@ax-bridge/shared-constants';
import { PrismaService } from '../../../common/database/prisma.service';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import type { Paged } from '../../../common/http/api-response.interceptor';

export interface GlListOpts {
  page?: number;
  size?: number;
  searchMode?: SearchMode | null;
  keyword?: string;
  glType?: string;
  category1?: string;
  category2?: string;
  vatGl?: string;
  status?: 0 | 1;
  activeOnly?: boolean;
}

function pageArgs(o: { page?: number; size?: number }) {
  const page = Math.max(1, o.page ?? 1);
  const size = Math.min(PAGE_SIZE_MAX, Math.max(1, o.size ?? PAGE_SIZE_DEFAULT));
  return { skip: (page - 1) * size, take: size, page, size };
}

/**
 * FINANCE 조회 Query Service (설계서 §10.3, D2).
 *
 * **`usp_finance_gl_list` 를 쓰지 않는 이유** — 그 프로시저는 Head Grid 용으로
 * `gl_id, gl_name` **2컬럼만** 반환한다. 그런데 화면기획서 5-1 ② 는 좌측 Head 에
 * *계정구분·계정코드·계정과목* 3컬럼을 요구한다("FR-GL-01 에 계정구분 컬럼을 추가한
 * 설계 보완"). 프로시저를 고치는 대신 D2 원칙대로 조회를 이 계층으로 옮긴다.
 *
 * 직접 SELECT 를 쓰므로 다음을 반드시 함께 옮긴다:
 *   · company_id + entity_id 스코프 (§5)
 *   · status 극성 — `finance_GL` 은 **활성 = 1** (§9.9)
 */
@Injectable()
export class FinanceQuery {
  constructor(private readonly db: PrismaService) {}

  async gl(scope: CompanyScope, o: GlListOpts): Promise<Paged<unknown>> {
    const { skip, take, page, size } = pageArgs(o);

    // 코드/명칭 어느 쪽으로도 찾을 수 있게 한다(Lookup 팝업이 두 경우를 모두 쓴다).
    const kw = o.keyword?.trim();
    const keywordWhere = kw
      ? o.searchMode === SearchMode.Exact
        ? { OR: [{ gl_id: kw }, { gl_name: kw }] }
        : { OR: [{ gl_id: { contains: kw } }, { gl_name: { contains: kw } }] }
      : {};

    const where = {
      ...scope.toWhere(),
      ...keywordWhere,
      ...(o.glType ? { gl_type: o.glType } : {}),
      ...(o.category1 ? { gl_category1: o.category1 } : {}),
      ...(o.category2 ? { gl_category2: o.category2 } : {}),
      ...(o.vatGl ? { vat_gl: o.vatGl } : {}),
      // finance_GL 은 활성 = 1(true)
      ...(o.activeOnly ? { status: true } : o.status !== undefined ? { status: o.status === 1 } : {}),
    };

    const [items, total] = await Promise.all([
      this.db.finance_GL.findMany({
        where,
        skip,
        take,
        orderBy: { gl_id: 'asc' },
        select: {
          gl_id: true,
          gl_name: true,
          // 좌측 Head 3번째 컬럼 (화면기획서 5-1 ②)
          gl_type: true,
          gl_detail: true,
          status: true,
        },
      }),
      this.db.finance_GL.count({ where }),
    ]);

    return { items, page, size, total };
  }
}
