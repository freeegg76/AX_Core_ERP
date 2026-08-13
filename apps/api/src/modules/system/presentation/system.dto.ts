import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EmploymentStatus, PAGE_SIZE_MAX, SearchMode } from '@ax-bridge/shared-constants';

const toBool = () =>
  Transform(({ value }) => (value === undefined ? undefined : value === true || value === 'true' || value === '1'));

/**
 * 공통 조회 쿼리 (설계서 §11.1).
 *
 * ⚠ `company_id` / `entity_id` 는 **어떤 DTO 에도 넣지 않는다.** JWT claim 에서만
 * 얻는다(FR-Bank-08). ValidationPipe 의 forbidNonWhitelisted 가 클라이언트가
 * 보낸 미선언 필드를 400 으로 거부한다.
 */
export class ListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: PAGE_SIZE_MAX })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(PAGE_SIZE_MAX)
  size?: number;

  @ApiPropertyOptional({ enum: SearchMode, description: 'E=Enter Exact / L=F2 Like (FR-UI-04)' })
  @IsOptional() @IsIn([SearchMode.Exact, SearchMode.Like])
  search_mode?: SearchMode;

  @ApiPropertyOptional({ description: '신규 선택 팝업 — 미사용/비활성 제외' })
  @IsOptional() @toBool() @IsBoolean()
  active_only?: boolean;
}

export class CompanyListQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(50)
  company_name?: string;
}

export class EntityListQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(50)
  entity_name?: string;
}

export class KeywordListQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(200)
  keyword?: string;
}

export class EmployeeListQueryDto extends ListQueryDto {
  @IsOptional() @IsString() @MaxLength(10)
  team_id?: string;

  @IsOptional() @IsString() @MaxLength(50)
  employee_name?: string;

  @IsOptional() @IsIn(Object.values(EmploymentStatus))
  emp_status?: EmploymentStatus;

  @IsOptional() @toBool() @IsBoolean()
  user_yn?: boolean;
}

/* ── 그룹 ─────────────────────────────────────────────────────────────────── */

export class CreateCompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(10)
  company_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  company_name!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  company_name_ko!: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  /** 0=사용 / 1=미사용 — system_* 는 활성이 0 이다(§9.9) */
  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

export class UpdateCompanyDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  company_name!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  company_name_ko!: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  @IsOptional() @IsString() @MaxLength(200)
  description?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

/* ── 회사 ─────────────────────────────────────────────────────────────────── */

export class SaveEntityDto {
  @IsOptional() @IsString() @MaxLength(10)
  entity_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  entity_name!: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  entity_name_ko!: string;

  @IsOptional() @IsString() @MaxLength(100) RepName?: string;
  @IsOptional() @IsString() @MaxLength(20) RegNum?: string;
  @IsOptional() @IsString() @MaxLength(20) BizNum?: string;
  @IsOptional() @IsString() @MaxLength(100) BizIndustry?: string;
  @IsOptional() @IsString() @MaxLength(100) BizCategory?: string;
  @IsOptional() @IsString() @MaxLength(255) Address?: string;
  @IsOptional() @IsISO8601() estabilish_date?: string;
  @IsOptional() @IsString() @MaxLength(30) PhoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) FaxNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

/* ── Pod ──────────────────────────────────────────────────────────────────── */

export class CreatePodDto {
  @IsString() @IsNotEmpty() @MaxLength(4)
  pod_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  pod_name!: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

export class UpdatePodDto {
  @IsString() @IsNotEmpty() @MaxLength(200)
  pod_name!: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

/* ── 부서 ─────────────────────────────────────────────────────────────────── */

export class CreateTeamDto {
  @IsString() @IsNotEmpty() @MaxLength(10)
  team_id!: string;

  @IsOptional() @IsString() @MaxLength(200) team_name?: string;
  @IsOptional() @IsString() @MaxLength(200) team_name_ko?: string;

  /** 오너·리더는 직원이다. 순환참조로 DDL FK 가 없어 프로시저가 검증한다. */
  @IsString() @IsNotEmpty() @MaxLength(20) owner!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) leader_user_id!: string;

  @IsOptional() @IsString() @MaxLength(4) pod_id?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: 0 | 1;
}

export class UpdateTeamDto {
  @IsOptional() @IsString() @MaxLength(200) team_name?: string;
  @IsOptional() @IsString() @MaxLength(200) team_name_ko?: string;
  @IsString() @IsNotEmpty() @MaxLength(20) owner!: string;
  @IsString() @IsNotEmpty() @MaxLength(20) leader_user_id!: string;
  @IsOptional() @IsString() @MaxLength(4) pod_id?: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) status?: 0 | 1;
}

/* ── 직원 ─────────────────────────────────────────────────────────────────── */

export class SaveEmployeeDto {
  @IsOptional() @IsString() @MaxLength(10)
  employee_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(10)
  team_id!: string;

  @IsString() @IsNotEmpty() @MaxLength(40)
  employee_name!: string;

  @IsOptional() @IsEmail() @MaxLength(100) email?: string;
  @IsOptional() @IsString() @MaxLength(40) english_name?: string;
  @IsOptional() @IsString() @MaxLength(40) title?: string;
  @IsOptional() @IsString() @MaxLength(40) title_abbr?: string;
  @IsOptional() @IsString() @MaxLength(40) employment_type?: string;

  @IsIn(Object.values(EmploymentStatus))
  status!: EmploymentStatus;

  @IsOptional() @IsISO8601() start_date?: string;
  @IsOptional() @IsISO8601() departure_date?: string;
  @IsOptional() @IsString() @MaxLength(50) timezone?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsISO8601() birthday?: string;
  @IsOptional() @IsString() @MaxLength(200) profile_image_url?: string;
  @IsOptional() @IsString() @MaxLength(50) slack_user_id?: string;
  @IsOptional() @IsString() @MaxLength(50) slack_handle?: string;
  @IsOptional() @IsString() @MaxLength(200) social_buddy?: string;

  /** 사용자 계정 여부. true 면 user_id 와 초기 비밀번호가 필요하다. */
  @IsOptional() @toBool() @IsBoolean()
  user_yn?: boolean;

  @IsOptional() @IsString() @MaxLength(20)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'user_id 는 영문·숫자·._- 만 사용할 수 있습니다.' })
  user_id?: string;

  /**
   * **평문**이다. 서버가 Argon2id 로 해시해서 `@init_pass_hash` 로 전달한다.
   * 미입력이면 기존 해시를 유지한다(FR-Emp-05). 응답·로그에 절대 남기지 않는다.
   */
  @IsOptional() @IsString() @MaxLength(200)
  init_password?: string;
}

export class ResetPasswordDto {
  @IsString() @MaxLength(200)
  new_password!: string;
}

/* ── 회사 기수 ────────────────────────────────────────────────────────────── */

export class SaveYearDto {
  @IsOptional() @IsString() @MaxLength(10)
  company_year_id?: string;

  /** 기수 — 1 이상 정수. DB 는 numeric(10,2) 지만 경계에서 정수로 다룬다(D6). */
  @Type(() => Number) @IsInt() @Min(1)
  company_year!: number;

  /** 실제 연도 — 1000~9999 */
  @Type(() => Number) @IsInt() @Min(1000) @Max(9999)
  actual_year!: number;
}
