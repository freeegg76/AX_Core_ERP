import { CLOSING_STAGES, PipelineStage, PipelineType } from '@ax-bridge/shared-constants';

export interface PipelineSnapshot {
  pipelineId: string;
  pipelineType: PipelineType;
  stage: PipelineStage;
  clientName: string | null;
  employeeId: string | null;
  note: string | null;
  closedDate: string | null;
}

/**
 * Pipeline Entity (지침 §5 — 단순 속성 대입 금지).
 *
 * `pipeline.stage = '5'` 같은 대입을 금지하고 의미 있는 메서드로만 전이한다.
 * 내부에서 전이 가능성을 검증하므로 잘못된 흐름이 DB 까지 내려가지 않는다.
 *
 * ⚠ 이 메서드들은 **별도 엔드포인트가 아니다** (설계서 §11.3).
 * stage 전환은 모두 `PUT /sales/pipelines/{pipelineId}` → `usp_sales_pipeline_save(U)`
 * 로 영속화되고, `adjusted_date`/`closed_date` 는 트리거 `trg_sales_pipeline_audit`
 * 가 관리한다 — 애플리케이션이 그 두 컬럼을 직접 쓰지 않는다.
 */
export class Pipeline {
  private constructor(
    readonly pipelineId: string,
    private _type: PipelineType,
    private _stage: PipelineStage,
    private _clientName: string | null,
    private _employeeId: string | null,
    private _note: string | null,
    private readonly _closedDate: string | null,
  ) {}

  static restore(s: PipelineSnapshot): Pipeline {
    return new Pipeline(
      s.pipelineId, s.pipelineType, s.stage,
      s.clientName, s.employeeId, s.note, s.closedDate,
    );
  }

  static create(p: {
    pipelineId: string;
    pipelineType: PipelineType;
    clientName?: string | null;
    employeeId?: string | null;
    note?: string | null;
  }): Pipeline {
    return new Pipeline(
      p.pipelineId, p.pipelineType, PipelineStage.Lead,
      p.clientName ?? null, p.employeeId ?? null, p.note ?? null, null,
    );
  }

  get stage(): PipelineStage { return this._stage; }
  get type(): PipelineType { return this._type; }
  get clientName(): string | null { return this._clientName; }
  get employeeId(): string | null { return this._employeeId; }
  get note(): string | null { return this._note; }
  get isClosed(): boolean { return CLOSING_STAGES.includes(this._stage); }

  /* ── 의미 있는 전이 (FR-Pipe-07) ─────────────────────────────────────── */

  qualify(): void { this.moveTo(PipelineStage.QualifiedLead); }
  suggest(): void { this.moveTo(PipelineStage.Suggest); }
  moveToMeeting(): void { this.moveTo(PipelineStage.Meeting); }
  moveToNegotiation(): void { this.moveTo(PipelineStage.Nego); }

  /** 수주 — 트리거가 closed_date 를 기록한다. */
  close(): void {
    if (this.isClosed) throw new Error('이미 종료된 파이프라인입니다.');
    if (!this._clientName) throw new Error('고객사가 지정되지 않아 수주 처리할 수 없습니다.');
    this._stage = PipelineStage.Closed;
  }

  /** 취소 — 트리거가 closed_date 를 기록한다. */
  cancel(): void {
    if (this.isClosed) throw new Error('이미 종료된 파이프라인입니다.');
    this._stage = PipelineStage.Canceled;
  }

  /** 재오픈 — 트리거가 closed_date 를 NULL 로 해제한다. */
  reopen(): void {
    if (!this.isClosed) throw new Error('종료되지 않은 파이프라인은 재오픈할 수 없습니다.');
    this._stage = PipelineStage.Nego;
  }

  /** 임의 stage 로 이동 — 화면의 드롭다운 변경을 받는 경로. */
  changeStage(next: PipelineStage): void {
    if (next === PipelineStage.Closed) return this.close();
    if (next === PipelineStage.Canceled) return this.cancel();
    if (this.isClosed) return this.reopenTo(next);
    this.moveTo(next);
  }

  changeDetails(p: { type?: PipelineType; clientName?: string | null; employeeId?: string | null; note?: string | null }): void {
    if (p.type !== undefined) this._type = p.type;
    if (p.clientName !== undefined) this._clientName = p.clientName;
    if (p.employeeId !== undefined) this._employeeId = p.employeeId;
    if (p.note !== undefined) this._note = p.note;
  }

  private moveTo(next: PipelineStage): void {
    if (this.isClosed) {
      throw new Error('종료된 파이프라인은 재오픈 후에만 단계를 변경할 수 있습니다.');
    }
    this._stage = next;
  }

  private reopenTo(next: PipelineStage): void {
    if (CLOSING_STAGES.includes(next)) throw new Error('이미 종료된 파이프라인입니다.');
    this._stage = next;
  }

  toSnapshot(): PipelineSnapshot {
    return {
      pipelineId: this.pipelineId,
      pipelineType: this._type,
      stage: this._stage,
      clientName: this._clientName,
      employeeId: this._employeeId,
      note: this._note,
      closedDate: this._closedDate,
    };
  }
}
