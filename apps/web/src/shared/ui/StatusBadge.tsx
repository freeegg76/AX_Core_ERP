import { Tag } from 'antd';
import {
  APPROVAL_STATUS_LABEL,
  ApprovalStatus,
  EMPLOYMENT_STATUS_LABEL,
  EmploymentStatus,
  isActive,
  PIPELINE_STAGE_LABEL,
  PipelineStage,
  type ScopedTable,
} from '@ax-bridge/shared-constants';

/**
 * 상태 코드 표시 (설계서 §12.6, 지침 §16).
 * DB 코드값을 화면에 직접 쓰지 않고 라벨로 변환한다.
 */

/** 사용/미사용 — ⚠ 테이블마다 극성이 반대다(§9.9). table 을 반드시 넘긴다. */
export function ActiveBadge({ table, status }: { table: ScopedTable; status: boolean | number | null }) {
  const active = isActive(table, status);
  return <Tag color={active ? 'green' : 'default'}>{active ? '사용' : '미사용'}</Tag>;
}

export function ApprovalBadge({ approved }: { approved: boolean | number | null }) {
  const s = approved ? ApprovalStatus.Approved : ApprovalStatus.Pending;
  return <Tag color={approved ? 'blue' : 'orange'}>{APPROVAL_STATUS_LABEL[s]}</Tag>;
}

export function StageBadge({ stage }: { stage: string }) {
  const label = PIPELINE_STAGE_LABEL[stage as PipelineStage] ?? stage;
  const color =
    stage === PipelineStage.Closed ? 'green' : stage === PipelineStage.Canceled ? 'red' : 'processing';
  return <Tag color={color}>{label}</Tag>;
}

export function EmploymentBadge({ status }: { status: string }) {
  const label = EMPLOYMENT_STATUS_LABEL[status as EmploymentStatus] ?? status;
  const color = status === EmploymentStatus.Active ? 'green' : status === EmploymentStatus.Inactive ? 'default' : 'orange';
  return <Tag color={color}>{label}</Tag>;
}

export function ClosingBadge({ closed }: { closed: boolean | number | null }) {
  return <Tag color={closed ? 'red' : 'green'}>{closed ? '회계마감' : '미마감'}</Tag>;
}

/** 초기이월 확정 — 회계마감과 다른 개념이다(§9.4) */
export function ConfirmedBadge({ closed }: { closed: boolean | number | null }) {
  return <Tag color={closed ? 'blue' : 'default'}>{closed ? '확정' : '미확정'}</Tag>;
}

/** 금액 — D7 에 따라 음수가 나올 수 있다. 숨기지 않고 명시 표시한다. */
export function Money({ value }: { value: number | string | null | undefined }) {
  const n = Number(value ?? 0);
  const neg = n < 0;
  return (
    <span style={{ color: neg ? '#cf1322' : undefined, fontVariantNumeric: 'tabular-nums' }}>
      {neg ? `(${Math.abs(n).toLocaleString()})` : n.toLocaleString()}
    </span>
  );
}
