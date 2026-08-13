import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentBaseRule, PAGE_SIZE_MAX, SearchMode } from '@ax-bridge/shared-constants';

const toBool = () =>
  Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true' || value === '1'));

export class PartnerListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: PAGE_SIZE_MAX })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(PAGE_SIZE_MAX)
  size?: number;

  @ApiPropertyOptional({ enum: SearchMode })
  @IsOptional() @IsIn([SearchMode.Exact, SearchMode.Like])
  search_mode?: SearchMode;

  @IsOptional() @IsString() @MaxLength(50)
  keyword?: string;

  /** partner_* 는 **활성 = 1** 이다(§9.9) */
  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;

  @IsOptional() @toBool() @IsBoolean()
  active_only?: boolean;
}

/* ── 지급/수금정책 ────────────────────────────────────────────────────────── */

export class SaveTermDto {
  @IsOptional() @IsString() @MaxLength(10)
  term_id?: string;

  @IsIn([PaymentBaseRule.EndOfMonth, PaymentBaseRule.CurrentMonth])
  base_rule!: PaymentBaseRule;

  /** CURM 전용 1~31. EOM 이면 반드시 미지정(CK_term_shape). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31)
  fixed_day?: number;

  /** EOM 전용. CURM 이면 0 이어야 한다. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(999)
  offset_days?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

export class DueDateQueryDto {
  @IsISO8601()
  base_date!: string;
}

/* ── 고객사 / 거래처 공통 부가필드 ────────────────────────────────────────── */

class PartnerCommonDto {
  @IsOptional() @IsString() @MaxLength(20) vat_id?: string;
  @IsOptional() @IsString() @MaxLength(50) NickName?: string;
  @IsOptional() @IsString() @MaxLength(50) RepName?: string;
  @IsOptional() @IsString() @MaxLength(50) RegNum?: string;
  @IsOptional() @IsString() @MaxLength(50) BizIndustry?: string;
  @IsOptional() @IsString() @MaxLength(50) BizCategory?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(20) PhoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) FaxNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) BankCode?: string;
  @IsOptional() @IsString() @MaxLength(50) BankBranch?: string;
  @IsOptional() @IsString() @MaxLength(50) BankAccount?: string;
  @IsOptional() @IsString() @MaxLength(50) BankHolder?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(200) logo_url?: string;
  @IsOptional() @IsString() @MaxLength(200) industry?: string;
  @IsOptional() @IsString() @MaxLength(200) notes?: string;

  /**
   * 참고 속성일 뿐이다 — 전표·계약에 통화 컬럼이 없고 관련 FR 도 0건이므로
   * **다통화는 설계 범위 외**다(설계서 §1).
   */
  @IsOptional() @IsString() @MaxLength(10) default_billing_currency?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

export class SaveClientDto extends PartnerCommonDto {
  @IsOptional() @IsString() @MaxLength(10)
  client_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  client_name!: string;

  /** 수금정책 = partner_term.term_id. 사용중(status=1) 정책만 허용된다. */
  @IsOptional() @IsString() @MaxLength(10)
  collecting_type?: string;
}

export class SaveVendorDto extends PartnerCommonDto {
  @IsOptional() @IsString() @MaxLength(10)
  vendor_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  vendor_name!: string;

  /** 지급정책 = partner_term.term_id */
  @IsOptional() @IsString() @MaxLength(10)
  payment_type?: string;
}
