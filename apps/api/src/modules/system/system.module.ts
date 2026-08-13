import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeeAccountPolicy } from './domain/employee-account.policy';
import { SystemService } from './application/system.service';
import { SystemQuery } from './infrastructure/system.query';
import { SystemRepository } from './infrastructure/system.repository';
import {
  CompanyController,
  EmployeeController,
  EntityController,
  PodController,
  TeamController,
  YearController,
} from './presentation/system.controller';

/**
 * SYSTEM 도메인 (28 엔드포인트).
 *
 * 상세 GET 은 companies·entities·employees 3개만 있다 —
 * pods·teams·years 는 `usp_*_get` 프로시저가 없어 목록 조회로 대체한다(설계서 §11.2).
 */
@Module({
  imports: [AuthModule],
  controllers: [
    CompanyController,
    EntityController,
    PodController,
    TeamController,
    EmployeeController,
    YearController,
  ],
  providers: [SystemRepository, SystemQuery, SystemService, EmployeeAccountPolicy],
  exports: [SystemQuery],
})
export class SystemModule {}
