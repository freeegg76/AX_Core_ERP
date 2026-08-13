import { Button, Divider, Space, Tag } from 'antd';
import type { ReactNode } from 'react';

export type ScreenMode = 'view' | 'create' | 'edit';

export interface ToolbarExtra {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** 예: 승인 · 마감 · 계정과목 생성 */
  type?: 'default' | 'primary';
}

export interface AppToolbarProps {
  mode: ScreenMode;
  /** 조회전용 사용자는 편집 버튼이 비활성된다 (FR-UI-02·07) */
  readOnly?: boolean;
  /** 선택된 Head 행이 있는가 — 수정/삭제 활성 조건 */
  hasSelection?: boolean;
  onSearch?: () => void;
  onCreate?: () => void;
  onEdit?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  onCancel?: () => void;
  /** 메뉴 고유 기능 — 기본 버튼 뒤에 구분해서 배치한다 */
  extras?: ToolbarExtra[];
  /** 기본 6버튼을 숨긴다 — 마감관리처럼 조회·마감·취소만 쓰는 화면용 */
  hideDefaults?: ('search' | 'create' | 'edit' | 'save' | 'delete' | 'cancel')[];
  status?: ReactNode;
  loading?: boolean;
}

/**
 * 공통 툴바 (설계서 §12.2, FR-UI-02).
 *
 * **버튼 순서 고정: 조회 → 신규 → 수정 → 저장 → 삭제 → 취소.**
 * 승인·마감 등 메뉴 고유 기능은 `extras` 로 기본 버튼 **뒤에** 구분 배치한다.
 * 마감관리(SCR-FIN-06)처럼 구성이 다른 화면은 `hideDefaults` 로 조정한다 —
 * 화면마다 툴바를 새로 만들지 않는다(지침 §6).
 */
export function AppToolbar({
  mode,
  readOnly = false,
  hasSelection = false,
  onSearch,
  onCreate,
  onEdit,
  onSave,
  onDelete,
  onCancel,
  extras = [],
  hideDefaults = [],
  status,
  loading = false,
}: AppToolbarProps) {
  const editing = mode !== 'view';
  const hidden = new Set(hideDefaults);
  const show = (k: Parameters<typeof hidden.has>[0]) => !hidden.has(k);

  return (
    <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
      <Space wrap>
        {show('search') && onSearch && (
          <Button onClick={onSearch} loading={loading} disabled={editing}>
            조회
          </Button>
        )}
        {show('create') && onCreate && (
          <Button onClick={onCreate} disabled={readOnly || editing}>
            신규
          </Button>
        )}
        {show('edit') && onEdit && (
          <Button onClick={onEdit} disabled={readOnly || editing || !hasSelection}>
            수정
          </Button>
        )}
        {show('save') && onSave && (
          <Button type="primary" onClick={onSave} disabled={readOnly || !editing}>
            저장
          </Button>
        )}
        {show('delete') && onDelete && (
          <Button danger onClick={onDelete} disabled={readOnly || editing || !hasSelection}>
            삭제
          </Button>
        )}
        {show('cancel') && onCancel && (
          <Button onClick={onCancel} disabled={!editing}>
            취소
          </Button>
        )}

        {extras.length > 0 && <Divider type="vertical" />}
        {extras.map((e) => (
          <Button
            key={e.key}
            type={e.type ?? 'default'}
            danger={e.danger}
            onClick={e.onClick}
            disabled={e.disabled || readOnly}
          >
            {e.label}
          </Button>
        ))}
      </Space>

      <Space>
        {status}
        <Tag color={mode === 'view' ? 'default' : mode === 'create' ? 'green' : 'orange'}>
          상태 : {mode === 'view' ? '조회' : mode === 'create' ? '신규' : '수정'}
        </Tag>
      </Space>
    </Space>
  );
}
