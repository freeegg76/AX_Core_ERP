import { PaymentBaseRule } from '@ax-bridge/shared-constants';
import {
  CurrentMonthPaymentTermStrategy,
  EomPaymentTermStrategy,
  toPaymentTermStrategy,
} from './payment-term.strategy';

/** 프로시저가 date 를 다루므로 비교도 날짜 문자열로 한다. */
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('EomPaymentTermStrategy — 월말 + N (FR-Term-06)', () => {
  it.each([
    ['2026-03-15', 0, '2026-03-31'],
    ['2026-03-01', 15, '2026-04-15'],
    ['2026-04-10', 0, '2026-04-30'],
    ['2026-12-31', 1, '2027-01-01'], // 연도 경계
  ])('%s 기준 EOM+%i → %s', (base, offset, expected) => {
    expect(ymd(new EomPaymentTermStrategy(offset).calculate(utc(base)))).toBe(expected);
  });

  it('2월 말일은 평년 28일이다', () => {
    expect(ymd(new EomPaymentTermStrategy(0).calculate(utc('2026-02-10')))).toBe('2026-02-28');
  });

  it('윤년 2월 말일은 29일이다 — 프로시저의 EOMONTH 와 같아야 한다', () => {
    expect(ymd(new EomPaymentTermStrategy(0).calculate(utc('2028-02-10')))).toBe('2028-02-29');
  });

  it('월 어느 날을 기준으로 잡아도 같은 달이면 결과가 같다', () => {
    const s = new EomPaymentTermStrategy(5);
    expect(ymd(s.calculate(utc('2026-03-01')))).toBe(ymd(s.calculate(utc('2026-03-31'))));
  });

  it('describe() 는 트리거 trg_partner_term_condition 이 만드는 표시식과 같다', () => {
    expect(new EomPaymentTermStrategy(15).describe()).toBe('EOM+15');
    expect(new EomPaymentTermStrategy(0).describe()).toBe('EOM+0');
  });

  it('offset_days 는 0 이상 정수여야 한다', () => {
    expect(() => new EomPaymentTermStrategy(-1)).toThrow('0 이상 정수');
    expect(() => new EomPaymentTermStrategy(1.5)).toThrow('0 이상 정수');
  });
});

describe('CurrentMonthPaymentTermStrategy — 당월 DD 일 (FR-Term-06)', () => {
  it.each([
    ['2026-03-05', 25, '2026-03-25'],
    ['2026-03-28', 25, '2026-03-25'], // 기준일보다 앞설 수 있다 — 보정하지 않는다
    ['2026-07-01', 1, '2026-07-01'],
  ])('%s 기준 CurM%i → %s', (base, day, expected) => {
    expect(ymd(new CurrentMonthPaymentTermStrategy(day).calculate(utc(base)))).toBe(expected);
  });

  it('DD 가 월말을 넘으면 월말로 보정한다 — 2월 31일은 없다', () => {
    expect(ymd(new CurrentMonthPaymentTermStrategy(31).calculate(utc('2026-02-10')))).toBe('2026-02-28');
  });

  it('윤년 2월에도 말일로 보정한다', () => {
    expect(ymd(new CurrentMonthPaymentTermStrategy(30).calculate(utc('2028-02-10')))).toBe('2028-02-29');
  });

  it('30일까지인 달에 31 을 지정하면 30일이 된다', () => {
    expect(ymd(new CurrentMonthPaymentTermStrategy(31).calculate(utc('2026-04-10')))).toBe('2026-04-30');
  });

  it('describe() 는 CurM{DD} 형식이다', () => {
    expect(new CurrentMonthPaymentTermStrategy(25).describe()).toBe('CurM25');
  });

  it('fixed_day 는 1~31 정수여야 한다', () => {
    expect(() => new CurrentMonthPaymentTermStrategy(0)).toThrow('1~31 정수');
    expect(() => new CurrentMonthPaymentTermStrategy(32)).toThrow('1~31 정수');
    expect(() => new CurrentMonthPaymentTermStrategy(15.5)).toThrow('1~31 정수');
  });
});

describe('toPaymentTermStrategy — DB 행 → 전략 (CK_term_shape 와 같은 규칙)', () => {
  it('EOM 은 offset_days 를 쓴다', () => {
    const s = toPaymentTermStrategy({ baseRule: PaymentBaseRule.EndOfMonth, fixedDay: null, offsetDays: 10 });

    expect(s.describe()).toBe('EOM+10');
  });

  it('EOM 의 offset_days 가 없으면 0 으로 본다', () => {
    expect(toPaymentTermStrategy({ baseRule: PaymentBaseRule.EndOfMonth }).describe()).toBe('EOM+0');
  });

  it('EOM 에 fixed_day 를 주면 거부한다', () => {
    expect(() => toPaymentTermStrategy({ baseRule: PaymentBaseRule.EndOfMonth, fixedDay: 25 }))
      .toThrow('EOM 정책에는 fixed_day 를 지정할 수 없다');
  });

  it('CURM 은 fixed_day 가 필수다', () => {
    expect(() => toPaymentTermStrategy({ baseRule: PaymentBaseRule.CurrentMonth, fixedDay: null }))
      .toThrow('CURM 정책에는 fixed_day 가 필요하다');
  });

  it('CURM 의 offset_days 는 0 이어야 한다', () => {
    expect(() => toPaymentTermStrategy({ baseRule: PaymentBaseRule.CurrentMonth, fixedDay: 25, offsetDays: 3 }))
      .toThrow('CURM 정책은 offset_days 가 0 이어야 한다');
  });

  it('CURM 에 offset_days 가 없거나 0 이면 통과한다', () => {
    expect(toPaymentTermStrategy({ baseRule: PaymentBaseRule.CurrentMonth, fixedDay: 25 }).describe()).toBe('CurM25');
    expect(toPaymentTermStrategy({ baseRule: PaymentBaseRule.CurrentMonth, fixedDay: 25, offsetDays: 0 }).describe()).toBe('CurM25');
  });

  it('DB 가 문자열/decimal 로 돌려줘도 숫자로 해석한다', () => {
    const s = toPaymentTermStrategy({
      baseRule: PaymentBaseRule.CurrentMonth,
      fixedDay: '25' as unknown as number,
      offsetDays: '0' as unknown as number,
    });

    expect(s.describe()).toBe('CurM25');
  });

  it('알 수 없는 base_rule 은 거부한다', () => {
    expect(() => toPaymentTermStrategy({ baseRule: 'WEEKLY' as PaymentBaseRule }))
      .toThrow('알 수 없는 base_rule: WEEKLY');
  });
});
