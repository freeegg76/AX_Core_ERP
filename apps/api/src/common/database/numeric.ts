import * as sql from 'mssql';

/**
 * D6 — 정수형 Decimal 경계 변환 (설계서 §8.1).
 *
 * `ledger_no` · `line_on` · `line_no` · `company_year` · `actual_year` 는 의미상
 * 정수인데 DB 에서 `numeric(10,2)` 로 선언되어 있다. PK/FK/유니크 인덱스와 75개
 * 프로시저 시그니처가 이 타입에 묶여 있어 **DB 타입은 바꾸지 않는다.**
 *
 * 대신 이 계층에서:
 *   · DB → Domain : `toInt()` 로 number 정규화 (소수부가 있으면 데이터 오염이므로 예외)
 *   · Domain → DB : `NUMERIC_10_2` 로 되돌려 바인딩
 */

/** 프로시저 인자 바인딩용 타입 — 정수 의미의 numeric(10,2) */
export const NUMERIC_10_2 = sql.Numeric(10, 2);
/** 금액 — numeric(18,2) */
export const NUMERIC_18_2 = sql.Numeric(18, 2);

/**
 * numeric(10,2) 값을 정수로 정규화한다.
 * Prisma 는 Decimal 을, mssql 은 number 또는 string 을 줄 수 있어 모두 받는다.
 */
export function toInt(v: unknown): number {
  if (v === null || v === undefined) {
    throw new Error('정수형 값이 null 이다');
  }
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n)) throw new Error(`정수로 변환할 수 없는 값: ${String(v)}`);
  if (!Number.isInteger(n)) {
    // 소수부가 있으면 데이터 오염이다 — 조용히 버리지 않고 드러낸다.
    throw new Error(`정수 의미 컬럼에 소수부가 있다: ${String(v)}`);
  }
  return n;
}

/** null 허용 버전 */
export function toIntOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : toInt(v);
}

/**
 * 금액을 number 로 변환한다.
 *
 * numeric(18,2) 의 최대값(9,999,999,999,999,999.99)은 double 의 안전 정수 범위
 * (2^53 ≈ 9.007e15)를 넘을 수 있다. 실무 금액대에서는 안전하지만, 정확성이
 * 필요한 합계 계산은 DB 에서 수행한다(프로시저가 이미 그렇게 한다).
 */
export function toMoney(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n)) throw new Error(`금액으로 변환할 수 없는 값: ${String(v)}`);
  return n;
}

export function toMoneyOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : toMoney(v);
}

/** DB bit → boolean */
export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return false;
  return Number(v) === 1;
}

/** DATE 컬럼 → 'YYYY-MM-DD' (타임존 이동 방지: UTC 성분으로 자른다) */
export function toDateString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v as Date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** DATETIME2 → ISO 문자열 */
export function toDateTimeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  const d = v as Date;
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * `LIKE` 이스케이프 (설계서 §10.4).
 *
 * 프로시저의 `LIKE '%'+@x+'%'` 에는 ESCAPE 절이 없어 사용자 입력의 `%`·`_`·`[`
 * 가 와일드카드로 동작한다. 프로시저를 호출하기 전에 Application 이 이스케이프한다.
 */
export function escapeLike(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  return input.replace(/[\\%_[\]]/g, (m) => `\\${m}`);
}

/** 카드번호 마스킹 — 뒤 4자리만 (설계서 §9.10) */
export function maskCardNumber(card: string | null | undefined): string | null {
  if (!card) return null;
  if (card.length <= 4) return '*'.repeat(card.length);
  return '*'.repeat(card.length - 4) + card.slice(-4);
}
