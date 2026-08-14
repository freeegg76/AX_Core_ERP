/**
 * 메뉴 정의 — 사이드바(Menu)와 상단 탭 스트립이 같은 출처를 쓴다.
 *
 * 메뉴 순서는 기준정보 구축 선행관계를 따른다:
 * SYSTEM(조직·기수) → PARTNER → SALES → FINANCE 기준정보 → FINANCE 핵심업무.
 *
 * ⚠ FINANCE 전표는 은행/카드·고객사·거래처 마스터가 **선행 등록되어야** 입력할 수
 * 있다 — 표준 GL 의 자산·자본 계정에 플래그 없는 계정이 하나도 없기 때문이다
 * (설계서 C.6). 메뉴 배치가 그 순서를 드러낸다.
 */
export interface MenuGroup {
  key: string;
  label: string;
  children: { key: string; label: string }[];
}

export const MENU_GROUPS: MenuGroup[] = [
  {
    key: 'system',
    label: 'SYSTEM',
    children: [
      { key: '/system/companies', label: '그룹관리' },
      { key: '/system/entities', label: '회사관리' },
      { key: '/system/pods', label: 'Pod 등록' },
      { key: '/system/teams', label: '부서등록' },
      { key: '/system/employees', label: '직원등록' },
      { key: '/system/years', label: '회사 기수' },
    ],
  },
  {
    key: 'partner',
    label: 'PARTNER',
    children: [
      { key: '/partner/terms', label: '지급정책' },
      { key: '/partner/clients', label: '고객사' },
      { key: '/partner/vendors', label: '거래처' },
    ],
  },
  {
    key: 'sales',
    label: 'SALES',
    children: [
      { key: '/sales/pipelines', label: '파이프라인' },
      { key: '/sales/contracts', label: '계약관리' },
    ],
  },
  {
    key: 'finance',
    label: 'FINANCE',
    children: [
      { key: '/finance/gl', label: '계정과목' },
      { key: '/finance/dimensions', label: '관리항목' },
      { key: '/finance/bank-accounts', label: '은행/카드' },
      { key: '/finance/open-balances', label: '초기이월' },
      { key: '/finance/ledgers', label: '전표관리' },
      { key: '/finance/closings', label: '마감관리' },
    ],
  },
];

/** 경로 → 메뉴명. 탭 라벨을 찾을 때 쓴다. */
export const MENU_LABELS: Record<string, string> = Object.fromEntries(
  MENU_GROUPS.flatMap((g) => g.children.map((c) => [c.key, c.label] as const)),
);
