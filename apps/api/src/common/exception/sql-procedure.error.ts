import {
  APP_ERROR_MIN,
  bandOf,
  toAxCode,
  toHttpStatus,
  type ErrorBand,
} from '@ax-bridge/shared-constants';

/**
 * DB `THROW 50xxx` / 트리거 `51xxx` 를 감싼 도메인 오류 (설계서 §10.2 · 부록 B).
 *
 * mssql 드라이버 오류의 `number` 에서 THROW 번호를 추출한다. 한글 메시지는
 * 프로시저가 만든 것을 그대로 전달한다 — 서버가 다시 문장을 만들지 않는다.
 */
export class SqlProcedureError extends Error {
  readonly sqlNumber: number;
  readonly axCode: string;
  readonly band: ErrorBand | null;
  readonly httpStatus: number;
  readonly procName?: string;
  /** THROW 50000 미만 = SQL Server 자체 오류(구문·제약·연결 등) */
  readonly isAppError: boolean;

  constructor(sqlNumber: number, message: string, procName?: string) {
    super(message);
    this.name = 'SqlProcedureError';
    this.sqlNumber = sqlNumber;
    this.axCode = toAxCode(sqlNumber);
    this.band = bandOf(sqlNumber);
    this.isAppError = sqlNumber >= APP_ERROR_MIN;
    this.httpStatus = this.isAppError ? toHttpStatus(sqlNumber) : 500;
    this.procName = procName;
  }

  static from(e: unknown, procName?: string): SqlProcedureError {
    const err = e as { number?: number; code?: string; message?: string; precedingErrors?: unknown[] };
    const num = typeof err?.number === 'number' ? err.number : 0;
    const msg = err?.message ?? 'DB 처리 중 오류가 발생했습니다.';

    if (num >= APP_ERROR_MIN) return new SqlProcedureError(num, msg, procName);

    // 연결·타임아웃 등 인프라 오류는 그대로 500 으로 넘긴다.
    const wrapped = new SqlProcedureError(num, msg, procName);
    return wrapped;
  }
}
