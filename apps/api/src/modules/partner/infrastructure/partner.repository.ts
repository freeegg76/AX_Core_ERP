import { Injectable } from '@nestjs/common';
import * as sql from 'mssql';
import { PaymentBaseRule, SaveMode } from '@ax-bridge/shared-constants';
import { escapeLike, toDateString } from '../../../common/database/numeric';
import { StoredProcExecutor } from '../../../common/database/stored-proc.executor';
import type { CompanyScope } from '../../../common/tenant/company-scope';

export interface PartnerSaveFields {
  vat_id?: string | null;
  NickName?: string | null;
  RepName?: string | null;
  RegNum?: string | null;
  BizIndustry?: string | null;
  BizCategory?: string | null;
  PhoneNumber?: string | null;
  FaxNumber?: string | null;
  BankCode?: string | null;
  BankBranch?: string | null;
  BankAccount?: string | null;
  BankHolder?: string | null;
  website?: string | null;
  logo_url?: string | null;
  industry?: string | null;
  notes?: string | null;
  default_billing_currency?: string | null;
}

/** PARTNER 쓰기 Repository — `usp_partner_*` 실행 (설계서 §10.1·§10.2). */
@Injectable()
export class PartnerRepository {
  constructor(private readonly proc: StoredProcExecutor) {}

  /* ── partner_term (지급/수금정책) ──────────────────────────────────────── */

  saveTerm(mode: SaveMode, scope: CompanyScope, p: {
    termId: string;
    baseRule: PaymentBaseRule;
    fixedDay?: number | null;
    offsetDays?: number | null;
    status: 0 | 1;
  }) {
    return this.proc.exec('usp_partner_term_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        term_id: p.termId,
        base_rule: p.baseRule,
        fixed_day: p.fixedDay ?? null,
        offset_days: p.offsetDays ?? 0,
        status: p.status,
      },
    });
  }

  deleteTerm(scope: CompanyScope, termId: string) {
    return this.proc.exec('usp_partner_term_delete', {
      in: { ...scope.toProcInput(), term_id: termId },
    });
  }

  listTerms(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null; activeOnly?: boolean }) {
    return this.proc.exec('usp_partner_term_list', {
      in: {
        ...scope.toProcInput(),
        term_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  /**
   * 지급일 미리보기.
   *
   * 이 프로시저는 **OUTPUT 파라미터와 1행 결과셋을 동시에** 반환한다 —
   * Prisma 로는 표현할 수 없는 대표 사례다(설계서 §10.2, D1).
   */
  async calcDueDate(scope: CompanyScope, termId: string, baseDate: string): Promise<string | null> {
    const { output, rows } = await this.proc.exec<{ due_date: Date }>('usp_partner_term_calc_due', {
      in: { ...scope.toProcInput(), term_id: termId, base_date: baseDate },
      out: { due_date: sql.Date },
    });
    const v = output.due_date ?? rows[0]?.due_date;
    // UTC 성분으로 자른다 — 로컬 변환이 끼면 하루 밀린다(§numeric.toDateString).
    return toDateString(v);
  }

  /* ── partner_client (고객사) ───────────────────────────────────────────── */

  saveClient(mode: SaveMode, scope: CompanyScope, p: {
    clientId: string;
    clientName: string;
    collectingType?: string | null;
    status: 0 | 1;
    address?: string | null;
    fields: PartnerSaveFields;
  }) {
    return this.proc.exec('usp_partner_client_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        client_id: p.clientId,
        client_name: p.clientName,
        collecting_type: p.collectingType ?? null,
        status: p.status,
        client_Address: p.address ?? null,
        ...this.normalizeFields(p.fields),
      },
    });
  }

  deleteClient(scope: CompanyScope, clientId: string) {
    return this.proc.exec('usp_partner_client_delete', {
      in: { ...scope.toProcInput(), client_id: clientId },
    });
  }

  listClients(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null; activeOnly?: boolean }) {
    return this.proc.exec('usp_partner_client_list', {
      in: {
        ...scope.toProcInput(),
        client_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  getClient(scope: CompanyScope, clientId: string) {
    return this.proc.exec('usp_partner_client_get', {
      in: { ...scope.toProcInput(), client_id: clientId },
    });
  }

  /* ── partner_vendor (거래처) ───────────────────────────────────────────── */

  saveVendor(mode: SaveMode, scope: CompanyScope, p: {
    vendorId: string;
    vendorName: string;
    paymentType?: string | null;
    status: 0 | 1;
    address?: string | null;
    fields: PartnerSaveFields;
  }) {
    return this.proc.exec('usp_partner_vendor_save', {
      in: {
        mode,
        ...scope.toProcInput(),
        vendor_id: p.vendorId,
        vendor_name: p.vendorName,
        payment_type: p.paymentType ?? null,
        status: p.status,
        vendor_Address: p.address ?? null,
        ...this.normalizeFields(p.fields),
      },
    });
  }

  deleteVendor(scope: CompanyScope, vendorId: string) {
    return this.proc.exec('usp_partner_vendor_delete', {
      in: { ...scope.toProcInput(), vendor_id: vendorId },
    });
  }

  listVendors(scope: CompanyScope, p: { keyword?: string | null; status?: 0 | 1 | null; searchMode?: string | null; activeOnly?: boolean }) {
    return this.proc.exec('usp_partner_vendor_list', {
      in: {
        ...scope.toProcInput(),
        vendor_keyword: escapeLike(p.keyword),
        status: p.status ?? null,
        search_mode: p.searchMode ?? null,
        active_only: p.activeOnly ? 1 : 0,
      },
    });
  }

  getVendor(scope: CompanyScope, vendorId: string) {
    return this.proc.exec('usp_partner_vendor_get', {
      in: { ...scope.toProcInput(), vendor_id: vendorId },
    });
  }

  /** 공통 부가필드는 undefined 를 null 로 정규화한다(프로시저 기본값과 구분). */
  private normalizeFields(f: PartnerSaveFields): Record<string, unknown> {
    return {
      vat_id: f.vat_id ?? null,
      NickName: f.NickName ?? null,
      RepName: f.RepName ?? null,
      RegNum: f.RegNum ?? null,
      BizIndustry: f.BizIndustry ?? null,
      BizCategory: f.BizCategory ?? null,
      PhoneNumber: f.PhoneNumber ?? null,
      FaxNumber: f.FaxNumber ?? null,
      BankCode: f.BankCode ?? null,
      BankBranch: f.BankBranch ?? null,
      BankAccount: f.BankAccount ?? null,
      BankHolder: f.BankHolder ?? null,
      website: f.website ?? null,
      logo_url: f.logo_url ?? null,
      industry: f.industry ?? null,
      notes: f.notes ?? null,
      default_billing_currency: f.default_billing_currency ?? null,
    };
  }
}
