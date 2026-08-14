import { CloseOutlined } from '@ant-design/icons';
import { Layout, Menu, Space, Tag, Typography, Dropdown, Button } from 'antd';
import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './auth.store';
import { MENU_GROUPS, MENU_LABELS } from './menu';
import { useTabsStore } from './tabs.store';

/**
 * 앱 셸 — 4개 도메인 메뉴(화면기획서 4-1) + 상단 실행메뉴 탭.
 *
 * 메뉴 정의는 `menu.ts` 한 곳에만 둔다 — 사이드바와 탭 라벨이 갈라지지 않게.
 */
export function AppLayout() {
  const { user, logout } = useAuthStore();
  const { tabs, open, close, reset } = useTabsStore();
  const nav = useNavigate();
  const loc = useLocation();

  /**
   * 메뉴 화면에 들어오면 탭을 연다.
   *
   * 메뉴 클릭 핸들러가 아니라 **경로 변경**을 보고 있다 — 주소창 직접 입력이나
   * 화면 내부 이동(전표 → 상세 등)으로 들어와도 탭이 생기고, 새로고침 후에도
   * 현재 화면의 탭이 복원된다. 메인(`/`)처럼 메뉴에 없는 경로는 탭을 만들지 않는다.
   */
  const label = MENU_LABELS[loc.pathname];
  useEffect(() => {
    if (label) open(loc.pathname, label);
  }, [loc.pathname, label, open]);

  if (!user) return <Navigate to="/login" replace />;

  /** 탭을 닫는다. 보고 있던 탭이면 옆 탭으로, 남은 탭이 없으면 메인으로 이동한다. */
  function closeTab(path: string) {
    const idx = tabs.findIndex((t) => t.path === path);
    close(path);
    if (path !== loc.pathname) return;
    const rest = tabs.filter((t) => t.path !== path);
    nav(rest.length ? (rest[idx] ?? rest[rest.length - 1]).path : '/');
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{ display: 'flex', alignItems: 'center', gap: 16, paddingInline: 16 }}
      >
        {/* 홈으로 이동 — `/` 는 메인 화면이다.
            a 태그(Link)로 두어 키보드 포커스·새 탭 열기가 그대로 동작한다. */}
        <Link to="/" title="홈으로 이동" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <Typography.Text
            strong
            style={{ color: '#fff', fontSize: 16, cursor: 'pointer' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            AX Bridge
          </Typography.Text>
        </Link>

        {/* 실행메뉴 탭 — 탭이 많아지면 헤더를 밀지 않고 가로 스크롤된다. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 0,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {tabs.map((t) => {
            const active = t.path === loc.pathname;
            return (
              <div
                key={t.path}
                role="tab"
                aria-selected={active}
                tabIndex={0}
                onClick={() => nav(t.path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    nav(t.path);
                  }
                }}
                title={t.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: '0 0 auto',
                  height: 32,
                  paddingInline: 12,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderRadius: 4,
                  border: `1px solid ${active ? '#4096ff' : 'rgba(255,255,255,0.35)'}`,
                  background: active ? '#1668dc' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                  lineHeight: 1,
                }}
              >
                <span>{t.label}</span>
                <CloseOutlined
                  role="button"
                  aria-label={`${t.label} 닫기`}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.path);
                  }}
                  style={{ fontSize: 10, opacity: 0.7 }}
                />
              </div>
            );
          })}
        </div>

        <Space style={{ flex: '0 0 auto' }}>
          {/* 표시용이다 — 서버는 JWT claim 을 쓰고 이 값을 신뢰하지 않는다(FR-Bank-08) */}
          <Tag color="blue">
            {user.companyId} / {user.entityId}
          </Tag>
          <Dropdown
            menu={{
              items: [
                { key: 'pw', label: '비밀번호 변경', onClick: () => nav('/account/password') },
                {
                  key: 'out',
                  label: '로그아웃',
                  danger: true,
                  onClick: () => {
                    logout();
                    reset();
                    nav('/login');
                  },
                },
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
            items={MENU_GROUPS}
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
