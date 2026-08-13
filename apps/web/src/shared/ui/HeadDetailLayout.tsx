import { Card, Col, Row } from 'antd';
import type { ReactNode } from 'react';

/**
 * Head/Detail 레이아웃 (설계서 §12.2).
 * 조회조건바 + Head Grid + Detail 을 한 규격으로 배치한다 — 화면마다 새로 만들지 않는다.
 */
export function HeadDetailLayout({
  searchBar,
  toolbar,
  head,
  detail,
  headTitle = '목록',
  detailTitle = '상세',
  /** 계정과목처럼 좌우 2-Frame 비율이 다른 화면용 */
  headSpan = 12,
}: {
  searchBar?: ReactNode;
  toolbar?: ReactNode;
  head: ReactNode;
  detail: ReactNode;
  headTitle?: string;
  detailTitle?: string;
  headSpan?: number;
}) {
  return (
    <div>
      {searchBar && <Card size="small" style={{ marginBottom: 12 }}>{searchBar}</Card>}
      {toolbar}
      <Row gutter={12}>
        <Col span={headSpan}>
          <Card size="small" title={headTitle}>{head}</Card>
        </Col>
        <Col span={24 - headSpan}>
          <Card size="small" title={detailTitle}>{detail}</Card>
        </Col>
      </Row>
    </div>
  );
}
