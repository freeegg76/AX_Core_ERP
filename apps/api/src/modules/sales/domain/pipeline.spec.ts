import { PipelineStage, PipelineType } from '@ax-bridge/shared-constants';
import { Pipeline } from './pipeline';

const restore = (stage: PipelineStage, clientName: string | null = 'ACME') =>
  Pipeline.restore({
    pipelineId: 'P001',
    pipelineType: PipelineType.Agency,
    stage,
    clientName,
    employeeId: 'E001',
    note: null,
    closedDate: stage === PipelineStage.Closed || stage === PipelineStage.Canceled ? '2026-03-01' : null,
  });

describe('Pipeline.create — 신규 등록 (FR-Pipe-03)', () => {
  it('신규 파이프라인은 Lead 단계로 시작한다', () => {
    const p = Pipeline.create({ pipelineId: 'P002', pipelineType: PipelineType.Retail });

    expect(p.stage).toBe(PipelineStage.Lead);
    expect(p.isClosed).toBe(false);
  });

  it('선택 항목은 null 로 채운다', () => {
    const p = Pipeline.create({ pipelineId: 'P002', pipelineType: PipelineType.Retail });

    expect(p.clientName).toBeNull();
    expect(p.employeeId).toBeNull();
    expect(p.note).toBeNull();
  });
});

describe('Pipeline — 단계 전이 (FR-Pipe-07)', () => {
  it.each([
    ['qualify', PipelineStage.QualifiedLead],
    ['suggest', PipelineStage.Suggest],
    ['moveToMeeting', PipelineStage.Meeting],
    ['moveToNegotiation', PipelineStage.Nego],
  ] as const)('%s() 는 %s 로 전이한다', (method, expected) => {
    const p = restore(PipelineStage.Lead);
    p[method]();

    expect(p.stage).toBe(expected);
  });

  it('단계는 되돌릴 수 있다 — 순방향만 허용하는 규칙은 없다', () => {
    const p = restore(PipelineStage.Nego);
    p.qualify();

    expect(p.stage).toBe(PipelineStage.QualifiedLead);
  });
});

describe('Pipeline.close — 수주 (FR-Pipe-06/07)', () => {
  it('고객사가 있으면 수주 처리된다', () => {
    const p = restore(PipelineStage.Nego);
    p.close();

    expect(p.stage).toBe(PipelineStage.Closed);
    expect(p.isClosed).toBe(true);
  });

  it('고객사가 없으면 수주할 수 없다 — 계약 연결 대상이 없기 때문이다', () => {
    expect(() => restore(PipelineStage.Nego, null).close())
      .toThrow('고객사가 지정되지 않아 수주 처리할 수 없습니다.');
  });

  it('이미 종료된 파이프라인은 다시 수주할 수 없다', () => {
    expect(() => restore(PipelineStage.Closed).close()).toThrow('이미 종료된 파이프라인입니다.');
  });

  it('취소된 파이프라인도 종료 상태다', () => {
    expect(() => restore(PipelineStage.Canceled).close()).toThrow('이미 종료된 파이프라인입니다.');
  });
});

describe('Pipeline.cancel — 취소', () => {
  it('고객사 없이도 취소할 수 있다 — 수주와 달리 대상이 필요 없다', () => {
    const p = restore(PipelineStage.Lead, null);
    p.cancel();

    expect(p.stage).toBe(PipelineStage.Canceled);
  });

  it('이미 종료된 파이프라인은 취소할 수 없다', () => {
    expect(() => restore(PipelineStage.Canceled).cancel()).toThrow('이미 종료된 파이프라인입니다.');
  });
});

describe('Pipeline.reopen — 재오픈', () => {
  it('종료된 파이프라인은 Nego 로 재오픈한다', () => {
    const p = restore(PipelineStage.Closed);
    p.reopen();

    expect(p.stage).toBe(PipelineStage.Nego);
    expect(p.isClosed).toBe(false);
  });

  it('종료되지 않은 파이프라인은 재오픈할 수 없다', () => {
    expect(() => restore(PipelineStage.Meeting).reopen())
      .toThrow('종료되지 않은 파이프라인은 재오픈할 수 없습니다.');
  });

  it('종료 상태에서 단계 이동을 직접 시도하면 재오픈을 안내한다', () => {
    expect(() => restore(PipelineStage.Closed).moveToMeeting())
      .toThrow('종료된 파이프라인은 재오픈 후에만 단계를 변경할 수 있습니다.');
  });
});

describe('Pipeline.changeStage — 화면 드롭다운 경로', () => {
  it('Closed 선택은 close() 규칙을 그대로 적용한다', () => {
    expect(() => restore(PipelineStage.Nego, null).changeStage(PipelineStage.Closed))
      .toThrow('고객사가 지정되지 않아 수주 처리할 수 없습니다.');
  });

  it('Canceled 선택은 cancel() 로 위임한다', () => {
    const p = restore(PipelineStage.Lead);
    p.changeStage(PipelineStage.Canceled);

    expect(p.stage).toBe(PipelineStage.Canceled);
  });

  it('종료 상태에서 진행 단계를 고르면 그 단계로 재오픈한다', () => {
    const p = restore(PipelineStage.Closed);
    p.changeStage(PipelineStage.Meeting);

    expect(p.stage).toBe(PipelineStage.Meeting);
    expect(p.isClosed).toBe(false);
  });

  it('종료 상태에서 다른 종료 단계로는 바꿀 수 없다', () => {
    expect(() => restore(PipelineStage.Closed).changeStage(PipelineStage.Canceled))
      .toThrow('이미 종료된 파이프라인입니다.');
  });
});

describe('Pipeline.toSnapshot — 영속화 계약', () => {
  it('closed_date 는 Entity 가 만들지 않는다 — 트리거 trg_sales_pipeline_audit 소관', () => {
    const p = restore(PipelineStage.Nego);
    p.close();

    // stage 는 바뀌었지만 closedDate 는 복원 당시 값 그대로다.
    expect(p.toSnapshot().stage).toBe(PipelineStage.Closed);
    expect(p.toSnapshot().closedDate).toBeNull();
  });

  it('changeDetails 로 바꾼 값이 스냅샷에 반영된다', () => {
    const p = restore(PipelineStage.Lead);
    p.changeDetails({ type: PipelineType.Marketing, clientName: 'NEWCO', note: '메모' });

    expect(p.toSnapshot()).toMatchObject({
      pipelineType: PipelineType.Marketing, clientName: 'NEWCO', note: '메모',
    });
  });

  it('changeDetails 는 undefined 인 항목을 건드리지 않는다', () => {
    const p = restore(PipelineStage.Lead);
    p.changeDetails({ note: '메모' });

    expect(p.clientName).toBe('ACME');
    expect(p.employeeId).toBe('E001');
  });

  it('changeDetails 는 null 을 명시하면 지운다', () => {
    const p = restore(PipelineStage.Lead);
    p.changeDetails({ employeeId: null });

    expect(p.employeeId).toBeNull();
  });
});
