import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma — **조회 전용** (설계서 §10.3, D2).
 *
 * · Head Grid·검색 목록의 `page`/`size`/`sort` 를 이 계층이 구현한다.
 *   82개 프로시저 전체에 OFFSET/FETCH/ROW_NUMBER/TOP 이 0건이므로 프로시저로는
 *   페이징이 불가능하다.
 * · `_get` 프로시저가 없는 7개 엔티티(pod·team·year·dimension·bank_account·
 *   contract·closing)의 상세 조회도 여기서 담당한다.
 * · 쓰기는 절대 하지 않는다 — 트리거가 프로시저를 정상 경로로 전제하므로
 *   Prisma 로 직접 DML 하면 51xxx 로 차단된다.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma 연결됨 (조회 전용)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
