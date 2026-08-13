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
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GlDetail, Role, SaveMode } from '@ax-bridge/shared-constants';
import { maskCardNumber, toInt } from '../../../common/database/numeric';
import { MinRole } from '../../../common/permission/roles.guard';
import { Scope } from '../../../common/tenant/scope.decorator';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import type { AuthUser } from '../../../common/auth/auth-user';
import { LedgerService } from '../application/ledger.service';
import { FinanceRepository } from '../infrastructure/finance.repository';
import type { GlFlags } from '../domain/ledger';
import {
  BankListQueryDto,
  ClosingListQueryDto,
  CreateLedgerDto,
  DimensionListQueryDto,
  GlListQueryDto,
  LedgerListQueryDto,
  OpenBalanceQueryDto,
  PreviewAccountChangeDto,
  SaveBankDto,
  SaveDimensionDetailDto,
  SaveDimensionDto,
  SaveGlDto,
  SaveLedgerLinesDto,
  SaveOpenBalancesDto,
  UpdateLedgerDto,
  YearActionDto,
} from './finance.dto';

function toFlags(dto: SaveGlDto): GlFlags {
  const f = dto.flags ?? {};
  return {
    bank: !!f.bank, team: !!f.team, pod: !!f.pod, employee: !!f.employee,
    client: !!f.client, vendor: !!f.vendor,
    dim1: !!f.dim1, dim2: !!f.dim2, dim3: !!f.dim3, dim4: !!f.dim4, dim5: !!f.dim5,
    due: !!f.due,
  };
}

/* ═════════════════════ 계정과목 (6) ═════════════════════ */

@ApiTags('FINANCE · 계정과목')
@Controller('finance/gl')
export class GlController {
  constructor(private readonly repo: FinanceRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '계정 목록 (Head: 코드·명) / 전표 계정 팝업(active_only)' })
  async list(@Scope() scope: CompanyScope, @Query() q: GlListQueryDto) {
    const { rows } = await this.repo.listGl(scope, {
      keyword: q.keyword, glType: q.gl_type,
      category1: q.gl_category1, category2: q.gl_category2, vatGl: q.vat_gl,
      status: q.status, searchMode: q.search_mode, activeOnly: q.active_only,
    });
    return { items: rows, page: 1, size: rows.length, total: rows.length };
  }

  @Get(':glId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '계정 상세 + Layer3 플래그 12종 + Slot1~5 관리항목명' })
  async get(@Scope() scope: CompanyScope, @Param('glId') glId: string) {
    const { rows } = await this.repo.getGl(scope, glId);
    return rows[0] ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '계정 등록 (플래그 12종, 차감계정 검증)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveGlDto) {
    if (!dto.gl_id) throw new BadRequestException('gl_id 가 필요합니다.');
    this.assertContraGl(dto, dto.gl_id);
    await this.repo.saveGl(SaveMode.Insert, scope, this.toSave(dto.gl_id, dto));
    return { gl_id: dto.gl_id };
  }

  @Put(':glId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '계정 수정 (gl_id 불가)' })
  async update(@Scope() scope: CompanyScope, @Param('glId') glId: string, @Body() dto: SaveGlDto) {
    this.assertContraGl(dto, glId);
    await this.repo.saveGl(SaveMode.Update, scope, this.toSave(glId, dto));
    return { gl_id: glId };
  }

  @Delete(':glId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '계정 삭제 (초기이월·전표 참조 시 409 → 미사용 전환 안내)' })
  async remove(@Scope() scope: CompanyScope, @Param('glId') glId: string): Promise<void> {
    await this.repo.deleteGl(scope, glId);
  }

  @Post('generate-standard')
  @MinRole(Role.Admin)
  @ApiOperation({
    summary: '표준 계정과목 일괄 재생성 (ADMIN)',
    description:
      '대상은 로그인 세션 회사로 고정된다(FR-GL-11). 전표가 1건이라도 있으면 50411 로 차단된다. ' +
      '기존 GL 전체 삭제 + seed 일괄 INSERT 를 단일 트랜잭션으로 처리한다.',
  })
  async generateStandard(@Scope() scope: CompanyScope) {
    const inserted = await this.repo.generateStandardGl(scope);
    return { inserted_count: inserted };
  }

  private toSave(glId: string, dto: SaveGlDto) {
    return {
      glId,
      glName: dto.gl_name,
      glType: dto.gl_type,
      glCategory1: dto.gl_category1,
      glCategory2: dto.gl_category2,
      vatGl: dto.vat_gl,
      glDetail: dto.gl_detail ?? GlDetail.Normal,
      contraGl: dto.contra_gl,
      status: dto.status ?? 1,
      flags: toFlags(dto),
    };
  }

  /**
   * 차감계정 자기참조 검증 (설계서 §7.4).
   * DDL 에 자기참조 FK 가 없어 전량 Application 검증 대상이다.
   */
  private assertContraGl(dto: SaveGlDto, glId: string): void {
    if (!dto.contra_gl) return;
    if (dto.contra_gl === glId) {
      throw new BadRequestException('차감계정에 자기 자신을 지정할 수 없습니다.');
    }
    if ((dto.gl_detail ?? GlDetail.Normal) !== GlDetail.Contra) {
      throw new BadRequestException('차감계정은 계정성격이 「차감항목」일 때만 지정할 수 있습니다.');
    }
  }
}

/* ═════════════════════ 관리항목 (7) ═════════════════════ */

@ApiTags('FINANCE · 관리항목')
@Controller('finance/dimensions')
export class DimensionController {
  constructor(private readonly repo: FinanceRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '관리항목 Head (Slot 포함, slot_no 순)' })
  async list(@Scope() scope: CompanyScope, @Query() q: DimensionListQueryDto) {
    const { rows } = await this.repo.listDimensions(scope, {
      keyword: q.keyword, status: q.status, searchMode: q.search_mode,
    });
    return { items: rows, page: 1, size: rows.length, total: rows.length };
  }

  @Get(':dimensionId/details')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '상세값 목록 / 전표 Slot 값 팝업' })
  async details(
    @Scope() scope: CompanyScope,
    @Param('dimensionId') dimensionId: string,
    @Query() q: DimensionListQueryDto,
  ) {
    const { rows } = await this.repo.listDimensionDetails(scope, dimensionId, {
      keyword: q.keyword, searchMode: q.search_mode,
    });
    return { items: rows.map((r: Record<string, unknown>) => ({ ...r, line_no: toInt(r.line_no) })) };
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '관리항목 등록 (회사당 최대 5개, Slot 순차부여 — 재정렬 금지)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveDimensionDto) {
    if (!dto.dimension_id) throw new BadRequestException('dimension_id 가 필요합니다.');
    await this.repo.saveDimension(SaveMode.Insert, scope, {
      dimensionId: dto.dimension_id, name: dto.dimension_name, status: dto.status ?? 1,
    });
    return { dimension_id: dto.dimension_id };
  }

  @Put(':dimensionId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '관리항목 수정 (명·상태만 — slot_no 불가)' })
  async update(
    @Scope() scope: CompanyScope,
    @Param('dimensionId') dimensionId: string,
    @Body() dto: SaveDimensionDto,
  ) {
    await this.repo.saveDimension(SaveMode.Update, scope, {
      dimensionId, name: dto.dimension_name, status: dto.status ?? 1,
    });
    return { dimension_id: dimensionId };
  }

  @Post(':dimensionId/details')
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '상세값 등록 (line_no 자동채번, 중복값 차단)' })
  async createDetail(
    @Scope() scope: CompanyScope,
    @Param('dimensionId') dimensionId: string,
    @Body() dto: SaveDimensionDetailDto,
  ) {
    const lineNo = await this.repo.saveDimensionDetail(scope, dimensionId, {
      value: dto.dimension_value,
    });
    return { dimension_id: dimensionId, line_no: lineNo };
  }

  @Put(':dimensionId/details/:lineNo')
  @MinRole(Role.Editor)
  @ApiOperation({
    summary: '상세값 수정',
    description:
      '⚠ 상세값 개별 DELETE 경로는 프로시저·API 모두 존재하지 않는다(설계서 §9.8). ' +
      '오타 정정은 이 수정 경로가 유일하다.',
  })
  async updateDetail(
    @Scope() scope: CompanyScope,
    @Param('dimensionId') dimensionId: string,
    @Param('lineNo') lineNo: string,
    @Body() dto: SaveDimensionDetailDto,
  ) {
    const n = await this.repo.saveDimensionDetail(scope, dimensionId, {
      lineNo: Number(lineNo), value: dto.dimension_value,
    });
    return { dimension_id: dimensionId, line_no: n };
  }

  @Delete(':dimensionId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '관리항목 삭제 (GL 플래그·전표 참조 시 409, Slot 보존)' })
  async remove(@Scope() scope: CompanyScope, @Param('dimensionId') dimensionId: string): Promise<void> {
    await this.repo.deleteDimension(scope, dimensionId);
  }
}

/* ═════════════════════ 은행/카드 (4) ═════════════════════ */

@ApiTags('FINANCE · 은행/카드')
@Controller('finance/bank-accounts')
export class BankController {
  constructor(private readonly repo: FinanceRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '은행/카드 목록 (카드번호 마스킹 — 원본은 어떤 응답에도 없다)' })
  async list(@Scope() scope: CompanyScope, @Query() q: BankListQueryDto) {
    const { rows } = await this.repo.listBanks(scope, {
      keyword: q.keyword, status: q.status, searchMode: q.search_mode, activeOnly: q.active_only,
    });
    // 프로시저가 card_number_masked 를 주지만, 이중 방어로 원본 필드를 제거한다.
    const items = (rows as Array<Record<string, unknown>>).map((r) => {
      const { card_number, ...rest } = r;
      return {
        ...rest,
        card_number_masked: r.card_number_masked ?? maskCardNumber(card_number as string | null),
      };
    });
    return { items, page: 1, size: items.length, total: items.length };
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '은행계좌 또는 카드 등록 (계좌 XOR 카드 — 정확히 하나)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveBankDto) {
    if (!dto.bank_id) throw new BadRequestException('bank_id 가 필요합니다.');
    this.assertXor(dto);
    await this.repo.saveBank(SaveMode.Insert, scope, {
      bankId: dto.bank_id, bankName: dto.bank_name,
      bankAccount: dto.bank_account, cardNumber: dto.card_number,
      status: dto.status ?? 0,
    });
    return { bank_id: dto.bank_id };
  }

  @Put(':bankId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '은행/카드 수정 (bank_id 불가)' })
  async update(@Scope() scope: CompanyScope, @Param('bankId') bankId: string, @Body() dto: SaveBankDto) {
    this.assertXor(dto);
    await this.repo.saveBank(SaveMode.Update, scope, {
      bankId, bankName: dto.bank_name,
      bankAccount: dto.bank_account, cardNumber: dto.card_number,
      status: dto.status ?? 0,
    });
    return { bank_id: bankId };
  }

  @Delete(':bankId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '은행/카드 삭제 (전표·초기이월 참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('bankId') bankId: string): Promise<void> {
    await this.repo.deleteBank(scope, bankId);
  }

  /** 09 의 CK_bank_one 과 같은 규칙 — 정확히 하나만 (FR-Bank-05) */
  private assertXor(dto: SaveBankDto): void {
    const hasAccount = !!dto.bank_account?.trim();
    const hasCard = !!dto.card_number?.trim();
    if (hasAccount && hasCard) {
      throw new BadRequestException('계좌번호와 카드번호는 동시에 입력할 수 없습니다.');
    }
    if (!hasAccount && !hasCard) {
      throw new BadRequestException('계좌번호 또는 카드번호 중 하나는 반드시 입력해야 합니다.');
    }
  }
}

/* ═════════════════════ 초기이월 (4) ═════════════════════ */

@ApiTags('FINANCE · 초기이월')
@Controller('finance/open-balances')
export class OpenBalanceController {
  constructor(private readonly repo: FinanceRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({
    summary: '기수별 초기이월 + 차/대변 합계 (결과셋 2개 프로시저)',
    description:
      'D7 — 연도마감 자동생성분은 음수가 될 수 있다. 합계는 부호를 살려 계산하고 화면은 음수를 명시 표시한다.',
  })
  async list(@Scope() scope: CompanyScope, @Query() q: OpenBalanceQueryDto) {
    const { rows, totals } = await this.repo.listOpenBalances(scope, q.company_year_id, {
      glKeyword: q.gl_keyword, drcr: q.DRCR, closed: q.closed,
    });
    return { items: rows, totals };
  }

  @Put()
  @MinRole(Role.Editor)
  @ApiOperation({
    summary: '초기이월 일괄 저장 (미확정 행만)',
    description:
      '⚠ amount 0 은 저장이 아니라 **행 삭제**다 — 프로시저가 amount > 0 행만 INSERT 한다(§9.4). ' +
      'closed=1 확정분과 마감 자동생성분은 건드리지 않는다.',
  })
  async save(@Scope() scope: CompanyScope, @Body() dto: SaveOpenBalancesDto) {
    await this.repo.saveOpenBalances(
      scope,
      dto.company_year_id,
      dto.rows.map((r) => ({
        gl_id: r.gl_id, DRCR: r.DRCR,
        bank_id: r.bank_id ?? null, client_id: r.client_id ?? null, vendor_id: r.vendor_id ?? null,
        amount: r.amount,
      })),
    );
    return { company_year_id: dto.company_year_id, saved: dto.rows.filter((r) => r.amount > 0).length };
  }

  @Post('close')
  @MinRole(Role.Approver)
  @HttpCode(204)
  @ApiOperation({ summary: '초기이월 확정 (APPROVER) — 차대 균형 불일치 시 50441' })
  async close(@Scope() scope: CompanyScope, @Body() dto: YearActionDto): Promise<void> {
    await this.repo.closeOpenBalances(scope, dto.company_year_id);
  }

  @Post('reopen')
  @MinRole(Role.Admin)
  @HttpCode(204)
  @ApiOperation({
    summary: '초기이월 확정해제 (ADMIN)',
    description: '회계마감 연도 또는 연도마감 자동생성분이면 50523/50524 로 거부된다. 연도 회계마감 해제와는 별개 기능이다.',
  })
  async reopen(@Scope() scope: CompanyScope, @Body() dto: YearActionDto): Promise<void> {
    await this.repo.reopenOpenBalances(scope, dto.company_year_id);
  }
}

/* ═════════════════════ 전표 (7 + 미리보기 1) ═════════════════════ */

@ApiTags('FINANCE · 전표')
@Controller('finance/ledgers')
export class LedgerController {
  constructor(
    private readonly repo: FinanceRepository,
    private readonly service: LedgerService,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '전표 헤더 목록 (Layer1)' })
  async list(@Scope() scope: CompanyScope, @Query() q: LedgerListQueryDto) {
    const { rows } = await this.repo.listLedgers(scope, {
      dateFrom: q.date_from, dateTo: q.date_to, ledgerNo: q.ledger_no,
      ledgerType: q.ledger_type, employeeId: q.employee_id, approvalStatus: q.approval_status,
    });
    const items = (rows as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      ledger_no: toInt(r.ledger_no),
    }));
    return { items, page: 1, size: items.length, total: items.length };
  }

  @Post('preview-account-change')
  @MinRole(Role.Editor)
  @ApiOperation({
    summary: '계정 변경 시 Layer3 충돌 미리보기 (UC-Ledger-04 예외)',
    description:
      '플래그가 Y→N 이 되어 버려야 하는 값 목록을 돌려준다. 값을 자동으로 지우지 않으므로 ' +
      '화면이 사용자 확인을 받은 뒤 정리된 라인으로 저장해야 한다.',
  })
  previewAccountChange(@Scope() scope: CompanyScope, @Body() dto: PreviewAccountChangeDto) {
    return this.service.previewAccountChange(scope, {
      currentLine: dto.current_line as never,
      nextGlId: dto.next_gl_id,
    });
  }

  @Get(':ledgerDate/:ledgerNo')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '전표 상세 — 헤더 + 라인 + Layer3 값 + 계정 플래그 + 차대합계' })
  detail(
    @Scope() scope: CompanyScope,
    @Param('ledgerDate') ledgerDate: string,
    @Param('ledgerNo') ledgerNo: string,
  ) {
    return this.service.detail(scope, ledgerDate, Number(ledgerNo));
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '전표 Head 등록 (ledger_no 자동채번, 승인상태 N). 마감연도 409' })
  async create(
    @Scope() scope: CompanyScope,
    @Req() req: Request & { user: AuthUser },
    @Body() dto: CreateLedgerDto,
  ) {
    const ledgerNo = await this.service.createHead(scope, {
      ledgerDate: dto.ledger_date,
      ledgerName: dto.ledger_name,
      ledgerType: dto.ledger_type,
      employeeId: req.user.employeeId,
    });
    return { ledger_date: dto.ledger_date, ledger_no: ledgerNo };
  }

  @Put(':ledgerDate/:ledgerNo')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '전표 Head 수정 (미승인만). 마감연도 409' })
  async update(
    @Scope() scope: CompanyScope,
    @Req() req: Request & { user: AuthUser },
    @Param('ledgerDate') ledgerDate: string,
    @Param('ledgerNo') ledgerNo: string,
    @Body() dto: UpdateLedgerDto,
  ) {
    await this.service.updateHead(scope, ledgerDate, Number(ledgerNo), {
      ledgerName: dto.ledger_name,
      ledgerType: dto.ledger_type,
      employeeId: req.user.employeeId,
    });
    return { ledger_date: ledgerDate, ledger_no: Number(ledgerNo) };
  }

  @Put(':ledgerDate/:ledgerNo/lines')
  @MinRole(Role.Editor)
  @ApiOperation({
    summary: '전표 라인 일괄 저장 (플래그·Slot·bank·due_date 검증)',
    description:
      '⚠ 배열 순서가 line_on 이 된다. 기존 라인을 전부 삭제하고 순서대로 1부터 재부여하므로 ' +
      '부분 저장은 불가능하고 항상 전체 집합을 보내야 한다(설계서 §9.1).',
  })
  async saveLines(
    @Scope() scope: CompanyScope,
    @Param('ledgerDate') ledgerDate: string,
    @Param('ledgerNo') ledgerNo: string,
    @Body() dto: SaveLedgerLinesDto,
  ) {
    await this.service.saveLines(scope, ledgerDate, Number(ledgerNo), dto.lines as never);
    return { ledger_date: ledgerDate, ledger_no: Number(ledgerNo), lines: dto.lines.length };
  }

  @Post(':ledgerDate/:ledgerNo/approve')
  @MinRole(Role.Approver)
  @HttpCode(204)
  @ApiOperation({ summary: '전표 승인 (APPROVER) — 차대 균형 검증. 마감연도 409' })
  async approve(
    @Scope() scope: CompanyScope,
    @Req() req: Request & { user: AuthUser },
    @Param('ledgerDate') ledgerDate: string,
    @Param('ledgerNo') ledgerNo: string,
  ): Promise<void> {
    await this.service.approve(scope, ledgerDate, Number(ledgerNo), req.user.employeeId);
  }

  @Delete(':ledgerDate/:ledgerNo')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '전표 삭제 (미승인만, 라인+헤더 동시). 마감연도 409' })
  async remove(
    @Scope() scope: CompanyScope,
    @Param('ledgerDate') ledgerDate: string,
    @Param('ledgerNo') ledgerNo: string,
  ): Promise<void> {
    await this.service.remove(scope, ledgerDate, Number(ledgerNo));
  }
}

/* ═════════════════════ 마감관리 (4) ═════════════════════ */

@ApiTags('FINANCE · 마감관리')
@Controller('finance/closings')
export class ClosingController {
  constructor(private readonly repo: FinanceRepository) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '기수·연도별 마감현황 (행 없으면 미마감, prior_year_open 포함)' })
  async list(@Scope() scope: CompanyScope, @Query() q: ClosingListQueryDto) {
    const { rows } = await this.repo.listClosings(scope, q.closing);
    const items = (rows as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      company_year: toInt(r.company_year),
      actual_year: toInt(r.actual_year),
    }));
    return { items, page: 1, size: items.length, total: items.length };
  }

  @Get(':yearId/status')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '특정 연도 마감 여부 — 전표/초기이월 화면 버튼 비활성 제어용' })
  async status(@Scope() scope: CompanyScope, @Param('yearId') yearId: string) {
    const { rows } = await this.repo.listClosings(scope, null);
    const row = (rows as Array<Record<string, unknown>>).find((r) => r.company_year_id === yearId);
    if (!row) throw new BadRequestException('대상 기수가 존재하지 않습니다.');
    return {
      company_year_id: yearId,
      actual_year: toInt(row.actual_year),
      closing: Number(row.closing) === 1,
      closing_date: row.closing_date ? String(row.closing_date).slice(0, 10) : null,
      prior_year_open: Number(row.prior_year_open) === 1,
    };
  }

  @Post(':yearId/execute')
  @MinRole(Role.Admin)
  @ApiOperation({
    summary: '연도 회계마감 실행 (ADMIN)',
    description:
      '선행검증 6종(50511~50516) → 조합별 잔액 산출 → 차년도 이월 INSERT(closed=Y, source=CLOSING) → ' +
      'closing=Y 를 단일 트랜잭션으로. 복수 연도는 **클라이언트가 actual_year 오름차순 순차 호출**한다.',
  })
  async execute(@Scope() scope: CompanyScope, @Param('yearId') yearId: string) {
    const r = await this.repo.executeClosing(scope, yearId);
    return {
      closed_year_id: r?.closed_year_id ?? yearId,
      next_year_id: r?.next_year_id ?? null,
      carried_rows: Number(r?.carried_rows ?? 0),
    };
  }

  @Post(':yearId/reopen')
  @MinRole(Role.Admin)
  @ApiOperation({
    summary: '연도 회계마감 해제 (ADMIN) — 09 신설, 설계서 §9.6',
    description:
      '선행검증 50531~50535. 해제는 **늦은 연도부터 내림차순 순차**여야 한다. ' +
      '차년도 source=CLOSING 이월만 회수하며, 수기 입력분이나 차년도 전표가 있으면 거부한다. ' +
      '⚠ 해제해도 기존 승인 전표는 편집할 수 없다 — 승인취소 기능이 원본에 없다(§9.6 한계).',
  })
  async reopen(@Scope() scope: CompanyScope, @Param('yearId') yearId: string) {
    const r = await this.repo.reopenClosing(scope, yearId);
    return {
      reopened_year_id: r?.reopened_year_id ?? yearId,
      next_year_id: r?.next_year_id ?? null,
      removed_rows: Number(r?.removed_rows ?? 0),
    };
  }
}
