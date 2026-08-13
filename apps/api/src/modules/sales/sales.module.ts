import { Module } from '@nestjs/common';
import { SalesRepository } from './infrastructure/sales.repository';
import {
  ActivityController,
  ContractController,
  PipelineController,
} from './presentation/sales.controller';

/** SALES 도메인 (15 엔드포인트) — pipelines 6 · activities 4 · contracts 5 */
@Module({
  controllers: [PipelineController, ActivityController, ContractController],
  providers: [SalesRepository],
  exports: [SalesRepository],
})
export class SalesModule {}
