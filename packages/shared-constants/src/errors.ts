/**
 * AX Bridge — 오류코드 체계 (설계서 부록 B)
 *
 * DB 의 `THROW 50xxx` / 트리거 `51xxx` 를 `AX-50xxx` 로 매핑하고 한글 메시지를
 * 그대로 전달한다. 예외 필터가 HTTP 상태로 변환한다.
 *
 * ⚠ HTTP 매핑은 **손으로 적지 않는다.** `db/0*.sql` 에서 전량 추출한
 * `error-catalog.generated.ts` 를 정본으로 쓴다 — 초기에 추측으로 적었던 목록은
 * 실제 코드와 절반 이상 어긋나 있었다(중복 등록이 409 대신 400 으로 나가는 등).
 * 스크립트가 바뀌면 `node scripts/gen-error-catalog.mjs` 로 재생성한다.
 */
import { ERROR_CATALOG, httpStatusOf } from './error-catalog.generated';

export { ERROR_CATALOG, httpStatusOf, ERROR_CATALOG_SIZE } from './error-catalog.generated';
export type { ErrorCatalogEntry } from './error-catalog.generated';

export type ErrorBand =
  | 'AUTH'
  | 'SYSTEM'
  | 'PARTNER'
  | 'SALES'
  | 'FINANCE'
  | 'FINANCE_V3'
  | 'TRIGGER'
  | 'MIGRATION';

/** THROW 번호 → 도메인 밴드 */
export function bandOf(sqlErrorNumber: number): ErrorBand | null {
  const n = sqlErrorNumber;
  if (n === 50001 || n === 50002) return 'AUTH';
  if (n >= 50101 && n <= 50199) return 'SYSTEM';
  if (n >= 50201 && n <= 50299) return 'PARTNER';
  if (n >= 50301 && n <= 50399) return 'SALES';
  if (n >= 50401 && n <= 50499) return 'FINANCE';
  if (n >= 50501 && n <= 50599) return 'FINANCE_V3';
  if (n >= 51000 && n <= 51999) return 'TRIGGER';
  // 59xxx 는 09_AX_Bridge_Fix.sql 실행 시점 전용이며 런타임에 나타나지 않는다.
  if (n >= 59000 && n <= 59999) return 'MIGRATION';
  return null;
}

/** 우리 오류코드 문자열. 예: 50464 → "AX-50464" */
export function toAxCode(sqlErrorNumber: number): string {
  return `AX-${sqlErrorNumber}`;
}

/** DB THROW 번호는 50000 이상이다. 그 아래는 SQL Server 자체 오류. */
export const APP_ERROR_MIN = 50000;

/** 카탈로그 기반 HTTP 매핑 (미등재 코드는 400) */
export function toHttpStatus(sqlErrorNumber: number): number {
  return httpStatusOf(sqlErrorNumber);
}

/** 카탈로그에 등재된 원본 메시지 — 프로시저가 만든 문구를 확인·비교할 때 쓴다. */
export function catalogMessage(sqlErrorNumber: number): string | null {
  return ERROR_CATALOG[sqlErrorNumber]?.message ?? null;
}

/* ── 재시도 정책 ─────────────────────────────────────────────────────────── */

/**
 * 재시도 가능 오류 (설계서 §9.12 / 부록 B).
 * 50323 = activity_id 채번 경합. 09 에서 프로시저 내부 재시도를 넣었으나
 * 애플리케이션도 2차 방어로 재시도한다.
 */
export const RETRYABLE_CODES: readonly number[] = [50323];
export const RETRY_MAX_ATTEMPTS = 3;

export function isRetryable(sqlErrorNumber: number): boolean {
  return RETRYABLE_CODES.includes(sqlErrorNumber);
}

/* ── 주의가 필요한 코드 (설계서 부록 B) ──────────────────────────────────── */

/**
 * 50521 은 두 프로시저가 같은 코드를 쓴다 —
 * usp_finance_openbalance_save / _close. 전체에서 유일한 비고유 코드이므로
 * 코드만으로 사용자 안내를 분기하면 안 되고 호출 컨텍스트와 함께 해석한다.
 */
export const AMBIGUOUS_CODES: readonly number[] = [50521];

/**
 * 50443 은 v3 에서 사문화되었다. 08 의 usp_finance_openbalance_reopen 교체본에서
 * 제거되고 50523 / 50524 로 대체되었다. 살아 있는 코드로 취급하지 않는다.
 * (카탈로그에는 05 출처로 남아 있으나 런타임에 도달하지 않는다.)
 */
export const DEAD_CODES: readonly number[] = [50443];
