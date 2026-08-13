import { Module } from '@nestjs/common';
import { LedgerService } from './application/ledger.service';
import { FinanceQuery } from './infrastructure/finance.query';
import { FinanceRepository } from './infrastructure/finance.repository';
import {
  BankController,
  ClosingController,
  DimensionController,
  GlController,
  LedgerController,
  OpenBalanceController,
} from './presentation/finance.controller';

/**
 * FINANCE 도메인 (32 엔드포인트 = 명세 31 + 마감해제 1).
 *
 * gl 6 · dimensions 7 · bank-accounts 4 · open-balances 4 · ledgers 7(+미리보기 1) · closings 4
 */
@Module({
  controllers: [
    GlController,
    DimensionController,
    BankController,
    OpenBalanceController,
    LedgerController,
    ClosingController,
  ],
  providers: [FinanceRepository, FinanceQuery, LedgerService],
  exports: [FinanceRepository, FinanceQuery, LedgerService],
})
export class FinanceModule {}
