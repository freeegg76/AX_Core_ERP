import { Layout, Menu, Space, Tag, Typography, Dropdown, Button } from 'antd';
import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './auth.store';

/**
 * 앱 셸 — 4개 도메인 메뉴 (화면기획서 4-1 메뉴 구조).
 *
 * 메뉴 순서는 기준정보 구축 선행관계를 따른다:
 * SYSTEM(조직·기수) → PARTNER → SALES → FINANCE 기준정보 → FINANCE 핵심업무.
 *
 * ⚠ FINANCE 전표는 은행/카드·고객사·거래처 마스터가 **선행 등록되어야** 입력할 수
 * 있다 — 표준 GL 의 자산·자본 계정에 플래그 없는 계정이 하나도 없기 때문이다
 * (설계서 C.6). 메뉴 배치가 그 순서를 드러낸다.
 */
export function AppLayout() {
  const { user, logout } = useAuthStore();
  const nav = useNavigate();
  const loc = useLocation();

  const items = useMemo(
    () => [
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
    ],
    [],
  );

  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 16, paddingInline: 16 }}>
        <Typography.Text strong style={{ color: '#fff', fontSize: 16 }}>
          AX Bridge
        </Typography.Text>
        <Space style={{ marginLeft: 'auto' }}>
          {/* 표시용이다 — 서버는 JWT claim 을 쓰고 이 값을 신뢰하지 않는다(FR-Bank-08) */}
          <Tag color="blue">
            {user.companyId} / {user.entityId}
          </Tag>
          <Dropdown
            menu={{
              items: [
                { key: 'pw', label: '비밀번호 변경', onClick: () => nav('/account/password') },
                { key: 'out', label: '로그아웃', danger: true, onClick: () => { logout(); nav('/login'); } },
              ],
            }}
          >
            <Button size="small">{user.employeeName}</Button>
          </Dropdown>
        </Space>
      </Layout.Header>
      <Layout>
        <Layout.Sider width={200} theme="light">
          <Menu
            mode="inline"
            items={items}
            selectedKeys={[loc.pathname]}
            defaultOpenKeys={['system', 'finance']}
            onClick={(e) => nav(e.key)}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 16, overflow: 'auto' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
