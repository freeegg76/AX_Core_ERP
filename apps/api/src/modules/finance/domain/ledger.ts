import { ApprovalStatus, DebitCredit, LedgerType, type Layer3Flag } from '@ax-bridge/shared-constants';

/** finance_GL 의 Layer3 사용플래그 12종 (BIT) */
export interface GlFlags {
  bank: boolean;
  team: boolean;
  pod: boolean;
  employee: boolean;
  client: boolean;
  vendor: boolean;
  dim1: boolean;
  dim2: boolean;
  dim3: boolean;
  dim4: boolean;
  dim5: boolean;
  due: boolean;
}

/** finance_ledger_detail 의 Layer3 **실제값** (플래그가 아니다) */
export interface Layer3Values {
  bankId: string | null;
  teamId: string | null;
  podId: string | null;
  employeeId: string | null;
  clientId: string | null;
  vendorId: string | null;
  dimension1: string | null;
  dimension2: string | null;
  dimension3: string | null;
  dimension4: string | null;
  dimension5: string | null;
  dueDate: string | null;
}

export const EMPTY_LAYER3: Layer3Values = {
  bankId: null, teamId: null, podId: null, employeeId: null,
  clientId: null, vendorId: null,
  dimension1: null, dimension2: null, dimension3: null,
  dimension4: null, dimension5: null, dueDate: null,
};

/** 플래그 ↔ 값 필드 대응 — 재검증에서 짝을 정확히 맞추기 위한 단일 정의 */
const PAIRS: ReadonlyArray<{ flag: keyof GlFlags; value: keyof Layer3Values; label: string; column: Layer3Flag }> = [
  { flag: 'bank', value: 'bankId', label: '은행/카드', column: 'bank_id' },
  { flag: 'team', value: 'teamId', label: '부서', column: 'Team_id' },
  { flag: 'pod', value: 'podId', label: 'Pod', column: 'pod_id' },
  { flag: 'employee', value: 'employeeId', label: '직원', column: 'employee_Id' },
  { flag: 'client', value: 'clientId', label: '고객사', column: 'client_id' },
  { flag: 'vendor', value: 'vendorId', label: '거래처', column: 'vendor_id' },
  { flag: 'dim1', value: 'dimension1', label: '관리항목1', column: 'dimension1' },
  { flag: 'dim2', value: 'dimension2', label: '관리항목2', column: 'dimension2' },
  { flag: 'dim3', value: 'dimension3', label: '관리항목3', column: 'dimension3' },
  { flag: 'dim4', value: 'dimension4', label: '관리항목4', column: 'dimension4' },
  { flag: 'dim5', value: 'dimension5', label: '관리항목5', column: 'dimension5' },
  { flag: 'due', value: 'dueDate', label: '지급/입금일', column: 'due_date' },
];

/** 계정 변경으로 플래그가 Y→N 이 되어 버려야 하는 값 */
export interface Layer3Conflict {
  field: keyof Layer3Values;
  label: string;
  currentValue: string;
}

export class LedgerLine {
  constructor(
    private _glId: string,
    private _drcr: DebitCredit,
    private _amount: number,
    private _layer3: Layer3Values,
  ) {}

  get glId(): string { return this._glId; }
  get drcr(): DebitCredit { return this._drcr; }
  get amount(): number { return this._amount; }
  get layer3(): Layer3Values { return { ...this._layer3 }; }

  /** 라인 자체 불변식 — 프로시저(50463)와 같은 규칙을 Domain 이 먼저 표현한다. */
  assertValid(): void {
    if (!this._glId) throw new Error('계정과목이 지정되지 않은 라인이 있습니다.');
    if (this._amount === null || this._amount === undefined || Number.isNaN(this._amount)) {
      throw new Error('금액이 입력되지 않은 라인이 있습니다.');
    }
    if (this._amount <= 0) throw new Error('금액은 0보다 커야 합니다.');
    if (this._drcr !== DebitCredit.Debit && this._drcr !== DebitCredit.Credit) {
      throw new Error('차대구분이 올바르지 않습니다.');
    }
  }

  /** 플래그와 값의 정합을 검사한다 — 프로시저 50464~50466 에 대응. */
  validateAgainst(flags: GlFlags): void {
    for (const p of PAIRS) {
      const v = this._layer3[p.value];
      if (flags[p.flag] && !v) {
        throw new Error(`계정 ${this._glId}: ${p.label} 은(는) 필수 입력입니다.`);
      }
      if (!flags[p.flag] && v) {
        throw new Error(`계정 ${this._glId}: ${p.label} 은(는) 이 계정에서 사용하지 않습니다.`);
      }
    }
  }

  /**
   * 계정 변경 시 새 플래그에서 허용되지 않는 잔존값을 찾는다 (UC-Ledger-04 예외).
   *
   * 값을 **여기서 지우지 않는다** — Application 이 사용자 확인을 받은 뒤
   * `clearConflicts()` 를 호출한다. 무단 폐기를 막기 위한 설계다.
   */
  conflictsWith(next: GlFlags): Layer3Conflict[] {
    const out: Layer3Conflict[] = [];
    for (const p of PAIRS) {
      const v = this._layer3[p.value];
      if (!next[p.flag] && v) out.push({ field: p.value, label: p.label, currentValue: v });
    }
    return out;
  }

  changeAccount(glId: string): void {
    this._glId = glId;
  }

  clearConflicts(next: GlFlags): void {
    for (const p of PAIRS) {
      if (!next[p.flag]) this._layer3 = { ...this._layer3, [p.value]: null };
    }
  }

  /** `usp_finance_ledger_detail_save` 의 @lines_json 요소로 직렬화한다. */
  toJson(): Record<string, unknown> {
    return {
      gl_id: this._glId,
      DRCR: this._drcr,
      amount: this._amount,
      bank_id: this._layer3.bankId,
      Team_id: this._layer3.teamId,
      pod_id: this._layer3.podId,
      employee_Id: this._layer3.employeeId,
      client_id: this._layer3.clientId,
      vendor_id: this._layer3.vendorId,
      dimension1: this._layer3.dimension1,
      dimension2: this._layer3.dimension2,
      dimension3: this._layer3.dimension3,
      dimension4: this._layer3.dimension4,
      dimension5: this._layer3.dimension5,
      due_date: this._layer3.dueDate,
    };
  }
}

export interface LedgerId {
  ledgerDate: string;
  ledgerNo: number;
}

/**
 * Ledger — 전표 Aggregate Root (설계서 §7.4, 지침 §17).
 *
 * Head/Detail 테이블을 그대로 노출하지 않고 하나의 Aggregate 로 다룬다.
 * 현재 상태에서 허용되지 않는 행위는 Entity 가 거부한다.
 *
 * ⚠ **라인 순서가 의미를 갖는다** — `usp_finance_ledger_detail_save` 는
 * 기존 라인을 전부 DELETE 하고 JSON 배열 순서대로 `line_on` 을 1부터 재부여한다.
 * 따라서 부분 저장(단일 라인 PATCH)은 불가능하고 항상 전체 집합을 보낸다(§9.1).
 */
export class Ledger {
  private constructor(
    readonly id: LedgerId,
    private _name: string | null,
    private _type: LedgerType,
    private readonly _employeeId: string,
    private _approval: ApprovalStatus,
    private _lines: LedgerLine[],
    /** 해당 연도가 회계마감되었는가 — 마감연도면 모든 변경이 금지된다(FR-Ledger-16). */
    private readonly _yearClosed: boolean,
  ) {}

  static restore(p: {
    id: LedgerId;
    name: string | null;
    type: LedgerType;
    employeeId: string;
    approval: ApprovalStatus;
    lines: LedgerLine[];
    yearClosed: boolean;
  }): Ledger {
    return new Ledger(p.id, p.name, p.type, p.employeeId, p.approval, p.lines, p.yearClosed);
  }

  get isApproved(): boolean { return this._approval === ApprovalStatus.Approved; }
  get lines(): readonly LedgerLine[] { return this._lines; }
  get name(): string | null { return this._name; }
  get type(): LedgerType { return this._type; }

  get debitTotal(): number {
    return this._lines.filter((l) => l.drcr === DebitCredit.Debit).reduce((s, l) => s + l.amount, 0);
  }

  get creditTotal(): number {
    return this._lines.filter((l) => l.drcr === DebitCredit.Credit).reduce((s, l) => s + l.amount, 0);
  }

  get difference(): number { return this.debitTotal - this.creditTotal; }
  get isBalanced(): boolean { return this.difference === 0; }

  /* ── 변경 가드 ────────────────────────────────────────────────────────── */

  private assertMutable(): void {
    if (this._yearClosed) {
      throw new Error('회계마감된 연도의 전표는 조회만 가능합니다.');
    }
    if (this.isApproved) {
      throw new Error('승인 완료 전표는 수정/삭제할 수 없습니다.');
    }
  }

  changeHead(p: { name?: string | null; type?: LedgerType }): void {
    this.assertMutable();
    if (p.name !== undefined) this._name = p.name;
    if (p.type !== undefined) this._type = p.type;
  }

  /** 라인 집합을 통째로 교체한다 — 프로시저의 delete-then-insert 시맨틱과 일치. */
  replaceLines(lines: LedgerLine[]): void {
    this.assertMutable();
    if (lines.length === 0) throw new Error('전표 라인이 최소 1건 필요합니다.');
    for (const l of lines) l.assertValid();
    this._lines = lines;
  }

  /**
   * 승인 (지침 §18, FR-Ledger-10/13).
   * 미승인 + 라인 존재 + 차대 균형일 때만 허용한다.
   */
  approve(): void {
    if (this._yearClosed) throw new Error('회계마감된 연도의 전표는 승인할 수 없습니다.');
    if (this.isApproved) throw new Error('이미 승인된 전표입니다.');
    if (this._lines.length === 0) throw new Error('전표 라인이 없어 승인할 수 없습니다.');
    if (!this.isBalanced) {
      throw new Error(
        `차변합계와 대변합계가 일치하지 않습니다. ` +
          `차변 ${this.debitTotal.toLocaleString()} · 대변 ${this.creditTotal.toLocaleString()} · ` +
          `차액 ${Math.abs(this.difference).toLocaleString()}`,
      );
    }
    this._approval = ApprovalStatus.Approved;
  }

  assertDeletable(): void {
    if (this._yearClosed) throw new Error('회계마감된 연도의 전표는 삭제할 수 없습니다.');
    if (this.isApproved) throw new Error('승인 완료 전표는 삭제할 수 없습니다.');
  }

  /** 라인 배열을 JSON 파라미터로 직렬화한다. 배열 순서 = line_on 순서. */
  linesToJson(): string {
    return JSON.stringify(this._lines.map((l) => l.toJson()));
  }
}
