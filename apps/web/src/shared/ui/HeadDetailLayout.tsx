import { Card } from 'antd';
import type { ReactNode } from 'react';
import { ResizablePanes } from './ResizablePanes';

/**
 * Head/Detail 레이아웃 (설계서 §12.2).
 *
 * 조회조건바 + 툴바 + Head Grid + Detail 을 한 규격으로 배치한다 — 화면마다 새로 만들지 않는다.
 * 좌우 프레임은 **드래그로 폭을 조절**할 수 있고 조절값은 화면별로 유지된다.
 */
export function HeadDetailLayout({
  searchBar,
  toolbar,
  head,
  detail,
  headTitle = '목록',
  detailTitle = '상세',
  /** 좌측 프레임 초기 비율 — 기존 24 그리드 span 을 그대로 받는다(예: 12 = 50%) */
  headSpan = 12,
  /** 폭 저장 키. 화면마다 달라야 한다. */
  paneKey = 'head-detail',
}: {
  searchBar?: ReactNode;
  toolbar?: ReactNode;
  head: ReactNode;
  detail: ReactNode;
  headTitle?: string;
  detailTitle?: string;
  headSpan?: number;
  paneKey?: string;
}) {
  const headPct = Math.min(85, Math.max(15, (headSpan / 24) * 100));

  return (
    <div>
      {/* 조회조건바 → 툴바 → 본문 순서 (FR-UI-03) */}
      {searchBar && (
        <Card size="small" style={{ marginBottom: 12 }}>
          {searchBar}
        </Card>
      )}
      {toolbar}
      <ResizablePanes storageKey={paneKey} initial={[headPct, 100 - headPct]}>
        <Card size="small" title={headTitle} style={{ height: '100%' }}>
          {head}
        </Card>
        <Card size="small" title={detailTitle} style={{ height: '100%' }}>
          {detail}
        </Card>
      </ResizablePanes>
    </div>
  );
}
