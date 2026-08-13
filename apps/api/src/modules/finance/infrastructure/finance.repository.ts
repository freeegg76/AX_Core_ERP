import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { SaveMode } from '@ax-bridge/shared-constants';
import { escapeLike, NUMERIC_10_2, toInt } from '../../../common/database/numeric';
import { StoredProcExecutor } from '../../../common/database/stored-proc.executor';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import type { GlFlags } from '../domain/ledger';

/** FINANCE 쓰기/프로시저 Repository (설계서 §10.1·§10.2). */
@Injectable()
export class FinanceRepository {
  constructor(private readonly proc: StoredProcExecutor) {}

  /* ── finance_GL (계정과목) ─────────────────────────────────────────────── */

  saveGl(mode: SaveMode, scope: CompanyScope, p: {
    glId: string;
    glName: string;
    glType: string;
    glCategory1?: string | null;
    glCategory2?: string | null;
    vatGl?: string | null;
    glDetail?: string | null;
    contraGl?: string | null;
    status: 0 | 1;
    flags: GlFlags;
  }) {
    const f = p.flags;
    return this.proc.exec('usp_finance_gl_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        gl_id: p.glId,
        gl_name: p.glName,
        gl_type: p.glType,
        gl_category1: p.glCategory1 ?? null,
        gl_category2: p.glCategory2 ?? null,
        vat_gl: p.vatGl ?? null,
        gl_detail: p.glDetail ?? '0',
        contra_gl: p.contraGl ?? null,
        status: p.status,
        f_bank: f.bank ? 1 : 0,
        f_team: f.team ? 1 : 0,
        f_pod: f.pod ? 1 : 0,
        f_employee: f.employee ? 1 : 0,
        f_client: f.client ? 1 : 0,
        f_vendor: f.vendor ? 1 : 0,
        f_dim1: f.dim1 ? 1 : 0,
        f_dim2: f.dim2 ? 1 : 0,
        f_dim3: f.dim3 ? 1 : 0,
        f_dim4: f.dim4 ? 1 : 0,
        f_dim5: f.dim5 ? 1 : 0,
        f_due: f.due ? 1 : 0,
      },
    });
  }

  deleteGl(scope: CompanyScope, glId: string) {
    return this.proc.exec('usp_finance_gl_delete', {
      in: { ...scope.toProcInput(), gl_id: glId },
    });
  }

  listGl(scope: CompanyScope, p: {
    keyword?: string | null;
    glType?: string | null;
    category1?: string | null;
    category2?: string | null;
    vatGl?: string | null;
    status?: 0 | 1 | null;
    searchMode?: string | null;
    activeOnly?: boolean;
  }) {
    return this.proc.exec('usp_finance_gl_list', {
      in: {
        ...scope.toProcInput(),
        gl_keyword: escapeLike(p.keyword),
        gl_type: p.glType ?? null,
        gl_category1: p.category1 ?? null,
        gl_category2: p.category2 ?? null,
        vat_gl: p.vatGl ?? null,
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  /** 상세 + Slot1~5 실제 관리항목명 (LEFT JOIN 5회) */
  getGl(scope: CompanyScope, glId: string) {
    return this.proc.exec('usp_finance_gl_get', {
      in: { ...scope.toProcInput(), gl_id: glId },
    });
  }

  /**
   * 표준 GL 일괄 재생성 (FR-GL-11~14).
   * 대상은 **세션 회사로 고정**이며 사용자가 바꿀 수 없다 — scope 만 넘긴다.
   * `ax_bypass_gl_protect` 세션 플래그를 쓰므로 단일 커넥션에서 실행돼야 한다.
   */
  async generateStandardGl(scope: CompanyScope): Promise<number> {
    const { rows } = await this.proc.exec<{ inserted_count: number }>(
      'usp_finance_gl_generate_standard',
      { in: scope.toProcInput() },
    );
    return Number(rows[0]?.inserted_count ?? 0);
  }

  /* ── finance_dimension (관리항목) ──────────────────────────────────────── */

  saveDimension(mode: SaveMode, scope: CompanyScope, p: { dimensionId: string; name: string; status: 0 | 1 }) {
    return this.proc.exec('usp_finance_dimension_save', {
      in: {
        mode, ...scope.toProcInput(),
        dimension_id: p.dimensionId, dimension_name: p.name, status: p.status,
      },
    });
  }

  deleteDimension(scope: CompanyScope, dimensionId: string) {
    return this.proc.exec('usp_finance_dimension_delete', {
      in: { ...scope.toProcInput(), dimension_id: dimensionId },
    });
  }

  listDimensions(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null }) {
    return this.proc.exec('usp_finance_dimension_list', {
      in: {
        ...scope.toProcInput(),
        dim_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
      },
    });
  }

  listDimensionDetails(scope: CompanyScope, dimensionId: string, p: { keyword?: string | null; searchMode?: string | null }) {
    return this.proc.exec('usp_finance_dimension_detail_list', {
      in: {
        ...scope.toProcInput(),
        dimension_id: dimensionId,
        value_keyword: escapeLike(p.keyword),
        search_mode: p.searchMode ?? null,
      },
    });
  }

  /**
   * 상세값 저장. `@line_no` 는 **양방향 InOut** — NULL 이면 채번, 값이 있으면 수정.
   * ⚠ 개별 값 DELETE 경로는 존재하지 않는다(설계서 §9.8).
   */
  async saveDimensionDetail(scope: CompanyScope, dimensionId: string, p: {
    lineNo?: number | null;
    value: string;
  }): Promise<number> {
    const { output } = await this.proc.exec('usp_finance_dimension_detail_save', {
      in: {
        ...scope.toProcInput(),
        dimension_id: dimensionId,
        line_no: p.lineNo ?? null,
        dimension_value: p.value,
      },
      out: { line_no: NUMERIC_10_2 },
    });
    return toInt(output.line_no ?? p.lineNo ?? 0);
  }

  /* ── finance_bank_account (은행/카드) ──────────────────────────────────── */

  saveBank(mode: SaveMode, scope: CompanyScope, p: {
    bankId: string;
    bankName: string;
    bankAccount?: string | null;
    cardNumber?: string | null;
    status: 0 | 1;
  }) {
    return this.proc.exec('usp_finance_bank_save', {
      in: {
        mode, ...scope.toProcInput(),
        bank_id: p.bankId, bank_name: p.bankName,
        bank_account: p.bankAccount ?? null,
        card_number: p.cardNumber ?? null,
        status: p.status,
      },
    });
  }

  deleteBank(scope: CompanyScope, bankId: string) {
    return this.proc.exec('usp_finance_bank_delete', {
      in: { ...scope.toProcInput(), bank_id: bankId },
    });
  }

  /** 이 프로시저는 `card_number_masked` 로 마스킹된 값만 돌려준다(§9.10). */
  listBanks(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null; activeOnly?: boolean }) {
    return this.proc.exec('usp_finance_bank_list', {
      in: {
        ...scope.toProcInput(),
        bank_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  /* ── finance_open_balance (초기이월) ───────────────────────────────────── */

  /**
   * 초기이월 조회 — **결과셋 2개**를 반환한다(행 + 차/대변 합계).
   * Prisma 로는 표현할 수 없는 대표 사례다(설계서 §10.2, D1).
   */
  async listOpenBalances(scope: CompanyScope, companyYearId: string, p: {
    glKeyword?: string | null;
    drcr?: string | null;
    closed?: 0 | 1 | null;
  }) {
    const { recordsets } = await this.proc.exec('usp_finance_openbalance_list', {
      in: {
        ...scope.toProcInput(),
        company_year_id: companyYearId,
        gl_keyword: escapeLike(p.glKeyword),
        DRCR: p.drcr ?? null,
        closed: p.closed ?? null,
      },
    });
    return { rows: recordsets[0] ?? [], totals: (recordsets[1] ?? [])[0] ?? null };
  }

  /**
   * 초기이월 일괄 저장.
   *
   * ⚠ 시맨틱 (설계서 §9.4):
   *   · `closed=0` 행만 DELETE 후 재INSERT — 확정분·마감생성분은 손대지 않는다.
   *   · `amount > 0` 행만 INSERT 된다 → **0 입력은 저장이 아니라 행 삭제**다.
   */
  saveOpenBalances(scope: CompanyScope, companyYearId: string, rows: Array<{
    gl_id: string;
    DRCR: string;
    bank_id: string | null;
    client_id: string | null;
    vendor_id: string | null;
    amount: number;
  }>) {
    return this.proc.exec('usp_finance_openbalance_save', {
      in: {
        ...scope.toProcInput(),
        company_year_id: companyYearId,
        rows_json: JSON.stringify(rows),
      },
    });
  }

  /** 확정 — 차대 균형 검증 후 closed=1 (APPROVER) */
  closeOpenBalances(scope: CompanyScope, companyYearId: string) {
    return this.proc.exec('usp_finance_openbalance_close', {
      in: { ...scope.toProcInput(), company_year_id: companyYearId },
    });
  }

  /** 확정해제 — 마감연도·자동생성분은 불가 (ADMIN) */
  reopenOpenBalances(scope: CompanyScope, companyYearId: string) {
    return this.proc.exec('usp_finance_openbalance_reopen', {
      in: { ...scope.toProcInput(), company_year_id: companyYearId },
    });
  }

  /* ── finance_ledger (전표) ─────────────────────────────────────────────── */

  listLedgers(scope: CompanyScope, p: {
    dateFrom?: string | null;
    dateTo?: string | null;
    ledgerNo?: number | null;
    ledgerType?: string | null;
    employeeId?: string | null;
    approvalStatus?: 0 | 1 | null;
  }) {
    return this.proc.exec('usp_finance_ledger_list', {
      in: {
        ...scope.toProcInput(),
        date_from: p.dateFrom ?? null,
        date_to: p.dateTo ?? null,
        ledger_no: p.ledgerNo ?? null,
        ledger_type: p.ledgerType ?? null,
        employee_id: p.employeeId ?? null,
        approval_status: p.approvalStatus ?? null,
      },
    });
  }

  /**
   * 전표 상세 — **결과셋 2개** (헤더 / 라인+gl_name+bank_name+플래그 12종).
   * 라인 결과셋의 플래그는 `f_bank`, `f_team`, … `f_due` 별칭으로 온다.
   */
  async getLedger(scope: CompanyScope, ledgerDate: string, ledgerNo: number) {
    const { recordsets } = await this.proc.exec('usp_finance_ledger_get', {
      in: {
        ...scope.toProcInput(),
        ledger_date: ledgerDate,
        ledger_no: ledgerNo,
      },
    });
    return { head: (recordsets[0] ?? [])[0] ?? null, lines: recordsets[1] ?? [] };
  }

  /**
   * Head 저장. `@ledger_no` 는 OUTPUT — `mode='I'` 일 때 프로시저가 채번한다
   * (`MAX+1 WITH (UPDLOCK, HOLDLOCK)`, 범위 = 회사+일자).
   */
  async saveLedgerHead(mode: SaveMode, scope: CompanyScope, p: {
    ledgerDate: string;
    ledgerNo?: number | null;
    ledgerName?: string | null;
    ledgerType: string;
    employeeId: string;
  }): Promise<number> {
    const { output } = await this.proc.exec('usp_finance_ledger_head_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        ledger_date: p.ledgerDate,
        ledger_no: p.ledgerNo ?? null,
        ledger_name: p.ledgerName ?? null,
        ledger_type: p.ledgerType,
        employee_id: p.employeeId,
      },
      out: { ledger_no: NUMERIC_10_2 },
    });
    return toInt(output.ledger_no ?? p.ledgerNo ?? 0);
  }

  /** 라인 일괄 재적재 — JSON 배열 순서가 `line_on` 이 된다(§9.1). */
  saveLedgerLines(scope: CompanyScope, ledgerDate: string, ledgerNo: number, linesJson: string) {
    return this.proc.exec('usp_finance_ledger_detail_save', {
      in: {
        ...scope.toProcInput(),
        ledger_date: ledgerDate,
        ledger_no: ledgerNo,
        lines_json: linesJson,
      },
    });
  }

  /** 승인 — `ax_ledger_approve` 세션 플래그를 쓴다(단일 커넥션 필요). */
  approveLedger(scope: CompanyScope, ledgerDate: string, ledgerNo: number, approverId: string) {
    return this.proc.exec('usp_finance_ledger_approve', {
      in: {
        ...scope.toProcInput(),
        ledger_date: ledgerDate,
        ledger_no: ledgerNo,
        approver_id: approverId,
      },
    });
  }

  deleteLedger(scope: CompanyScope, ledgerDate: string, ledgerNo: number) {
    return this.proc.exec('usp_finance_ledger_delete', {
      in: { ...scope.toProcInput(), ledger_date: ledgerDate, ledger_no: ledgerNo },
    });
  }

  /* ── finance_closing (마감관리) ────────────────────────────────────────── */

  /** 기수·연도별 마감현황 + `prior_year_open`(선행연도 미마감 여부) */
  listClosings(scope: CompanyScope, closing?: 0 | 1 | null) {
    return this.proc.exec('usp_finance_closing_list', {
      in: { ...scope.toProcInput(), closing: closing ?? null },
    });
  }

  /** 연도 회계마감 실행 (ADMIN) → { closed_year_id, next_year_id, carried_rows } */
  async executeClosing(scope: CompanyScope, companyYearId: string) {
    const { rows } = await this.proc.exec<{
      closed_year_id: string;
      next_year_id: string;
      carried_rows: number;
    }>('usp_finance_closing_execute', {
      in: { ...scope.toProcInput(), company_year_id: companyYearId },
    });
    return rows[0] ?? null;
  }

  /**
   * 연도 회계마감 **해제** (ADMIN) — 09 신설 (설계서 §9.6).
   * → { reopened_year_id, next_year_id, removed_rows }
   *
   * 선행검증 50531~50535. 차년도 `source='CLOSING'` 이월만 회수하고
   * 수기 입력분·전표가 있으면 거부한다.
   */
  async reopenClosing(scope: CompanyScope, companyYearId: string) {
    const { rows } = await this.proc.exec<{
      reopened_year_id: string;
      next_year_id: string | null;
      removed_rows: number;
    }>('usp_finance_closing_reopen', {
      in: { ...scope.toProcInput(), company_year_id: companyYearId },
    });
    return rows[0] ?? null;
  }

  /** 마감연도 여부 단건 확인 — 화면 버튼 비활성 제어용 */
  async isYearClosed(scope: CompanyScope, targetDate: string): Promise<boolean> {
    try {
      await this.proc.exec('usp_finance_check_year_open', {
        in: { ...scope.toProcInput(), target_date: targetDate },
      });
      return false; // THROW 없이 통과 = 미마감
    } catch (e) {
      const err = e as { sqlNumber?: number };
      if (err.sqlNumber === 50501) return true;
      throw e;
    }
  }
}

export const FINANCE_LEDGER_NO = NUMERIC_10_2;
export const SQL_TYPES = sql;
