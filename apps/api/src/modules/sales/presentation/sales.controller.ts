import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContractStatus, ContractType, Role, SaveMode } from '@ax-bridge/shared-constants';
import { MinRole } from '../../../common/permission/roles.guard';
import { Scope } from '../../../common/tenant/scope.decorator';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import { Pipeline, type PipelineSnapshot } from '../domain/pipeline';
import { SalesRepository } from '../infrastructure/sales.repository';
import {
  ContractListQueryDto,
  CreatePipelineDto,
  LinkContractDto,
  LinkLedgerDto,
  PipelineListQueryDto,
  SaveActivityDto,
  SaveContractDto,
  UpdatePipelineDto,
} from './sales.dto';

/* ═════════════════════ 파이프라인 (6) ═════════════════════ */

@ApiTags('SALES · 파이프라인')
@Controller('sales/pipelines')
export class PipelineController {
  constructor(private readonly repo: SalesRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '파이프라인 목록 (유형·스테이지·담당자·기간 필터)' })
  async list(@Scope() scope: CompanyScope, @Query() q: PipelineListQueryDto) {
    const { rows } = await this.repo.listPipelines(scope, {
      pipelineId: q.pipeline_id, clientName: q.client_name,
      pipelineType: q.pipeline_type, stage: q.stage, employeeId: q.employee_id,
      createdFrom: q.created_from, createdTo: q.created_to,
      closedFrom: q.closed_from, closedTo: q.closed_to,
      searchMode: q.search_mode,
    });
    return { items: rows, page: 1, size: rows.length, total: rows.length };
  }

  @Get(':pipelineId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '파이프라인 상세' })
  async get(@Scope() scope: CompanyScope, @Param('pipelineId') pipelineId: string) {
    const { rows } = await this.repo.getPipeline(scope, pipelineId);
    return rows[0] ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '파이프라인 등록 (created_date 자동, stage=Lead)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: CreatePipelineDto) {
    const p = Pipeline.create({
      pipelineId: dto.pipeline_id,
      pipelineType: dto.pipeline_type,
      clientName: dto.client_name,
      employeeId: dto.employee_id,
      note: dto.note,
    });
    await this.repo.savePipeline(SaveMode.Insert, scope, p);
    return { pipeline_id: dto.pipeline_id };
  }

  @Put(':pipelineId')
  @MinRole(Role.Editor)
  @ApiOperation({
    summary: '파이프라인 수정 — stage 전환도 이 엔드포인트로 한다',
    description:
      'stage 5/6 진입 시 closed_date, 재오픈 시 해제는 트리거 trg_sales_pipeline_audit 가 관리한다. ' +
      '지침 §23 예시의 /close·/cancel·/reopen 엔드포인트는 실제 API 명세에 없다(설계서 §11.3).',
  })
  async update(
    @Scope() scope: CompanyScope,
    @Param('pipelineId') pipelineId: string,
    @Body() dto: UpdatePipelineDto,
  ) {
    const { rows } = await this.repo.getPipeline(scope, pipelineId);
    const cur = rows[0] as Record<string, unknown> | undefined;
    if (!cur) throw new BadRequestException('대상 파이프라인이 존재하지 않습니다.');

    const snapshot: PipelineSnapshot = {
      pipelineId,
      pipelineType: String(cur.pipeline_type) as PipelineSnapshot['pipelineType'],
      stage: String(cur.stage) as PipelineSnapshot['stage'],
      clientName: (cur.client_name as string | null) ?? null,
      employeeId: (cur.employee_Id as string | null) ?? null,
      note: (cur.note as string | null) ?? null,
      closedDate: null,
    };

    const p = Pipeline.restore(snapshot);
    p.changeDetails({
      type: dto.pipeline_type,
      clientName: dto.client_name,
      employeeId: dto.employee_id,
      note: dto.note,
    });

    // 속성 대입이 아니라 의미 있는 전이를 거친다(지침 §5).
    if (dto.stage !== undefined && dto.stage !== p.stage) {
      try {
        p.changeStage(dto.stage);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }

    await this.repo.savePipeline(SaveMode.Update, scope, p);
    return { pipeline_id: pipelineId, stage: p.stage };
  }

  @Put(':pipelineId/contract')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '계약 연결/해제 (고객사명 일치 검증 — FR-Pipe-08)' })
  async linkContract(
    @Scope() scope: CompanyScope,
    @Param('pipelineId') pipelineId: string,
    @Body() dto: LinkContractDto,
  ) {
    await this.repo.linkContract(scope, pipelineId, dto.contract_id ?? null);
    return { pipeline_id: pipelineId, contract_id: dto.contract_id ?? null };
  }

  @Delete(':pipelineId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '파이프라인 삭제 (액티비티·계약 연결 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('pipelineId') pipelineId: string): Promise<void> {
    await this.repo.deletePipeline(scope, pipelineId);
  }
}

/* ═════════════════════ 액티비티 (4) ═════════════════════ */

@ApiTags('SALES · 액티비티')
@Controller('sales/pipelines/:pipelineId/activities')
export class ActivityController {
  constructor(private readonly repo: SalesRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '파이프라인별 활동 이력' })
  async list(@Scope() scope: CompanyScope, @Param('pipelineId') pipelineId: string) {
    const { rows } = await this.repo.listActivities(scope, pipelineId);
    return { items: rows, page: 1, size: rows.length, total: rows.length };
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '활동 등록 (activity_id 자동채번 — OUTPUT 파라미터)' })
  async create(
    @Scope() scope: CompanyScope,
    @Param('pipelineId') pipelineId: string,
    @Body() dto: SaveActivityDto,
  ) {
    const activityId = await this.repo.saveActivity(SaveMode.Insert, scope, pipelineId, {
      activityId: dto.activity_id, type: dto.type, content: dto.content,
      incharge: dto.incharge, attached: dto.attached, createdDate: dto.created_date,
    });
    return { pipeline_id: pipelineId, activity_id: activityId };
  }

  @Put(':activityId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '활동 수정 (식별키·상위 파이프라인 변경 불가)' })
  async update(
    @Scope() scope: CompanyScope,
    @Param('pipelineId') pipelineId: string,
    @Param('activityId') activityId: string,
    @Body() dto: SaveActivityDto,
  ) {
    await this.repo.saveActivity(SaveMode.Update, scope, pipelineId, {
      activityId, type: dto.type, content: dto.content,
      incharge: dto.incharge, attached: dto.attached,
    });
    return { pipeline_id: pipelineId, activity_id: activityId };
  }

  @Delete(':activityId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '활동 삭제 (파이프라인 유지)' })
  async remove(
    @Scope() scope: CompanyScope,
    @Param('pipelineId') pipelineId: string,
    @Param('activityId') activityId: string,
  ): Promise<void> {
    await this.repo.deleteActivity(scope, pipelineId, activityId);
  }
}

/* ═════════════════════ 계약 (5) ═════════════════════ */

@ApiTags('SALES · 계약')
@Controller('sales/contracts')
export class ContractController {
  constructor(private readonly repo: SalesRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '계약 목록 (⚠ 이 프로시저는 search_mode 미지원 — 항상 LIKE)' })
  async list(@Scope() scope: CompanyScope, @Query() q: ContractListQueryDto) {
    const { rows } = await this.repo.listContracts(scope, {
      clientId: q.client_id, contractId: q.contract_id, contractType: q.contract_type,
      status: q.status, startFrom: q.start_from, endTo: q.end_to,
    });
    return { items: rows, page: 1, size: rows.length, total: rows.length };
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '계약 등록 (기간·활성 고객사·파이프라인 고객사명 일치 검증)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveContractDto) {
    if (!dto.contract_id) throw new BadRequestException('contract_id 가 필요합니다.');
    const type = dto.contract_type ?? ContractType.Agency;
    this.assertPeriod(dto);
    await this.repo.saveContract(SaveMode.Insert, scope, {
      clientId: dto.client_id, contractId: dto.contract_id, contractType: type,
      pipelineId: dto.pipeline_id, startDate: dto.start_date, endDate: dto.end_date,
      status: dto.status ?? ContractStatus.Active,
      contractAmount: dto.contract_amount, closedDate: dto.closed_date,
    });
    return { contract_id: dto.contract_id, contract_type: type };
  }

  /** PK 가 (contract_id, contract_type) 복합키이므로 경로에 두 세그먼트가 필요하다. */
  @Put(':contractId/:contractType')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '계약 수정/상태·종료 처리 (식별키 불가)' })
  async update(
    @Scope() scope: CompanyScope,
    @Param('contractId') contractId: string,
    @Param('contractType') contractType: string,
    @Body() dto: SaveContractDto,
  ) {
    this.assertPeriod(dto);
    await this.repo.saveContract(SaveMode.Update, scope, {
      clientId: dto.client_id, contractId, contractType,
      pipelineId: dto.pipeline_id, startDate: dto.start_date, endDate: dto.end_date,
      status: dto.status ?? ContractStatus.Active,
      contractAmount: dto.contract_amount, closedDate: dto.closed_date,
    });
    return { contract_id: contractId, contract_type: contractType };
  }

  @Put(':contractId/:contractType/ledger')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '전표 연결/해제 (둘 다 입력 or 둘 다 null — FR-Contract-08)' })
  async linkLedger(
    @Scope() scope: CompanyScope,
    @Param('contractId') contractId: string,
    @Param('contractType') contractType: string,
    @Body() dto: LinkLedgerDto,
  ) {
    const d = dto.ledger_date ?? null;
    const n = dto.ledger_no ?? null;
    // 프로시저도 50341 로 막지만, 사용자에게 먼저 명확히 알린다.
    if ((d === null) !== (n === null)) {
      throw new BadRequestException('전표일자와 전표번호는 둘 다 입력하거나 둘 다 비워야 합니다.');
    }
    await this.repo.linkLedger(scope, contractId, contractType, { ledgerDate: d, ledgerNo: n });
    return { contract_id: contractId, contract_type: contractType, ledger_date: d, ledger_no: n };
  }

  @Delete(':contractId/:contractType')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '계약 삭제 (파이프라인·전표 연결 시 409)' })
  async remove(
    @Scope() scope: CompanyScope,
    @Param('contractId') contractId: string,
    @Param('contractType') contractType: string,
  ): Promise<void> {
    await this.repo.deleteContract(scope, contractId, contractType);
  }

  /** start_date <= end_date (CK_ct_dates 와 동일 규칙, FR-Contract-06) */
  private assertPeriod(dto: SaveContractDto): void {
    if (dto.start_date > dto.end_date) {
      throw new BadRequestException('계약 시작일은 종료일보다 늦을 수 없습니다.');
    }
  }
}
