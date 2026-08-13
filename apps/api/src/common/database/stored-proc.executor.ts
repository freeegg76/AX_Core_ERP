import { Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';
import { isRetryable, RETRY_MAX_ATTEMPTS } from '@ax-bridge/shared-constants';
import { MssqlPoolService } from './mssql-pool.service';
import { SqlProcedureError } from '../exception/sql-procedure.error';

/** 입력 파라미터. undefined 는 전달하지 않고, null 은 NULL 로 전달한다. */
export type ProcInput = Record<string, unknown>;

/** OUTPUT 파라미터 선언. 값은 mssql 타입(sql.Numeric(10,2) 등). */
export type ProcOutputSpec = Record<string, sql.ISqlType | (() => sql.ISqlType)>;

export interface ProcCallOptions {
  in?: ProcInput;
  /** OUTPUT 파라미터. 양방향(InOut)이면 `in` 에도 같은 키를 넣는다. */
  out?: ProcOutputSpec;
  /** 이 호출에 쓸 Request(트랜잭션·세션 플래그 공유용). 없으면 풀에서 새로 만든다. */
  request?: sql.Request;
}

export interface ProcResult<T = any> {
  /** OUTPUT 파라미터 값 */
  output: Record<string, any>;
  /** 결과셋 배열 — 다중 결과셋 프로시저는 [0], [1] 로 접근한다. */
  recordsets: T[][];
  /** 첫 번째 결과셋 (편의) */
  rows: T[];
  rowsAffected: number[];
}

/**
 * 저장 프로시저 실행기 (설계서 §10.2, D1).
 *
 * · THROW 50xxx / 51xxx → SqlProcedureError 로 변환하고 예외 필터가 HTTP 로 매핑한다.
 * · 50323(activity_id 채번 경합)은 재시도 가능 오류로 분류해 자동 재시도한다(§9.12).
 * · 여러 프로시저를 하나의 외부 트랜잭션으로 묶지 않는다 — 내부 CATCH 의
 *   `IF @@TRANCOUNT>0 ROLLBACK` 이 외부 트랜잭션까지 되돌린다.
 */
@Injectable()
export class StoredProcExecutor {
  private readonly logger = new Logger(StoredProcExecutor.name);

  constructor(private readonly pool: MssqlPoolService) {}

  async exec<T = any>(procName: string, opts: ProcCallOptions = {}): Promise<ProcResult<T>> {
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        return await this.execOnce<T>(procName, opts);
      } catch (e) {
        if (
          e instanceof SqlProcedureError &&
          isRetryable(e.sqlNumber) &&
          attempt < RETRY_MAX_ATTEMPTS &&
          !opts.request // 외부 트랜잭션 중이면 재시도하지 않는다(이미 롤백됨)
        ) {
          this.logger.warn(`${procName} 재시도 ${attempt}/${RETRY_MAX_ATTEMPTS} (AX-${e.sqlNumber})`);
          continue;
        }
        throw e;
      }
    }
  }

  private async execOnce<T>(procName: string, opts: ProcCallOptions): Promise<ProcResult<T>> {
    const req = opts.request ?? this.pool.request();
    const outKeys = new Set(Object.keys(opts.out ?? {}));

    for (const [key, value] of Object.entries(opts.in ?? {})) {
      if (value === undefined) continue;
      // 양방향 InOut 파라미터는 output() 한 번만 선언한다 — input() 과 함께 부르면
      // mssql 이 "parameter name has already been declared" 로 거부한다.
      if (outKeys.has(key)) continue;
      req.input(key, value === null ? null : (value as any));
    }
    for (const [key, type] of Object.entries(opts.out ?? {})) {
      const t = typeof type === 'function' ? (type as () => sql.ISqlType)() : type;
      // 양방향 InOut : in 에 값이 있으면 초기값으로 함께 전달한다(NULL⇒생성 / 값⇒수정).
      const seed = opts.in?.[key];
      if (seed !== undefined && seed !== null) req.output(key, t as any, seed as any);
      else req.output(key, t as any);
    }

    try {
      const result = await req.execute(procName);
      return {
        output: result.output ?? {},
        recordsets: (result.recordsets as unknown as T[][]) ?? [],
        rows: ((result.recordsets as unknown as T[][])?.[0] ?? []) as T[],
        rowsAffected: result.rowsAffected ?? [],
      };
    } catch (e) {
      throw SqlProcedureError.from(e, procName);
    }
  }
}
