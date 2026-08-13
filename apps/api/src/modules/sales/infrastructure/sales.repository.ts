import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { SaveMode } from '@ax-bridge/shared-constants';
import { escapeLike, NUMERIC_10_2 } from '../../../common/database/numeric';
import { StoredProcExecutor } from '../../../common/database/stored-proc.executor';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import type { Pipeline } from '../domain/pipeline';

/** SALES 쓰기 Repository — `usp_sales_*` 실행 (설계서 §10.1·§10.2). */
@Injectable()
export class SalesRepository {
  constructor(private readonly proc: StoredProcExecutor) {}

  /* ── sales_pipeline ────────────────────────────────────────────────────── */

  /**
   * Pipeline Aggregate 를 저장한다.
   * `adjusted_date`/`closed_date` 는 **전달하지 않는다** — 트리거가 관리한다.
   */
  savePipeline(mode: SaveMode, scope: CompanyScope, p: Pipeline) {
    const s = p.toSnapshot();
    return this.proc.exec('usp_sales_pipeline_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        pipeline_id: s.pipelineId,
        pipeline_type: s.pipelineType,
        client_name: s.clientName,
        stage: s.stage,
        employee_id: s.employeeId,
        note: s.note,
      },
    });
  }

  deletePipeline(scope: CompanyScope, pipelineId: string) {
    return this.proc.exec('usp_sales_pipeline_delete', {
      in: { ...scope.toProcInput(), pipeline_id: pipelineId },
    });
  }

  listPipelines(scope: CompanyScope, p: {
    pipelineId?: string | null;
    clientName?: string | null;
    pipelineType?: string | null;
    stage?: string | null;
    employeeId?: string | null;
    createdFrom?: string | null;
    createdTo?: string | null;
    closedFrom?: string | null;
    closedTo?: string | null;
    searchMode?: string | null;
  }) {
    return this.proc.exec('usp_sales_pipeline_list', {
      in: {
        ...scope.toProcInput(),
        pipeline_id: p.pipelineId ?? null,
        client_name: escapeLike(p.clientName),
        pipeline_type: p.pipelineType ?? null,
        stage: p.stage ?? null,
        employee_id: p.employeeId ?? null,
        created_from: p.createdFrom ?? null,
        created_to: p.createdTo ?? null,
        closed_from: p.closedFrom ?? null,
        closed_to: p.closedTo ?? null,
        search_mode: p.searchMode ?? null,
      },
    });
  }

  getPipeline(scope: CompanyScope, pipelineId: string) {
    return this.proc.exec('usp_sales_pipeline_get', {
      in: { ...scope.toProcInput(), pipeline_id: pipelineId },
    });
  }

  /** 계약 연결/해제 — contractId 가 null 이면 해제. 고객사명 일치를 프로시저가 검증한다. */
  linkContract(scope: CompanyScope, pipelineId: string, contractId: string | null) {
    return this.proc.exec('usp_sales_pipeline_link_contract', {
      in: { ...scope.toProcInput(), pipeline_id: pipelineId, contract_id: contractId },
    });
  }

  /* ── sales_pipeline_detail (액티비티) ──────────────────────────────────── */

  /**
   * 액티비티 저장.
   *
   * `@activity_id` 는 **양방향 InOut** 이다 — NULL 이면 프로시저가 채번하고
   * 그 값을 OUTPUT 으로 돌려준다(설계서 §10.2, D1). 09 에서 채번 경합 시
   * 일련번호를 덧붙여 재시도하도록 보강했다(§9.12).
   */
  async saveActivity(mode: SaveMode, scope: CompanyScope, pipelineId: string, p: {
    activityId?: string | null;
    type: string;
    content?: string | null;
    incharge?: string | null;
    attached?: string | null;
    createdDate?: string | null;
  }): Promise<string> {
    const { output } = await this.proc.exec('usp_sales_activity_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        pipeline_id: pipelineId,
        activity_id: p.activityId ?? null,
        type: p.type,
        content: p.content ?? null,
        incharge: p.incharge ?? null,
        attached: p.attached ?? null,
        created_date: p.createdDate ?? null,
      },
      out: { activity_id: sql.VarChar(20) },
    });
    return String(output.activity_id ?? p.activityId ?? '');
  }

  deleteActivity(scope: CompanyScope, pipelineId: string, activityId: string) {
    return this.proc.exec('usp_sales_activity_delete', {
      in: { ...scope.toProcInput(), pipeline_id: pipelineId, activity_id: activityId },
    });
  }

  listActivities(scope: CompanyScope, pipelineId: string) {
    return this.proc.exec('usp_sales_activity_list', {
      in: { ...scope.toProcInput(), pipeline_id: pipelineId },
    });
  }

  /* ── sales_contract ────────────────────────────────────────────────────── */

  saveContract(mode: SaveMode, scope: CompanyScope, p: {
    clientId: string;
    contractId: string;
    contractType: string;
    pipelineId?: string | null;
    startDate: string;
    endDate: string;
    status: string;
    contractAmount?: number | null;
    closedDate?: string | null;
  }) {
    return this.proc.exec('usp_sales_contract_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        client_id: p.clientId,
        contract_id: p.contractId,
        contract_type: p.contractType,
        pipeline_id: p.pipelineId ?? null,
        start_date: p.startDate,
        end_date: p.endDate,
        status: p.status,
        contract_amount: p.contractAmount ?? null,
        closed_date: p.closedDate ?? null,
      },
    });
  }

  deleteContract(scope: CompanyScope, contractId: string, contractType: string) {
    return this.proc.exec('usp_sales_contract_delete', {
      in: { ...scope.toProcInput(), contract_id: contractId, contract_type: contractType },
    });
  }

  listContracts(scope: CompanyScope, p: {
    clientId?: string | null;
    contractId?: string | null;
    contractType?: string | null;
    status?: string | null;
    startFrom?: string | null;
    endTo?: string | null;
  }) {
    return this.proc.exec('usp_sales_contract_list', {
      in: {
        ...scope.toProcInput(),
        client_id: p.clientId ?? null,
        // ⚠ 이 프로시저는 @search_mode 를 지원하지 않고 항상 LIKE '%…%' 다(§12.3).
        contract_id: escapeLike(p.contractId),
        contract_type: p.contractType ?? null,
        status: p.status ?? null,
        start_from: p.startFrom ?? null,
        end_to: p.endTo ?? null,
      },
    });
  }

  /**
   * 전표 연결/해제 (FR-Contract-08).
   *
   * 둘 다 입력 or 둘 다 NULL 이어야 한다. 원본 `04` 의 이 검증문은
   * `(expr IS NULL) <> (expr IS NULL)` 로 되어 있어 T-SQL 구문 오류였고
   * 설계서 C.1-2 에 따라 원본을 수정했다.
   */
  linkLedger(scope: CompanyScope, contractId: string, contractType: string, p: {
    ledgerDate: string | null;
    ledgerNo: number | null;
  }) {
    return this.proc.exec('usp_sales_contract_link_ledger', {
      in: {
        ...scope.toProcInput(),
        contract_id: contractId,
        contract_type: contractType,
        ledger_date: p.ledgerDate,
        ledger_no: p.ledgerNo,
      },
      out: {},
    });
  }
}

export const SALES_LEDGER_NO_TYPE = NUMERIC_10_2;
