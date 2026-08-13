import { Global, Module } from '@nestjs/common';
import { MssqlPoolService } from './mssql-pool.service';
import { PrismaService } from './prisma.service';
import { StoredProcExecutor } from './stored-proc.executor';

/**
 * 설계서 §10.2 (D1) — 쓰기는 node-mssql 로 프로시저 실행, 조회는 Prisma.
 * 두 커넥션이 공존하며 트랜잭션 경계는 mssql 측이 소유한다.
 */
@Global()
@Module({
  providers: [MssqlPoolService, StoredProcExecutor, PrismaService],
  exports: [MssqlPoolService, StoredProcExecutor, PrismaService],
})
export class DatabaseModule {}
