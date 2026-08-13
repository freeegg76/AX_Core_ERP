/**
 * AX Bridge — 코드값 사전 (설계서 부록 A)
 *
 * DB 코드값을 업무 로직·UI 에 직접 쓰지 않는다(지침 §16). Domain 은 아래 Enum 만 다루고
 * DB 값 ↔ Enum 변환은 Mapper 가 담당한다.
 */

/* ── status 극성 (설계서 §9.9) ────────────────────────────────────────────────
   ⚠ 도메인별로 활성 값이 반대다. 리터럴을 직접 비교하지 말고 이 헬퍼를 쓴다.        */

/** 활성 = status 0 : company / entity / pod / team / bank_account */
export const ACTIVE_WHEN_ZERO = [
  'system_company',
  'system_entity',
  'system_pod',
  'system_team',
  'finance_bank_account',
] as const;

/** 활성 = status 1 : term / client / vendor / GL / dimension */
export const ACTIVE_WHEN_ONE = [
  'partner_term',
  'partner_client',
  'partner_vendor',
  'finance_GL',
  'finance_dimension',
] as const;

export type ActiveZeroTable = (typeof ACTIVE_WHEN_ZERO)[number];
export type ActiveOneTable = (typeof ACTIVE_WHEN_ONE)[number];
export type ScopedTable = ActiveZeroTable | ActiveOneTable;

/** 테이블별 극성을 흡수해 "사용중인가"를 판정한다. */
export function isActive(table: ScopedTable, status: boolean | number | null): boolean {
  if (status === null || status === undefined) return false;
  const n = typeof status === 'boolean' ? (status ? 1 : 0) : Number(status);
  return (ACTIVE_WHEN_ZERO as readonly string[]).includes(table) ? n === 0 : n === 1;
}

/** Domain 의 활성 상태를 해당 테이블의 DB status 값으로 되돌린다. */
export function toDbStatus(table: ScopedTable, active: boolean): 0 | 1 {
  const activeIsZero = (ACTIVE_WHEN_ZERO as readonly string[]).includes(table);
  return active ? (activeIsZero ? 0 : 1) : activeIsZero ? 1 : 0;
}

/* ── SYSTEM ──────────────────────────────────────────────────────────────── */

/** system_employee.status — varchar(20), CK_emp_status 6종 */
export enum EmploymentStatus {
  Planned = 'planned',
  Probation = 'probation',
  Active = 'active',
  OnLeave = 'on_leave',
  LeavingSoon = 'leaving_soon',
  Inactive = 'inactive',
}
export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  [EmploymentStatus.Planned]: '입사예정',
  [EmploymentStatus.Probation]: '수습',
  [EmploymentStatus.Active]: '재직',
  [EmploymentStatus.OnLeave]: '휴직',
  [EmploymentStatus.LeavingSoon]: '퇴사예정',
  [EmploymentStatus.Inactive]: '퇴사',
};

/** 권한 계층 (설계서 §6.2). 숫자가 클수록 상위. */
export enum Role {
  Viewer = 'VIEWER',
  Editor = 'EDITOR',
  Approver = 'APPROVER',
  Admin = 'ADMIN',
  Super = 'SUPER',
}
export const ROLE_RANK: Record<Role, number> = {
  [Role.Viewer]: 0,
  [Role.Editor]: 1,
  [Role.Approver]: 2,
  [Role.Admin]: 3,
  [Role.Super]: 4,
};

/* ── PARTNER ─────────────────────────────────────────────────────────────── */

/** partner_term.base_rule — CK_term_rule */
export enum PaymentBaseRule {
  /** 기준월 말일 + offset_days */
  EndOfMonth = 'EOM',
  /** 기준월 fixed_day 일 (월말 초과 시 월말 보정) */
  CurrentMonth = 'CURM',
}

/* ── SALES ───────────────────────────────────────────────────────────────── */

export enum PipelineType {
  Agency = '0',
  Sourcing = '1',
  Retail = '2',
  Marketing = '3',
  Etc = '4',
}
export const PIPELINE_TYPE_LABEL: Record<PipelineType, string> = {
  [PipelineType.Agency]: '대행',
  [PipelineType.Sourcing]: '사입',
  [PipelineType.Retail]: '리테일',
  [PipelineType.Marketing]: '마케팅',
  [PipelineType.Etc]: '기타',
};

export enum PipelineStage {
  Lead = '0',
  QualifiedLead = '1',
  Suggest = '2',
  Meeting = '3',
  Nego = '4',
  Closed = '5',
  Canceled = '6',
}
export const PIPELINE_STAGE_LABEL: Record<PipelineStage, string> = {
  [PipelineStage.Lead]: 'Lead',
  [PipelineStage.QualifiedLead]: 'Qualified Lead',
  [PipelineStage.Suggest]: '제안',
  [PipelineStage.Meeting]: '미팅',
  [PipelineStage.Nego]: '협상',
  [PipelineStage.Closed]: '수주',
  [PipelineStage.Canceled]: '취소',
};
/** stage 5/6 진입 시 트리거가 closed_date 를 기록한다(FR-Pipe-07). */
export const CLOSING_STAGES: readonly PipelineStage[] = [PipelineStage.Closed, PipelineStage.Canceled];

export enum ActivityType {
  Mail = '0',
  Call = '1',
  Meeting = '2',
  Etc = '3',
}
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  [ActivityType.Mail]: '메일',
  [ActivityType.Call]: '전화',
  [ActivityType.Meeting]: '미팅',
  [ActivityType.Etc]: '기타',
};

export enum ContractType {
  Agency = '0',
  Sourcing = '1',
  Marketing = '2',
  Logistics = '3',
  Retail = '4',
  Etc = '5',
}
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  [ContractType.Agency]: 'Agency',
  [ContractType.Sourcing]: 'Sourcing',
  [ContractType.Marketing]: 'Marketing',
  [ContractType.Logistics]: 'Logistics',
  [ContractType.Retail]: 'Retail',
  [ContractType.Etc]: 'ETC',
};

export enum ContractStatus {
  Active = '0',
  Inactive = '1',
  Suspend = '2',
}
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  [ContractStatus.Active]: 'Active',
  [ContractStatus.Inactive]: 'Inactive',
  [ContractStatus.Suspend]: 'Suspend',
};

/* ── FINANCE ─────────────────────────────────────────────────────────────── */

/** finance_GL.gl_type — 0~10. DDL 에 CHECK 이 없어 Domain/프로시저가 검증한다(D5). */
export enum GlType {
  Asset = '0',
  Liability = '1',
  Equity = '2',
  Revenue = '3',
  CostOfSales = '4',
  ManufacturingCost = '5',
  ServiceCost = '6',
  SellingAdminExpense = '7',
  NonOperatingIncome = '8',
  NonOperatingExpense = '9',
  IncomeTax = '10',
}
export const GL_TYPE_LABEL: Record<GlType, string> = {
  [GlType.Asset]: '자산',
  [GlType.Liability]: '부채',
  [GlType.Equity]: '자본',
  [GlType.Revenue]: '수익',
  [GlType.CostOfSales]: '매출원가',
  [GlType.ManufacturingCost]: '제조원가',
  [GlType.ServiceCost]: '용역원가',
  [GlType.SellingAdminExpense]: '판매관리비',
  [GlType.NonOperatingIncome]: '영업외수익',
  [GlType.NonOperatingExpense]: '영업외비용',
  [GlType.IncomeTax]: '법인세',
};
/** 연도마감 이월 대상 = 자산·부채·자본만 (FR-Close-05, 설계서 §9.5) */
export const CARRY_FORWARD_GL_TYPES: readonly GlType[] = [GlType.Asset, GlType.Liability, GlType.Equity];

export enum GlDetail {
  Normal = '0',
  Contra = '1',
}

/** finance_GL.vat_gl — nvarchar(50) 에 한글 리터럴을 코드로 쓴다. */
export enum VatGl {
  Purchase = '매입부가가치세',
  Sales = '매출부가가치세',
}

export enum DebitCredit {
  Debit = '1',
  Credit = '2',
}
export const DRCR_LABEL: Record<DebitCredit, string> = {
  [DebitCredit.Debit]: '차변',
  [DebitCredit.Credit]: '대변',
};

export enum LedgerType {
  General = '0',
  Purchase = '1',
  Sales = '2',
  Settlement = '3',
}
export const LEDGER_TYPE_LABEL: Record<LedgerType, string> = {
  [LedgerType.General]: '일반',
  [LedgerType.Purchase]: '매입',
  [LedgerType.Sales]: '매출',
  [LedgerType.Settlement]: '결산',
};

/** finance_ledger_head.approval_status — bit */
export enum ApprovalStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
}
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  [ApprovalStatus.Pending]: '미승인',
  [ApprovalStatus.Approved]: '승인',
};

/** finance_open_balance.closed — 초기이월 "확정" (연도 회계마감과 별개, 설계서 §9.4) */
export enum OpenBalanceState {
  Draft = 'DRAFT',
  Confirmed = 'CONFIRMED',
}

/** finance_open_balance.source — 09_fix 신설. 마감 해제 시 회수 대상 식별 근거. */
export enum OpenBalanceSource {
  Manual = 'MANUAL',
  Closing = 'CLOSING',
}

/** finance_closing.closing — 행이 없으면 미마감으로 간주한다. */
export enum ClosingState {
  Open = 'OPEN',
  Closed = 'CLOSED',
}

/** 관리항목 Slot — 재정렬·재매핑 금지 (지침 §19) */
export type DimensionSlot = 1 | 2 | 3 | 4 | 5;
export const DIMENSION_SLOTS: readonly DimensionSlot[] = [1, 2, 3, 4, 5];
export const MAX_DIMENSION_PER_ENTITY = 5;

/**
 * finance_GL 의 Layer3 사용플래그 12종 (BIT).
 * 키 = finance_GL 의 컬럼명, value = finance_ledger_detail 의 실제값 컬럼명.
 * 두 테이블이 같은 이름을 쓰지만 GL 쪽은 bit(플래그), detail 쪽은 실제 코드/일자다.
 */
export const LAYER3_FLAGS = [
  'bank_id',
  'Team_id',
  'pod_id',
  'employee_Id',
  'client_id',
  'vendor_id',
  'dimension1',
  'dimension2',
  'dimension3',
  'dimension4',
  'dimension5',
  'due_date',
] as const;
export type Layer3Flag = (typeof LAYER3_FLAGS)[number];

/** usp_finance_gl_get / usp_finance_ledger_get 이 반환하는 플래그 별칭 */
export const LAYER3_FLAG_ALIAS: Record<Layer3Flag, string> = {
  bank_id: 'f_bank',
  Team_id: 'f_team',
  pod_id: 'f_pod',
  employee_Id: 'f_employee',
  client_id: 'f_client',
  vendor_id: 'f_vendor',
  dimension1: 'f_dim1',
  dimension2: 'f_dim2',
  dimension3: 'f_dim3',
  dimension4: 'f_dim4',
  dimension5: 'f_dim5',
  due_date: 'f_due',
};

/* ── 공통 조회 규약 ───────────────────────────────────────────────────────── */

/** @search_mode (FR-UI-04) */
export enum SearchMode {
  /** Enter — Exact 검색 */
  Exact = 'E',
  /** F2 — Like 팝업 */
  Like = 'L',
}

export const PAGE_DEFAULT = 1;
export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 500;

/** @mode — 쓰기 프로시저 공통 */
export enum SaveMode {
  Insert = 'I',
  Update = 'U',
}
