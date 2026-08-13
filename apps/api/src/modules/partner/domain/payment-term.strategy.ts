import { PaymentBaseRule } from '@ax-bridge/shared-constants';

/**
 * 지급/수금 정책 (지침 §5, FR-Term-06).
 *
 * 단순 값이 아니라 **전략(Strategy)** 으로 모델링한다. Domain 계층이므로
 * NestJS/Prisma 에 의존하지 않는 순수 로직이다.
 *
 * `usp_partner_term_calc_due` 와 **동일한 결과**를 내야 한다 — 미리보기(프로시저)와
 * 전표 저장 시 계산(Domain)이 갈리면 안 된다. 단위 테스트로 등가성을 보장한다.
 */
export interface PaymentTermStrategy {
  /** 기준일 → 지급/입금일 */
  calculate(baseDate: Date): Date;
  /** 표시용 정책식 — 트리거 `trg_partner_term_condition` 이 만드는 값과 같아야 한다. */
  describe(): string;
}

/** UTC 기준으로 해당 월의 말일을 구한다(타임존 이동 방지). */
function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** EOM+N — 기준월 말일 + offset_days */
export class EomPaymentTermStrategy implements PaymentTermStrategy {
  constructor(private readonly offsetDays: number) {
    if (!Number.isInteger(offsetDays) || offsetDays < 0) {
      throw new Error('EOM 정책의 offset_days 는 0 이상 정수여야 한다');
    }
  }

  calculate(baseDate: Date): Date {
    return addDays(endOfMonth(baseDate), this.offsetDays);
  }

  describe(): string {
    return `EOM+${this.offsetDays}`;
  }
}

/** CurM DD — 기준월 DD일. DD 가 월말을 넘으면 월말로 보정한다. */
export class CurrentMonthPaymentTermStrategy implements PaymentTermStrategy {
  constructor(private readonly fixedDay: number) {
    if (!Number.isInteger(fixedDay) || fixedDay < 1 || fixedDay > 31) {
      throw new Error('CURM 정책의 fixed_day 는 1~31 정수여야 한다');
    }
  }

  calculate(baseDate: Date): Date {
    const eom = endOfMonth(baseDate);
    const lastDay = eom.getUTCDate();
    const day = Math.min(this.fixedDay, lastDay); // 2월 31일 → 2월 말일
    return new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), day));
  }

  describe(): string {
    return `CurM${this.fixedDay}`;
  }
}

export interface TermSpec {
  baseRule: PaymentBaseRule;
  fixedDay?: number | null;
  offsetDays?: number | null;
}

/**
 * DB 행 → 전략. `CK_term_shape` 가 DB 에서 정합을 보장하지만
 * Domain 도 같은 규칙을 표현한다(지침 §29 — UI-only 검증 금지).
 */
export function toPaymentTermStrategy(spec: TermSpec): PaymentTermStrategy {
  if (spec.baseRule === PaymentBaseRule.EndOfMonth) {
    if (spec.fixedDay !== null && spec.fixedDay !== undefined) {
      throw new Error('EOM 정책에는 fixed_day 를 지정할 수 없다');
    }
    return new EomPaymentTermStrategy(Number(spec.offsetDays ?? 0));
  }
  if (spec.baseRule === PaymentBaseRule.CurrentMonth) {
    if (spec.fixedDay === null || spec.fixedDay === undefined) {
      throw new Error('CURM 정책에는 fixed_day 가 필요하다');
    }
    if (Number(spec.offsetDays ?? 0) !== 0) {
      throw new Error('CURM 정책은 offset_days 가 0 이어야 한다');
    }
    return new CurrentMonthPaymentTermStrategy(Number(spec.fixedDay));
  }
  throw new Error(`알 수 없는 base_rule: ${String(spec.baseRule)}`);
}
