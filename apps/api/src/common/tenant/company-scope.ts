/**
 * CompanyScope — 회사 범위 Value Object (설계서 §5, 지침 §7).
 *
 * company_id = 그룹, entity_id = 회사.
 *
 * 불변 규칙:
 *   · company_id / entity_id 를 **요청 본문·쿼리로 받지 않는다.** JWT claim 에서
 *     추출해 헤더(X-Company-Id / X-Entity-Id)로 전달하고 서버가 재검증한다(FR-Bank-08).
 *   · Repository / Query 인터페이스는 항상 scope 를 첫 인자로 받는다.
 *   · 표준 GL 재생성처럼 "대상 지정" 기능도 세션 값으로 고정한다(FR-GL-11).
 */
export class CompanyScope {
  private constructor(
    /** 그룹코드 varchar(10) */
    public readonly companyId: string,
    /** 회사코드 varchar(10) */
    public readonly entityId: string,
  ) {}

  static of(companyId: string, entityId: string): CompanyScope {
    const c = (companyId ?? '').trim();
    const e = (entityId ?? '').trim();
    if (!c || !e) throw new Error('CompanyScope 는 companyId·entityId 가 모두 필요하다');
    if (c.length > 10 || e.length > 10) throw new Error('CompanyScope 코드는 10자를 초과할 수 없다');
    return new CompanyScope(c, e);
  }

  /** 프로시저 공통 인자로 펼친다. */
  toProcInput(): { company_id: string; entity_id: string } {
    return { company_id: this.companyId, entity_id: this.entityId };
  }

  /**
   * Prisma where 절 스코프. 회사 단위 테이블 조회에서 절대 누락하지 않는다.
   *
   * `prisma db pull` 로 역생성한 모델은 DB 컬럼명(snake_case)을 그대로 쓰므로
   * 여기서도 snake_case 로 돌려준다. camelCase 변환은 Mapper/DTO 경계에서 한다
   * (설계서 §10.1 — Prisma Model 을 Domain Entity 로 직접 쓰지 않는다).
   */
  toWhere(): { company_id: string; entity_id: string } {
    return { company_id: this.companyId, entity_id: this.entityId };
  }

  equals(other: CompanyScope): boolean {
    return this.companyId === other.companyId && this.entityId === other.entityId;
  }

  toString(): string {
    return `${this.companyId}/${this.entityId}`;
  }
}
