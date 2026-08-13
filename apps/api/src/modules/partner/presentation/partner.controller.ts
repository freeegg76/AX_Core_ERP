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
import { Role, SaveMode } from '@ax-bridge/shared-constants';
import { MinRole } from '../../../common/permission/roles.guard';
import { Scope } from '../../../common/tenant/scope.decorator';
import type { CompanyScope } from '../../../common/tenant/company-scope';
import { toPaymentTermStrategy } from '../domain/payment-term.strategy';
import { PartnerQuery } from '../infrastructure/partner.query';
import { PartnerRepository } from '../infrastructure/partner.repository';
import {
  DueDateQueryDto,
  PartnerListQueryDto,
  SaveClientDto,
  SaveTermDto,
  SaveVendorDto,
} from './partner.dto';

/* ═════════════════════ 지급/수금정책 (5) ═════════════════════ */

@ApiTags('PARTNER · 지급정책')
@Controller('partner/terms')
export class TermController {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly query: PartnerQuery,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '정책 목록/팝업 (active_only = 사용중만)' })
  list(@Scope() scope: CompanyScope, @Query() q: PartnerListQueryDto) {
    return this.query.terms(scope, q);
  }

  /**
   * 지급일 계산 미리보기.
   * Domain 전략과 프로시저가 같은 답을 내야 하므로 **둘 다 계산해 대조**한다.
   */
  @Get(':termId/due-date')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '지급일 계산 미리보기 (OUTPUT 파라미터 + 결과셋 동시 반환 프로시저)' })
  async dueDate(
    @Scope() scope: CompanyScope,
    @Param('termId') termId: string,
    @Query() q: DueDateQueryDto,
  ) {
    const fromProc = await this.repo.calcDueDate(scope, termId, q.base_date);
    return { term_id: termId, base_date: q.base_date, due_date: fromProc };
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '정책 등록 (EOM/CURM 정합 검증, 정책식 자동구성)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveTermDto) {
    if (!dto.term_id) throw new BadRequestException('term_id 가 필요합니다.');
    this.assertShape(dto);
    await this.repo.saveTerm(SaveMode.Insert, scope, {
      termId: dto.term_id,
      baseRule: dto.base_rule,
      fixedDay: dto.fixed_day,
      offsetDays: dto.offset_days,
      status: dto.status ?? 1,
    });
    return { term_id: dto.term_id };
  }

  @Put(':termId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '정책 수정 (기확정 due_date 재계산 없음 — FR-Term-07)' })
  async update(@Scope() scope: CompanyScope, @Param('termId') termId: string, @Body() dto: SaveTermDto) {
    this.assertShape(dto);
    await this.repo.saveTerm(SaveMode.Update, scope, {
      termId,
      baseRule: dto.base_rule,
      fixedDay: dto.fixed_day,
      offsetDays: dto.offset_days,
      status: dto.status ?? 1,
    });
    return { term_id: termId };
  }

  @Delete(':termId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '정책 삭제 (고객사·거래처 참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('termId') termId: string): Promise<void> {
    await this.repo.deleteTerm(scope, termId);
  }

  /**
   * EOM/CURM 정합을 Domain 전략 생성으로 검증한다.
   * DB `CK_term_shape` 와 프로시저에도 같은 규칙이 있지만, 지침 §29 에 따라
   * Domain 이 1차 권위를 갖고 사용자에게 먼저 명확한 메시지를 준다.
   */
  private assertShape(dto: SaveTermDto): void {
    try {
      toPaymentTermStrategy({
        baseRule: dto.base_rule,
        fixedDay: dto.fixed_day ?? null,
        offsetDays: dto.offset_days ?? 0,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}

/* ═════════════════════ 고객사 (5) ═════════════════════ */

@ApiTags('PARTNER · 고객사')
@Controller('partner/clients')
export class ClientController {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly query: PartnerQuery,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '고객사 목록/팝업' })
  list(@Scope() scope: CompanyScope, @Query() q: PartnerListQueryDto) {
    return this.query.clients(scope, q);
  }

  @Get(':clientId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '고객사 상세' })
  async get(@Scope() scope: CompanyScope, @Param('clientId') clientId: string) {
    const { rows } = await this.repo.getClient(scope, clientId);
    return rows[0] ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '고객사 등록 (수금정책·사업자번호 검증)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveClientDto) {
    if (!dto.client_id) throw new BadRequestException('client_id 가 필요합니다.');
    await this.save(SaveMode.Insert, scope, dto.client_id, dto);
    return { client_id: dto.client_id };
  }

  @Put(':clientId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '고객사 수정/상태변경' })
  async update(@Scope() scope: CompanyScope, @Param('clientId') clientId: string, @Body() dto: SaveClientDto) {
    await this.save(SaveMode.Update, scope, clientId, dto);
    return { client_id: clientId };
  }

  @Delete(':clientId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '고객사 삭제 (계약·전표·초기이월 참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('clientId') clientId: string): Promise<void> {
    await this.repo.deleteClient(scope, clientId);
  }

  private save(mode: SaveMode, scope: CompanyScope, clientId: string, dto: SaveClientDto) {
    const { client_id: _id, client_name, collecting_type, status, address, ...fields } = dto;
    return this.repo.saveClient(mode, scope, {
      clientId,
      clientName: client_name,
      collectingType: collecting_type,
      status: status ?? 1,
      address,
      fields,
    });
  }
}

/* ═════════════════════ 거래처 (5) ═════════════════════ */

@ApiTags('PARTNER · 거래처')
@Controller('partner/vendors')
export class VendorController {
  constructor(
    private readonly repo: PartnerRepository,
    private readonly query: PartnerQuery,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '거래처 목록/팝업' })
  list(@Scope() scope: CompanyScope, @Query() q: PartnerListQueryDto) {
    return this.query.vendors(scope, q);
  }

  @Get(':vendorId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '거래처 상세' })
  async get(@Scope() scope: CompanyScope, @Param('vendorId') vendorId: string) {
    const { rows } = await this.repo.getVendor(scope, vendorId);
    return rows[0] ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '거래처 등록' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveVendorDto) {
    if (!dto.vendor_id) throw new BadRequestException('vendor_id 가 필요합니다.');
    await this.save(SaveMode.Insert, scope, dto.vendor_id, dto);
    return { vendor_id: dto.vendor_id };
  }

  @Put(':vendorId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '거래처 수정/상태변경' })
  async update(@Scope() scope: CompanyScope, @Param('vendorId') vendorId: string, @Body() dto: SaveVendorDto) {
    await this.save(SaveMode.Update, scope, vendorId, dto);
    return { vendor_id: vendorId };
  }

  @Delete(':vendorId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '거래처 삭제 (전표·초기이월 참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('vendorId') vendorId: string): Promise<void> {
    await this.repo.deleteVendor(scope, vendorId);
  }

  private save(mode: SaveMode, scope: CompanyScope, vendorId: string, dto: SaveVendorDto) {
    const { vendor_id: _id, vendor_name, payment_type, status, address, ...fields } = dto;
    return this.repo.saveVendor(mode, scope, {
      vendorId,
      vendorName: vendor_name,
      paymentType: payment_type,
      status: status ?? 1,
      address,
      fields,
    });
  }
}
