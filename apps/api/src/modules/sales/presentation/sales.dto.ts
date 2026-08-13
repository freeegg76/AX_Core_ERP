import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  ActivityType,
  ContractStatus,
  ContractType,
  PAGE_SIZE_MAX,
  PipelineStage,
  PipelineType,
  SearchMode,
} from '@ax-bridge/shared-constants';

class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: PAGE_SIZE_MAX })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(PAGE_SIZE_MAX)
  size?: number;

  @ApiPropertyOptional({ enum: SearchMode })
  @IsOptional() @IsIn([SearchMode.Exact, SearchMode.Like])
  search_mode?: SearchMode;
}

/* ── 파이프라인 ───────────────────────────────────────────────────────────── */

export class PipelineListQueryDto extends PageDto {
  @IsOptional() @IsString() @MaxLength(10) pipeline_id?: string;
  @IsOptional() @IsString() @MaxLength(100) client_name?: string;
  @IsOptional() @IsIn(Object.values(PipelineType)) pipeline_type?: PipelineType;
  @IsOptional() @IsIn(Object.values(PipelineStage)) stage?: PipelineStage;
  @IsOptional() @IsString() @MaxLength(10) employee_id?: string;
  @IsOptional() @IsISO8601() created_from?: string;
  @IsOptional() @IsISO8601() created_to?: string;
  @IsOptional() @IsISO8601() closed_from?: string;
  @IsOptional() @IsISO8601() closed_to?: string;
}

export class CreatePipelineDto {
  @IsString() @IsNotEmpty() @MaxLength(10)
  pipeline_id!: string;

  @IsIn(Object.values(PipelineType))
  pipeline_type!: PipelineType;

  /** 고객사명 문자열. 계약 연결 시 계약 고객사명과 일치해야 한다(FR-Pipe-08). */
  @IsOptional() @IsString() @MaxLength(100)
  client_name?: string;

  @IsOptional() @IsString() @MaxLength(10)
  employee_id?: string;

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

export class UpdatePipelineDto {
  @IsOptional() @IsIn(Object.values(PipelineType)) pipeline_type?: PipelineType;

  /**
   * stage 전환은 Domain 메서드(close/cancel/reopen)를 경유한다 —
   * 속성 직접 대입을 하지 않는다(지침 §5). 별도 엔드포인트는 만들지 않는다(§11.3).
   */
  @IsOptional() @IsIn(Object.values(PipelineStage)) stage?: PipelineStage;

  @IsOptional() @IsString() @MaxLength(100) client_name?: string;
  @IsOptional() @IsString() @MaxLength(10) employee_id?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class LinkContractDto {
  /** null 이면 연결 해제 */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(20)
  contract_id!: string | null;
}

/* ── 액티비티 ─────────────────────────────────────────────────────────────── */

export class SaveActivityDto {
  /** 미입력이면 프로시저가 채번한다(FR-Act-03). */
  @IsOptional() @IsString() @MaxLength(20)
  activity_id?: string;

  @IsIn(Object.values(ActivityType))
  type!: ActivityType;

  @IsOptional() @IsString() @MaxLength(250) content?: string;
  @IsOptional() @IsString() @MaxLength(100) incharge?: string;

  /**
   * 첨부 **링크**다 — 업로드가 아니다(FR-Act-06).
   * http/https 만 허용해 형식을 검증한다.
   */
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(250)
  attached?: string;

  @IsOptional() @IsISO8601() created_date?: string;
}

/* ── 계약 ─────────────────────────────────────────────────────────────────── */

export class ContractListQueryDto extends PageDto {
  @IsOptional() @IsString() @MaxLength(10) client_id?: string;
  @IsOptional() @IsString() @MaxLength(20) contract_id?: string;
  @IsOptional() @IsIn(Object.values(ContractType)) contract_type?: ContractType;
  @IsOptional() @IsIn(Object.values(ContractStatus)) status?: ContractStatus;
  @IsOptional() @IsISO8601() start_from?: string;
  @IsOptional() @IsISO8601() end_to?: string;
}

export class SaveContractDto {
  @IsString() @IsNotEmpty() @MaxLength(10)
  client_id!: string;

  @IsOptional() @IsString() @MaxLength(20)
  contract_id?: string;

  @IsOptional() @IsIn(Object.values(ContractType))
  contract_type?: ContractType;

  @IsOptional() @IsString() @MaxLength(10)
  pipeline_id?: string;

  @IsISO8601() start_date!: string;
  @IsISO8601() end_date!: string;

  @IsOptional() @IsIn(Object.values(ContractStatus))
  status?: ContractStatus;

  /** numeric(18,2) — DDL 이 xlsx 명세의 (10,2) 를 상향한 값이다(§8.1). */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  contract_amount?: number;

  /** 실제 종료/해지일 — 약정 종료일(end_date)과 구분한다(FR-Contract-06). */
  @IsOptional() @IsISO8601()
  closed_date?: string;
}

export class LinkLedgerDto {
  /** 둘 다 입력 또는 둘 다 null (FR-Contract-08) */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsISO8601()
  ledger_date!: string | null;

  @IsOptional() @ValidateIf((_o, v) => v !== null) @Type(() => Number) @IsInt() @Min(1)
  ledger_no!: number | null;
}
