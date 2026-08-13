import {
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
import { CompanyScope } from '../../../common/tenant/company-scope';
import { AuthService } from '../../auth/auth.service';
import { SystemService } from '../application/system.service';
import { SystemQuery } from '../infrastructure/system.query';
import { SystemRepository } from '../infrastructure/system.repository';
import {
  CompanyListQueryDto,
  CreateCompanyDto,
  CreatePodDto,
  CreateTeamDto,
  EmployeeListQueryDto,
  EntityListQueryDto,
  KeywordListQueryDto,
  ListQueryDto,
  ResetPasswordDto,
  SaveEmployeeDto,
  SaveEntityDto,
  SaveYearDto,
  UpdateCompanyDto,
  UpdatePodDto,
  UpdateTeamDto,
} from './system.dto';

/* ═════════════════════ 그룹 (5) ═════════════════════ */

@ApiTags('SYSTEM · 그룹')
@Controller('system/companies')
export class CompanyController {
  constructor(
    private readonly repo: SystemRepository,
    private readonly query: SystemQuery,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '그룹 목록/팝업 검색' })
  list(@Query() q: CompanyListQueryDto) {
    return this.query.companies({
      page: q.page, size: q.size, searchMode: q.search_mode,
      name: q.company_name, activeOnly: q.active_only,
    });
  }

  @Get(':companyId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '그룹 상세' })
  async get(@Param('companyId') companyId: string) {
    const { rows } = await this.repo.getCompany(companyId);
    return rows[0] ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '그룹 등록' })
  async create(@Body() dto: CreateCompanyDto) {
    await this.repo.saveCompany(SaveMode.Insert, {
      companyId: dto.company_id,
      companyName: dto.company_name,
      companyNameKo: dto.company_name_ko,
      note: dto.note, description: dto.description,
      status: dto.status ?? 0,
    });
    return { company_id: dto.company_id };
  }

  @Put(':companyId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '그룹 수정 (그룹코드 변경 불가)' })
  async update(@Param('companyId') companyId: string, @Body() dto: UpdateCompanyDto) {
    await this.repo.saveCompany(SaveMode.Update, {
      companyId,
      companyName: dto.company_name,
      companyNameKo: dto.company_name_ko,
      note: dto.note, description: dto.description,
      status: dto.status ?? 0,
    });
    return { company_id: companyId };
  }

  @Delete(':companyId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '그룹 삭제 (하위 회사 존재 시 409)' })
  async remove(@Param('companyId') companyId: string): Promise<void> {
    await this.repo.deleteCompany(companyId);
  }
}

/* ═════════════════════ 회사 (5) ═════════════════════ */

@ApiTags('SYSTEM · 회사')
@Controller('system/entities')
export class EntityController {
  constructor(
    private readonly repo: SystemRepository,
    private readonly query: SystemQuery,
    private readonly service: SystemService,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '선택 그룹 소속 회사 목록' })
  list(@Scope() scope: CompanyScope, @Query() q: EntityListQueryDto) {
    return this.query.entities(scope.companyId, {
      page: q.page, size: q.size, searchMode: q.search_mode,
      name: q.entity_name, activeOnly: q.active_only,
    });
  }

  @Get(':entityId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '회사 상세' })
  async get(@Scope() scope: CompanyScope, @Param('entityId') entityId: string) {
    const target = CompanyScope.of(scope.companyId, entityId);
    const { rows } = await this.repo.getEntity(target);
    return rows[0] ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '회사 등록' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveEntityDto) {
    await this.service.saveEntity(SaveMode.Insert, scope.companyId, undefined, dto);
    return { entity_id: dto.entity_id };
  }

  @Put(':entityId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '회사 수정' })
  async update(
    @Scope() scope: CompanyScope,
    @Param('entityId') entityId: string,
    @Body() dto: SaveEntityDto,
  ) {
    await this.service.saveEntity(SaveMode.Update, scope.companyId, entityId, dto);
    return { entity_id: entityId };
  }

  @Delete(':entityId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '회사 삭제 (하위 데이터 존재 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('entityId') entityId: string): Promise<void> {
    await this.repo.deleteEntity(CompanyScope.of(scope.companyId, entityId));
  }
}

/* ═════════════════════ Pod (4 — 상세 GET 없음) ═════════════════════ */

@ApiTags('SYSTEM · Pod')
@Controller('system/pods')
export class PodController {
  constructor(
    private readonly repo: SystemRepository,
    private readonly query: SystemQuery,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: 'Pod 목록/팝업 (usp_system_pod_get 이 없어 상세는 목록으로 대체)' })
  list(@Scope() scope: CompanyScope, @Query() q: KeywordListQueryDto) {
    return this.query.pods(scope, {
      page: q.page, size: q.size, searchMode: q.search_mode,
      keyword: q.keyword, activeOnly: q.active_only,
    });
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: 'Pod 등록 (pod_id 4자)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: CreatePodDto) {
    await this.repo.savePod(SaveMode.Insert, scope, {
      podId: dto.pod_id, podName: dto.pod_name, status: dto.status ?? 0,
    });
    return { pod_id: dto.pod_id };
  }

  @Put(':podId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: 'Pod 수정 (이름·상태만)' })
  async update(@Scope() scope: CompanyScope, @Param('podId') podId: string, @Body() dto: UpdatePodDto) {
    await this.repo.savePod(SaveMode.Update, scope, {
      podId, podName: dto.pod_name, status: dto.status ?? 0,
    });
    return { pod_id: podId };
  }

  @Delete(':podId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: 'Pod 삭제 (부서·전표 참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('podId') podId: string): Promise<void> {
    await this.repo.deletePod(scope, podId);
  }
}

/* ═════════════════════ 부서 (4 — 상세 GET 없음) ═════════════════════ */

@ApiTags('SYSTEM · 부서')
@Controller('system/teams')
export class TeamController {
  constructor(
    private readonly repo: SystemRepository,
    private readonly query: SystemQuery,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '부서 목록 (오너·리더·Pod명 포함)' })
  list(@Scope() scope: CompanyScope, @Query() q: KeywordListQueryDto) {
    return this.query.teams(scope, {
      page: q.page, size: q.size, searchMode: q.search_mode,
      keyword: q.keyword, activeOnly: q.active_only,
    });
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '부서 등록 (오너/리더/Pod 소속 검증)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: CreateTeamDto) {
    await this.repo.saveTeam(SaveMode.Insert, scope, {
      teamId: dto.team_id, teamName: dto.team_name, teamNameKo: dto.team_name_ko,
      owner: dto.owner, leaderUserId: dto.leader_user_id,
      podId: dto.pod_id, note: dto.note, status: dto.status ?? 0,
    });
    return { team_id: dto.team_id };
  }

  @Put(':teamId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '부서 수정' })
  async update(@Scope() scope: CompanyScope, @Param('teamId') teamId: string, @Body() dto: UpdateTeamDto) {
    await this.repo.saveTeam(SaveMode.Update, scope, {
      teamId, teamName: dto.team_name, teamNameKo: dto.team_name_ko,
      owner: dto.owner, leaderUserId: dto.leader_user_id,
      podId: dto.pod_id, note: dto.note, status: dto.status ?? 0,
    });
    return { team_id: teamId };
  }

  @Delete(':teamId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '부서 삭제 (직원·전표 참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('teamId') teamId: string): Promise<void> {
    await this.repo.deleteTeam(scope, teamId);
  }
}

/* ═════════════════════ 직원 (6) ═════════════════════ */

@ApiTags('SYSTEM · 직원')
@Controller('system/employees')
export class EmployeeController {
  constructor(
    private readonly repo: SystemRepository,
    private readonly query: SystemQuery,
    private readonly service: SystemService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '직원 목록 (user_pass 미포함)' })
  list(@Scope() scope: CompanyScope, @Query() q: EmployeeListQueryDto) {
    return this.query.employees(scope, {
      page: q.page, size: q.size, searchMode: q.search_mode,
      teamId: q.team_id, name: q.employee_name, empStatus: q.emp_status,
      userYn: q.user_yn, activeOnly: q.active_only,
    });
  }

  @Get(':employeeId')
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '직원 상세 (user_pass 제외)' })
  async get(@Scope() scope: CompanyScope, @Param('employeeId') employeeId: string) {
    const { rows } = await this.repo.getEmployee(scope, employeeId);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (row) delete row.user_pass; // 이중 방어 — 프로시저도 제외하지만 한 번 더 지운다.
    return row ?? null;
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '직원 등록 (user_yn=Y 면 user_id + 초기 비밀번호 필수)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveEmployeeDto) {
    await this.service.saveEmployee(SaveMode.Insert, scope, undefined, dto);
    return { employee_id: dto.employee_id };
  }

  @Put(':employeeId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '직원 수정 (사번 불가, 비밀번호 미입력 시 기존 유지)' })
  async update(
    @Scope() scope: CompanyScope,
    @Param('employeeId') employeeId: string,
    @Body() dto: SaveEmployeeDto,
  ) {
    // 설계서 §6.3 — DB 에 강제 장치가 없어 여기서 admin 접근수단을 보호한다.
    await this.service.assertAdminStaysReachable(scope, employeeId, dto);
    await this.service.saveEmployee(SaveMode.Update, scope, employeeId, dto);
    return { employee_id: employeeId };
  }

  @Put(':employeeId/password')
  @MinRole(Role.Admin)
  @HttpCode(204)
  @ApiOperation({ summary: '관리자 비밀번호 초기화 (기존 해시 미표시)' })
  async resetPassword(
    @Scope() scope: CompanyScope,
    @Param('employeeId') employeeId: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.auth.resetPassword(scope.companyId, scope.entityId, employeeId, dto.new_password);
  }

  @Delete(':employeeId')
  @MinRole(Role.Admin)
  @HttpCode(204)
  @ApiOperation({ summary: '직원 삭제 (참조 시 409, admin 삭제는 트리거가 차단)' })
  async remove(@Scope() scope: CompanyScope, @Param('employeeId') employeeId: string): Promise<void> {
    await this.repo.deleteEmployee(scope, employeeId);
  }
}

/* ═════════════════════ 회사 기수 (4 — 상세 GET 없음) ═════════════════════ */

@ApiTags('SYSTEM · 회사 기수')
@Controller('system/years')
export class YearController {
  constructor(
    private readonly repo: SystemRepository,
    private readonly query: SystemQuery,
    private readonly service: SystemService,
  ) {}

  @Get()
  @MinRole(Role.Viewer)
  @ApiOperation({ summary: '기수 목록 (company_year/actual_year 정수 정규화)' })
  list(@Scope() scope: CompanyScope, @Query() q: ListQueryDto) {
    return this.query.years(scope, { page: q.page, size: q.size, searchMode: q.search_mode });
  }

  @Post()
  @MinRole(Role.Editor)
  @HttpCode(201)
  @ApiOperation({ summary: '기수 등록 (중복·형식 검증)' })
  async create(@Scope() scope: CompanyScope, @Body() dto: SaveYearDto) {
    await this.service.saveYear(SaveMode.Insert, scope, undefined, dto);
    return { company_year_id: dto.company_year_id };
  }

  @Put(':yearId')
  @MinRole(Role.Editor)
  @ApiOperation({ summary: '기수 수정 (초기이월 참조 시 409)' })
  async update(@Scope() scope: CompanyScope, @Param('yearId') yearId: string, @Body() dto: SaveYearDto) {
    await this.service.saveYear(SaveMode.Update, scope, yearId, dto);
    return { company_year_id: yearId };
  }

  @Delete(':yearId')
  @MinRole(Role.Editor)
  @HttpCode(204)
  @ApiOperation({ summary: '기수 삭제 (참조 시 409)' })
  async remove(@Scope() scope: CompanyScope, @Param('yearId') yearId: string): Promise<void> {
    await this.repo.deleteYear(scope, yearId);
  }
}
