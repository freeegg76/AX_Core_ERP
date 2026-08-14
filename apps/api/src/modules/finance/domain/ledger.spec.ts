import { ApprovalStatus, DebitCredit, LedgerType } from '@ax-bridge/shared-constants';
import { EMPTY_LAYER3, Ledger, LedgerLine, type GlFlags, type Layer3Values } from './ledger';

const NO_FLAGS: GlFlags = {
  bank: false, team: false, pod: false, employee: false, client: false, vendor: false,
  dim1: false, dim2: false, dim3: false, dim4: false, dim5: false, due: false,
};

const flags = (on: Partial<GlFlags>): GlFlags => ({ ...NO_FLAGS, ...on });
const layer3 = (v: Partial<Layer3Values>): Layer3Values => ({ ...EMPTY_LAYER3, ...v });

const line = (drcr: DebitCredit, amount: number, l3: Partial<Layer3Values> = {}, glId = '10100') =>
  new LedgerLine(glId, drcr, amount, layer3(l3));

const ledger = (p: { lines?: LedgerLine[]; approval?: ApprovalStatus; yearClosed?: boolean } = {}) =>
  Ledger.restore({
    id: { ledgerDate: '2026-03-15', ledgerNo: 1 },
    name: '3월 매출',
    type: LedgerType.Sales,
    employeeId: 'E001',
    approval: p.approval ?? ApprovalStatus.Pending,
    lines: p.lines ?? [line(DebitCredit.Debit, 1000), line(DebitCredit.Credit, 1000)],
    yearClosed: p.yearClosed ?? false,
  });

describe('LedgerLine — 라인 불변식 (FR-Ledger-05/09)', () => {
  it('FR-Ledger-09: 금액이 0 이면 거부한다', () => {
    expect(() => line(DebitCredit.Debit, 0).assertValid()).toThrow('금액은 0보다 커야 합니다.');
  });

  it('FR-Ledger-09: 금액이 음수면 거부한다', () => {
    expect(() => line(DebitCredit.Debit, -1).assertValid()).toThrow('금액은 0보다 커야 합니다.');
  });

  it('FR-Ledger-09: NaN 은 "금액 미입력"으로 거부한다 — 0 비교보다 먼저 걸러야 한다', () => {
    expect(() => line(DebitCredit.Debit, Number.NaN).assertValid())
      .toThrow('금액이 입력되지 않은 라인이 있습니다.');
  });

  it('FR-Ledger-05: 계정과목이 없으면 거부한다', () => {
    expect(() => line(DebitCredit.Debit, 100, {}, '').assertValid())
      .toThrow('계정과목이 지정되지 않은 라인이 있습니다.');
  });

  it('차대구분이 1·2 가 아니면 거부한다', () => {
    const bad = new LedgerLine('10100', '3' as DebitCredit, 100, layer3({}));
    expect(() => bad.assertValid()).toThrow('차대구분이 올바르지 않습니다.');
  });

  it('정상 라인은 통과한다', () => {
    expect(() => line(DebitCredit.Credit, 1).assertValid()).not.toThrow();
  });
});

describe('LedgerLine.validateAgainst — 플래그 ↔ 값 정합 (FR-Ledger-07, 프로시저 50464~50466)', () => {
  it('플래그 Y 인데 값이 없으면 필수 입력 오류', () => {
    expect(() => line(DebitCredit.Debit, 100).validateAgainst(flags({ bank: true })))
      .toThrow('계정 10100: 은행/카드 은(는) 필수 입력입니다.');
  });

  it('플래그 N 인데 값이 있으면 미사용 항목 오류', () => {
    expect(() => line(DebitCredit.Debit, 100, { teamId: 'T01' }).validateAgainst(NO_FLAGS))
      .toThrow('계정 10100: 부서 은(는) 이 계정에서 사용하지 않습니다.');
  });

  it('플래그 12종이 모두 Y 이고 값이 모두 채워지면 통과한다', () => {
    const all = line(DebitCredit.Debit, 100, {
      bankId: 'B1', teamId: 'T1', podId: 'P1', employeeId: 'E1', clientId: 'C1', vendorId: 'V1',
      dimension1: '1', dimension2: '2', dimension3: '3', dimension4: '4', dimension5: '5',
      dueDate: '2026-03-31',
    });
    const on: GlFlags = {
      bank: true, team: true, pod: true, employee: true, client: true, vendor: true,
      dim1: true, dim2: true, dim3: true, dim4: true, dim5: true, due: true,
    };
    expect(() => all.validateAgainst(on)).not.toThrow();
  });
});

describe('LedgerLine.conflictsWith — 계정 변경 미리보기 (UC-Ledger-04 예외)', () => {
  it('새 계정에서 꺼지는 플래그의 잔존값만 돌려준다', () => {
    const l = line(DebitCredit.Debit, 100, { bankId: 'B1', clientId: 'C1' });
    const conflicts = l.conflictsWith(flags({ client: true })); // bank 만 Y→N

    expect(conflicts).toEqual([{ field: 'bankId', label: '은행/카드', currentValue: 'B1' }]);
  });

  it('값을 자동으로 지우지 않는다 — 사용자 확인 전 무단 폐기 금지', () => {
    const l = line(DebitCredit.Debit, 100, { bankId: 'B1' });
    l.conflictsWith(NO_FLAGS);

    expect(l.layer3.bankId).toBe('B1');
  });

  it('clearConflicts 를 호출해야 비로소 지워진다', () => {
    const l = line(DebitCredit.Debit, 100, { bankId: 'B1', clientId: 'C1' });
    l.clearConflicts(flags({ client: true }));

    expect(l.layer3.bankId).toBeNull();
    expect(l.layer3.clientId).toBe('C1');
  });

  it('정리 후에는 새 계정 플래그 검증을 통과한다', () => {
    const l = line(DebitCredit.Debit, 100, { bankId: 'B1', clientId: 'C1' });
    const next = flags({ client: true });
    l.clearConflicts(next);
    l.changeAccount('20100');

    expect(() => l.validateAgainst(next)).not.toThrow();
  });

  it('layer3 getter 는 복사본이라 외부에서 내부 상태를 바꿀 수 없다', () => {
    const l = line(DebitCredit.Debit, 100, { bankId: 'B1' });
    l.layer3.bankId = 'HACKED';

    expect(l.layer3.bankId).toBe('B1');
  });
});

describe('Ledger — 차대 균형', () => {
  it('차변합계·대변합계·차액을 계산한다', () => {
    const l = ledger({ lines: [line(DebitCredit.Debit, 700), line(DebitCredit.Debit, 300), line(DebitCredit.Credit, 900)] });

    expect(l.debitTotal).toBe(1000);
    expect(l.creditTotal).toBe(900);
    expect(l.difference).toBe(100);
    expect(l.isBalanced).toBe(false);
  });

  it('라인이 없으면 균형으로 본다 — 승인은 별도로 라인 존재를 검사한다', () => {
    expect(ledger({ lines: [] }).isBalanced).toBe(true);
  });
});

describe('Ledger.approve — 승인 정책 (지침 §18, FR-Ledger-10/13/16)', () => {
  it('균형 잡힌 미승인 전표는 승인된다', () => {
    const l = ledger();
    l.approve();

    expect(l.isApproved).toBe(true);
  });

  it('FR-Ledger-10: 차대가 맞지 않으면 차액을 알려주며 거부한다', () => {
    const l = ledger({ lines: [line(DebitCredit.Debit, 1000), line(DebitCredit.Credit, 400)] });

    expect(() => l.approve()).toThrow(/차액 600/);
    expect(l.isApproved).toBe(false);
  });

  it('라인이 없으면 승인할 수 없다', () => {
    expect(() => ledger({ lines: [] }).approve()).toThrow('전표 라인이 없어 승인할 수 없습니다.');
  });

  it('이미 승인된 전표는 재승인할 수 없다', () => {
    expect(() => ledger({ approval: ApprovalStatus.Approved }).approve()).toThrow('이미 승인된 전표입니다.');
  });

  it('FR-Ledger-16: 마감연도 전표는 승인할 수 없다', () => {
    expect(() => ledger({ yearClosed: true }).approve())
      .toThrow('회계마감된 연도의 전표는 승인할 수 없습니다.');
  });

  it('FR-Ledger-16: 마감 검사가 승인여부 검사보다 앞선다 — 두 조건이 겹쳐도 마감을 먼저 알린다', () => {
    expect(() => ledger({ yearClosed: true, approval: ApprovalStatus.Approved }).approve())
      .toThrow('회계마감된 연도의 전표는 승인할 수 없습니다.');
  });
});

describe('Ledger — 변경 가드 (FR-Ledger-12/13/16)', () => {
  it('FR-Ledger-12: 승인 전표는 헤더를 수정할 수 없다', () => {
    expect(() => ledger({ approval: ApprovalStatus.Approved }).changeHead({ name: '수정' }))
      .toThrow('승인 완료 전표는 수정/삭제할 수 없습니다.');
  });

  it('FR-Ledger-16: 마감연도 전표는 헤더를 수정할 수 없다', () => {
    expect(() => ledger({ yearClosed: true }).changeHead({ name: '수정' }))
      .toThrow('회계마감된 연도의 전표는 조회만 가능합니다.');
  });

  it('미승인·미마감 전표는 헤더를 수정할 수 있다', () => {
    const l = ledger();
    l.changeHead({ name: '3월 매출(정정)', type: LedgerType.General });

    expect(l.name).toBe('3월 매출(정정)');
    expect(l.type).toBe(LedgerType.General);
  });

  it('replaceLines 는 빈 배열을 거부한다 — 라인 없는 전표를 만들지 않는다', () => {
    expect(() => ledger().replaceLines([])).toThrow('전표 라인이 최소 1건 필요합니다.');
  });

  it('replaceLines 는 각 라인의 불변식을 검사한다', () => {
    expect(() => ledger().replaceLines([line(DebitCredit.Debit, 0)]))
      .toThrow('금액은 0보다 커야 합니다.');
  });

  it('replaceLines 는 검증 실패 시 기존 라인을 유지한다', () => {
    const l = ledger();
    expect(() => l.replaceLines([line(DebitCredit.Debit, 0)])).toThrow();

    expect(l.lines).toHaveLength(2);
  });

  it('승인 전표는 라인을 교체할 수 없다', () => {
    expect(() => ledger({ approval: ApprovalStatus.Approved }).replaceLines([line(DebitCredit.Debit, 1)]))
      .toThrow('승인 완료 전표는 수정/삭제할 수 없습니다.');
  });

  it('assertDeletable: 승인 전표는 삭제 불가', () => {
    expect(() => ledger({ approval: ApprovalStatus.Approved }).assertDeletable())
      .toThrow('승인 완료 전표는 삭제할 수 없습니다.');
  });

  it('assertDeletable: 마감연도 전표는 삭제 불가', () => {
    expect(() => ledger({ yearClosed: true }).assertDeletable())
      .toThrow('회계마감된 연도의 전표는 삭제할 수 없습니다.');
  });
});

describe('Ledger.linesToJson — 프로시저 @lines_json 계약 (§9.1)', () => {
  it('배열 순서가 line_on 순서다 — 프로시저가 순서대로 1부터 재부여한다', () => {
    const l = ledger({
      lines: [line(DebitCredit.Debit, 100, {}, 'A'), line(DebitCredit.Credit, 100, {}, 'B')],
    });
    const parsed = JSON.parse(l.linesToJson()) as Array<Record<string, unknown>>;

    expect(parsed.map((r) => r.gl_id)).toEqual(['A', 'B']);
  });

  it('프로시저가 기대하는 컬럼명으로 직렬화한다 (Team_id·employee_Id 대소문자 포함)', () => {
    const l = ledger({ lines: [line(DebitCredit.Debit, 100, { teamId: 'T1', employeeId: 'E1', dueDate: '2026-03-31' })] });
    const [row] = JSON.parse(l.linesToJson()) as Array<Record<string, unknown>>;

    expect(row).toMatchObject({
      gl_id: '10100', DRCR: '1', amount: 100,
      Team_id: 'T1', employee_Id: 'E1', due_date: '2026-03-31',
    });
    expect(row.bank_id).toBeNull();
  });
});
