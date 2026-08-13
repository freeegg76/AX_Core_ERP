import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sql from 'mssql';

/**
 * node-mssql ConnectionPool — **쓰기 경로 전용** (설계서 §10.2, D1).
 *
 * Prisma 를 쓰지 않는 이유:
 *   · OUTPUT 파라미터 4종 5개소 (@ledger_no · @line_no · @activity_id · @due_date).
 *     이 중 3개는 NULL⇒생성 / 非NULL⇒수정 의 양방향 InOut 이라 결과셋으로 대체 불가.
 *   · 다중 결과셋 2건 (usp_finance_ledger_get · usp_finance_openbalance_list).
 *   Prisma $queryRaw/$executeRaw 는 둘 다 지원하지 않는다.
 */
@Injectable()
export class MssqlPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MssqlPoolService.name);
  private pool?: sql.ConnectionPool;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const server = this.config.get<string>('MSSQL_SERVER', 'localhost');
    const instance = this.config.get<string>('MSSQL_INSTANCE');
    const port = Number(this.config.get<string>('MSSQL_PORT', '1433'));

    const cfg: sql.config = {
      server,
      port,
      database: this.config.get<string>('MSSQL_DATABASE', 'AX_BRIDGE'),
      user: this.config.get<string>('MSSQL_USER'),
      password: this.config.get<string>('MSSQL_PASSWORD'),
      options: {
        encrypt: this.config.get<string>('MSSQL_ENCRYPT', 'true') === 'true',
        trustServerCertificate: this.config.get<string>('MSSQL_TRUST_SERVER_CERT', 'true') === 'true',
        // 명명된 인스턴스는 SQL Browser(UDP 1434)가 필요하다. 고정 포트가 있으면 port 를 쓴다.
        ...(instance && !port ? { instanceName: instance } : {}),
        /**
         * DATE 컬럼을 UTC 자정으로 해석한다 — **반드시 true 여야 한다.**
         *
         * false 로 두면 드라이버가 `2026-02-28` 을 로컬(KST) 자정으로 만들고,
         * 이를 ISO 문자열로 자르면 UTC 로 9시간 밀려 **하루 전날**이 된다.
         * 실제로 지급일 계산에서 2026-02-25 가 2026-02-24 로 나오는 오차가 있었다.
         * DB 의 date 컬럼은 타임존 개념이 없으므로 UTC 로 다루는 것이 맞다.
         */
        useUTC: true,
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
      requestTimeout: 60_000,
    };

    this.pool = await new sql.ConnectionPool(cfg).connect();
    this.pool.on('error', (e) => this.logger.error(`mssql pool error: ${e.message}`));
    this.logger.log(`mssql 연결됨 — ${server}:${port}/${cfg.database}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.close();
  }

  get connection(): sql.ConnectionPool {
    if (!this.pool) throw new Error('mssql pool 이 초기화되지 않았다');
    return this.pool;
  }

  /**
   * 단일 커넥션을 확보한다.
   *
   * ⚠ SESSION_CONTEXT 플래그(ax_ledger_approve / ax_openbal_admin /
   * ax_bypass_gl_protect)를 쓰는 프로시저는 **반드시 하나의 커넥션에서** 실행해야
   * 한다. 풀에서 커넥션이 갈리면 트리거 우회가 실패한다(설계서 §10.2 · §10.5).
   * 프로시저 1건 = 트랜잭션 1건이 기본이므로 보통은 Request 하나로 충분하다.
   */
  request(): sql.Request {
    return this.connection.request();
  }

  /** 명시적 트랜잭션이 필요할 때만 사용한다. 프로시저를 중첩 트랜잭션으로 감싸지 않는다. */
  transaction(): sql.Transaction {
    return new sql.Transaction(this.connection);
  }
}
