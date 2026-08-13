import { BadRequestException, Injectable } from '@nestjs/common';
import { ApprovalStatus, DebitCredit, LedgerType, SaveMode } from '@ax-bridge/shared-constants';
import { toBool, toInt, toMoney } from '../../../common/database/numeric';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import {
  EMPTY_LAYER3,
  Ledger,
  LedgerLine,
  type GlFlags,
  type Layer3Conflict,
  type Layer3Values,
} from '../domain/ledger';
import { FinanceRepository } from '../infrastructure/finance.repository';

export interface LineInput {
  gl_id: string;
  DRCR: DebitCredit;
  amount: number;
  bank_id?: string | null;
  Team_id?: string | null;
  pod_id?: string | null;
  employee_Id?: string | null;
  client_id?: string | null;
  vendor_id?: string | null;
  dimension1?: string | null;
  dimension2?: string | null;
  dimension3?: string | null;
  dimension4?: string | null;
  dimension5?: string | null;
  due_date?: string | null;
}

/** 프로시저가 라인 결과셋에 붙여주는 플래그 별칭 → GlFlags */
function flagsFromRow(r: Record<string, unknown>): GlFlags {
  return {
    bank: toBool(r.f_bank), team: toBool(r.f_team), pod: toBool(r.f_pod),
    employee: toBool(r.f_employee), client: toBool(r.f_client), vendor: toBool(r.f_vendor),
    dim1: toBool(r.f_dim1), dim2: toBool(r.f_dim2), dim3: toBool(r.f_dim3),
    dim4: toBool(r.f_dim4), dim5: toBool(r.f_dim5), due: toBool(r.f_due),
  };
}

/** finance_GL 행(bit 컬럼) → GlFlags */
export function flagsFromGlRow(r: Record<string, unknown>): GlFlags {
  return {
    bank: toBool(r.bank_id), team: toBool(r.Team_id), pod: toBool(r.pod_id),
    employee: toBool(r.employee_Id), client: toBool(r.client_id), vendor: toBool(r.vendor_id),
    dim1: toBool(r.dimension1), dim2: toBool(r.dimension2), dim3: toBool(r.dimension3),
    dim4: toBool(r.dimension4), dim5: toBool(r.dimension5), due: toBool(r.due_date),
  };
}

function layer3From(i: LineInput): Layer3Values {
  return {
    ...EMPTY_LAYER3,
    bankId: i.bank_id ?? null,
    teamId: i.Team_id ?? null,
    podId: i.pod_id ?? null,
    employeeId: i.employee_Id ?? null,
    clientId: i.client_id ?? null,
    vendorId: i.vendor_id ?? null,
    dimension1: i.dimension1 ?? null,
    dimension2: i.dimension2 ?? null,
    dimension3: i.dimension3 ?? null,
    dimension4: i.dimension4 ?? null,
    dimension5: i.dimension5 ?? null,
    dueDate: i.due_date ?? null,
  };
}

/**
 * 전표 Application 서비스 (설계서 §9.1 · §7.4).
 *
 * Aggregate 를 복원해 Domain 이 규칙을 먼저 판정하게 하고, 그 다음 프로시저를 호출한다.
 * 프로시저도 같은 규칙을 갖고 있지만(이중 방어), Domain 이 먼저 걸러 명확한 메시지를 준다.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly repo: FinanceRepository) {}

  /** Aggregate 복원 — 마감연도 여부까지 포함해야 변경 가드가 성립한다. */
  async load(scope: CompanyScope, ledgerDate: string, ledgerNo: number): Promise<Ledger> {
    const { head, lines } = await this.repo.getLedger(scope, ledgerDate, ledgerNo);
    if (!head) throw new BadRequestException('대상 전표가 존재하지 않습니다.');
    const h = head as Record<string, unknown>;

    const yearClosed = await this.repo.isYearClosed(scope, ledgerDate);

    const domainLines = (lines as Array<Record<string, unknown>>).map(
      (r) =>
        new LedgerLine(
          String(r.gl_id),
          String(r.DRCR) as DebitCredit,
          toMoney(r.amount),
          {
            bankId: (r.bank_id as string) ?? null,
            teamId: (r.Team_id as string) ?? null,
            podId: (r.pod_id as string) ?? null,
            employeeId: (r.employee_Id as string) ?? null,
            clientId: (r.client_id as string) ?? null,
            vendorId: (r.vendor_id as string) ?? null,
            dimension1: (r.dimension1 as string) ?? null,
            dimension2: (r.dimension2 as string) ?? null,
            dimension3: (r.dimension3 as string) ?? null,
            dimension4: (r.dimension4 as string) ?? null,
            dimension5: (r.dimension5 as string) ?? null,
            dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
          },
        ),
    );

    return Ledger.restore({
      id: { ledgerDate, ledgerNo },
      name: (h.ledger_name as string) ?? null,
      type: String(h.ledger_type ?? '0') as LedgerType,
      employeeId: String(h.employee_Id ?? ''),
      approval: toBool(h.approval_status) ? ApprovalStatus.Approved : ApprovalStatus.Pending,
      lines: domainLines,
      yearClosed,
    });
  }

  /** 조회용 — 헤더/라인/합계/플래그를 한 번에 준다(3-Layer 화면이 이 형태를 쓴다). */
  async detail(scope: CompanyScope, ledgerDate: string, ledgerNo: number) {
    const { head, lines } = await this.repo.getLedger(scope, ledgerDate, ledgerNo);
    if (!head) return null;
    const rows = lines as Array<Record<string, unknown>>;
    const debit = rows
      .filter((r) => String(r.DRCR) === DebitCredit.Debit)
      .reduce((s, r) => s + toMoney(r.amount), 0);
    const credit = rows
      .filter((r) => String(r.DRCR) === DebitCredit.Credit)
      .reduce((s, r) => s + toMoney(r.amount), 0);

    return {
      head,
      lines: rows.map((r) => ({
        line_on: toInt(r.line_on),
        gl_id: r.gl_id,
        gl_name: r.gl_name,
        DRCR: r.DRCR,
        amount: toMoney(r.amount),
        bank_id: r.bank_id,
        bank_name: r.bank_name,
        Team_id: r.Team_id,
        pod_id: r.pod_id,
        employee_Id: r.employee_Id,
        client_id: r.client_id,
        vendor_id: r.vendor_id,
        dimension1: r.dimension1,
        dimension2: r.dimension2,
        dimension3: r.dimension3,
        dimension4: r.dimension4,
        dimension5: r.dimension5,
        due_date: r.due_date ? String(r.due_date).slice(0, 10) : null,
        // Layer3 입력영역 활성/비활성 제어용 (FR-Ledger-06/07/08)
        flags: flagsFromRow(r),
      })),
      // Layer2 상단 실시간 표시 (FR-Ledger-10)
      totals: { debit, credit, difference: debit - credit, balanced: debit === credit },
    };
  }

  /** Head 등록 — ledger_no 는 프로시저가 채번한다(§9.2). */
  async createHead(scope: CompanyScope, p: {
    ledgerDate: string;
    ledgerName?: string | null;
    ledgerType?: LedgerType;
    employeeId: string;
  }): Promise<number> {
    if (await this.repo.isYearClosed(scope, p.ledgerDate)) {
      throw new BadRequestException('회계마감된 연도에는 전표를 등록할 수 없습니다.');
    }
    return this.repo.saveLedgerHead(SaveMode.Insert, scope, {
      ledgerDate: p.ledgerDate,
      ledgerName: p.ledgerName,
      ledgerType: p.ledgerType ?? LedgerType.General,
      employeeId: p.employeeId,
    });
  }

  async updateHead(scope: CompanyScope, ledgerDate: string, ledgerNo: number, p: {
    ledgerName?: string | null;
    ledgerType?: LedgerType;
    employeeId: string;
  }): Promise<void> {
    const ledger = await this.load(scope, ledgerDate, ledgerNo);
    try {
      ledger.changeHead({ name: p.ledgerName, type: p.ledgerType });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await this.repo.saveLedgerHead(SaveMode.Update, scope, {
      ledgerDate,
      ledgerNo,
      ledgerName: ledger.name,
      ledgerType: ledger.type,
      employeeId: p.employeeId,
    });
  }

  /**
   * 라인 일괄 저장.
   *
   * 각 라인의 계정 플래그를 조회해 **Domain 이 먼저** 정합을 검증한다
   * (프로시저 50464~50466 과 같은 규칙). 배열 순서가 `line_on` 이 된다.
   */
  async saveLines(scope: CompanyScope, ledgerDate: string, ledgerNo: number, inputs: LineInput[]): Promise<void> {
    const ledger = await this.load(scope, ledgerDate, ledgerNo);

    const flagCache = new Map<string, GlFlags>();
    const lines: LedgerLine[] = [];
    for (const i of inputs) {
      const flags = await this.flagsOf(scope, i.gl_id, flagCache);
      const line = new LedgerLine(i.gl_id, i.DRCR, i.amount, layer3From(i));
      try {
        line.assertValid();
        line.validateAgainst(flags);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      lines.push(line);
    }

    try {
      ledger.replaceLines(lines);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    await this.repo.saveLedgerLines(scope, ledgerDate, ledgerNo, ledger.linesToJson());
  }

  /**
   * 계정 변경 시 Layer3 재검증 (UC-Ledger-04 예외 — 설계서 §7.4).
   *
   * 값을 **자동으로 버리지 않는다.** 충돌 목록을 돌려주고 화면이 사용자 확인을
   * 받은 뒤 정리된 라인으로 다시 저장하게 한다.
   */
  async previewAccountChange(scope: CompanyScope, p: {
    currentLine: LineInput;
    nextGlId: string;
  }): Promise<{ conflicts: Layer3Conflict[]; nextFlags: GlFlags }> {
    const nextFlags = await this.flagsOf(scope, p.nextGlId, new Map());
    const line = new LedgerLine(p.currentLine.gl_id, p.currentLine.DRCR, p.currentLine.amount, layer3From(p.currentLine));
    return { conflicts: line.conflictsWith(nextFlags), nextFlags };
  }

  /** 승인 — Domain 이 차대 균형·상태를 먼저 판정하고 프로시저가 실행한다. */
  async approve(scope: CompanyScope, ledgerDate: string, ledgerNo: number, approverId: string): Promise<void> {
    const ledger = await this.load(scope, ledgerDate, ledgerNo);
    try {
      ledger.approve();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await this.repo.approveLedger(scope, ledgerDate, ledgerNo, approverId);
  }

  async remove(scope: CompanyScope, ledgerDate: string, ledgerNo: number): Promise<void> {
    const ledger = await this.load(scope, ledgerDate, ledgerNo);
    try {
      ledger.assertDeletable();
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    await this.repo.deleteLedger(scope, ledgerDate, ledgerNo);
  }

  private async flagsOf(scope: CompanyScope, glId: string, cache: Map<string, GlFlags>): Promise<GlFlags> {
    const hit = cache.get(glId);
    if (hit) return hit;
    const { rows } = await this.repo.getGl(scope, glId);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new BadRequestException(`계정과목 ${glId} 을(를) 찾을 수 없습니다.`);
    const flags = flagsFromGlRow(row);
    cache.set(glId, flags);
    return flags;
  }
}
