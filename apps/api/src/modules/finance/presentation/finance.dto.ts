import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DebitCredit,
  GlDetail,
  GlType,
  LedgerType,
  PAGE_SIZE_MAX,
  SearchMode,
  VatGl,
} from '@ax-bridge/shared-constants';

const toBool = () =>
  Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true' || value === '1'));

class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiPropertyOptional({ default: 50, maximum: PAGE_SIZE_MAX })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(PAGE_SIZE_MAX) size?: number;

  @ApiPropertyOptional({ enum: SearchMode })
  @IsOptional() @IsIn([SearchMode.Exact, SearchMode.Like]) search_mode?: SearchMode;

  @IsOptional() @toBool() @IsBoolean() active_only?: boolean;
}

/* ═══════════ 계정과목 ═══════════ */

export class GlListQueryDto extends PageDto {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @IsIn(Object.values(GlType)) gl_type?: GlType;
  @IsOptional() @IsString() @MaxLength(50) gl_category1?: string;
  @IsOptional() @IsString() @MaxLength(50) gl_category2?: string;
  @IsOptional() @IsIn(Object.values(VatGl)) vat_gl?: VatGl;
  /** finance_GL 은 **활성 = 1** (§9.9) */
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;
}

/** Layer3 사용플래그 12종 — 실제 값이 아니라 사용여부다(FR-GL-06) */
export class GlFlagsDto {
  @IsOptional() @toBool() @IsBoolean() bank?: boolean;
  @IsOptional() @toBool() @IsBoolean() team?: boolean;
  @IsOptional() @toBool() @IsBoolean() pod?: boolean;
  @IsOptional() @toBool() @IsBoolean() employee?: boolean;
  @IsOptional() @toBool() @IsBoolean() client?: boolean;
  @IsOptional() @toBool() @IsBoolean() vendor?: boolean;
  @IsOptional() @toBool() @IsBoolean() dim1?: boolean;
  @IsOptional() @toBool() @IsBoolean() dim2?: boolean;
  @IsOptional() @toBool() @IsBoolean() dim3?: boolean;
  @IsOptional() @toBool() @IsBoolean() dim4?: boolean;
  @IsOptional() @toBool() @IsBoolean() dim5?: boolean;
  @IsOptional() @toBool() @IsBoolean() due?: boolean;
}

export class SaveGlDto {
  @IsOptional() @IsString() @MaxLength(10) gl_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(100) gl_name!: string;

  @IsIn(Object.values(GlType)) gl_type!: GlType;

  @IsOptional() @IsString() @MaxLength(50) gl_category1?: string;
  @IsOptional() @IsString() @MaxLength(50) gl_category2?: string;
  @IsOptional() @IsIn(Object.values(VatGl)) vat_gl?: VatGl;

  @IsOptional() @IsIn(Object.values(GlDetail)) gl_detail?: GlDetail;

  /** 차감계정 — 자기참조. gl_detail=1 일 때만 지정하고 자기 자신은 불가(§7.4) */
  @IsOptional() @IsString() @MaxLength(10) contra_gl?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;

  @IsOptional() @ValidateNested() @Type(() => GlFlagsDto) flags?: GlFlagsDto;
}

/* ═══════════ 관리항목 ═══════════ */

export class DimensionListQueryDto extends PageDto {
  @IsOptional() @IsString() @MaxLength(100) keyword?: string;
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;
}

export class SaveDimensionDto {
  @IsOptional() @IsString() @MaxLength(10) dimension_id?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) dimension_name!: string;
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;
}

export class SaveDimensionDetailDto {
  @IsString() @IsNotEmpty() @MaxLength(200) dimension_value!: string;
}

/* ═══════════ 은행/카드 ═══════════ */

export class BankListQueryDto extends PageDto {
  @IsOptional() @IsString() @MaxLength(50) keyword?: string;
  /** finance_bank_account 는 **활성 = 0** (§9.9) */
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;
}

export class SaveBankDto {
  @IsOptional() @IsString() @MaxLength(10) bank_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(50) bank_name!: string;

  /** 계좌 XOR 카드 — 정확히 하나만 (FR-Bank-05, 09 의 CK_bank_one) */
  @IsOptional() @ValidateIf((o) => !o.card_number) @IsString() @MaxLength(50)
  bank_account?: string;

  @IsOptional() @ValidateIf((o) => !o.bank_account) @IsString() @MaxLength(50)
  card_number?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;
}

/* ═══════════ 초기이월 ═══════════ */

export class OpenBalanceQueryDto {
  @IsString() @IsNotEmpty() @MaxLength(10) company_year_id!: string;
  @IsOptional() @IsString() @MaxLength(100) gl_keyword?: string;
  @IsOptional() @IsIn(Object.values(DebitCredit)) DRCR?: DebitCredit;
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) closed?: 0 | 1;
}

export class OpenBalanceRowDto {
  @IsString() @IsNotEmpty() @MaxLength(10) gl_id!: string;
  @IsIn(Object.values(DebitCredit)) DRCR!: DebitCredit;
  @IsOptional() @IsString() @MaxLength(10) bank_id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) client_id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) vendor_id?: string | null;

  /**
   * ⚠ **0 을 넣으면 저장이 아니라 행 삭제**다 —
   * 프로시저가 `amount > 0` 행만 INSERT 한다(설계서 §9.4).
   */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  amount!: number;
}

export class SaveOpenBalancesDto {
  @IsString() @IsNotEmpty() @MaxLength(10) company_year_id!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => OpenBalanceRowDto)
  rows!: OpenBalanceRowDto[];
}

export class YearActionDto {
  @IsString() @IsNotEmpty() @MaxLength(10) company_year_id!: string;
}

/* ═══════════ 전표 ═══════════ */

export class LedgerListQueryDto extends PageDto {
  @IsOptional() @IsISO8601() date_from?: string;
  @IsOptional() @IsISO8601() date_to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) ledger_no?: number;
  @IsOptional() @IsIn(Object.values(LedgerType)) ledger_type?: LedgerType;
  @IsOptional() @IsString() @MaxLength(10) employee_id?: string;
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) approval_status?: 0 | 1;
}

export class CreateLedgerDto {
  @IsISO8601() ledger_date!: string;
  @IsOptional() @IsString() @MaxLength(100) ledger_name?: string;
  @IsOptional() @IsIn(Object.values(LedgerType)) ledger_type?: LedgerType;
}

export class UpdateLedgerDto {
  @IsOptional() @IsString() @MaxLength(100) ledger_name?: string;
  @IsOptional() @IsIn(Object.values(LedgerType)) ledger_type?: LedgerType;
}

export class LedgerLineDto {
  @IsString() @IsNotEmpty() @MaxLength(10) gl_id!: string;
  @IsIn(Object.values(DebitCredit)) DRCR!: DebitCredit;

  /** 금액은 0보다 커야 한다 */
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01)
  amount!: number;

  /* Layer3 실제값 — 계정 플래그가 Y 인 항목만 채운다 */
  @IsOptional() @IsString() @MaxLength(10) bank_id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) Team_id?: string | null;
  @IsOptional() @IsString() @MaxLength(4) pod_id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) employee_Id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) client_id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) vendor_id?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dimension1?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dimension2?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dimension3?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dimension4?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dimension5?: string | null;
  @IsOptional() @IsISO8601() due_date?: string | null;
}

export class SaveLedgerLinesDto {
  /**
   * ⚠ **배열 순서가 `line_on` 이 된다.** 프로시저가 기존 라인을 전부 삭제하고
   * 이 순서대로 1부터 재부여하므로 항상 전체 집합을 보낸다(설계서 §9.1).
   */
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LedgerLineDto)
  lines!: LedgerLineDto[];
}

/** 계정 변경 시 Layer3 충돌 미리보기 (UC-Ledger-04 예외) */
export class PreviewAccountChangeDto {
  @ValidateNested() @Type(() => LedgerLineDto) current_line!: LedgerLineDto;
  @IsString() @IsNotEmpty() @MaxLength(10) next_gl_id!: string;
}

/* ═══════════ 마감관리 ═══════════ */

export class ClosingListQueryDto {
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) closing?: 0 | 1;
}
