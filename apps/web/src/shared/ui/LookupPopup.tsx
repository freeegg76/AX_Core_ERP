import { Input, Modal, Table } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SearchMode } from '@ax-bridge/shared-constants';
import { http, type Paged } from '../api/client';

export interface LookupColumn {
  key: string;
  title: string;
  width?: number;
}

export interface LookupPopupProps<T> {
  /** 조회 엔드포인트 (예: '/partner/clients') */
  endpoint: string;
  /** 코드 필드명 (예: 'client_id') */
  codeField: string;
  /** 명칭 필드명 (예: 'client_name') */
  nameField: string;
  columns: LookupColumn[];
  label: string;
  value?: string | null;
  /** 선택 후 코드+명칭을 함께 보관한다 (설계서 §12.3) */
  onSelect: (code: string, name: string, row: T) => void;
  /** 신규 선택 팝업은 미사용/비활성을 제외한다 */
  activeOnly?: boolean;
  /** 상위조건(그룹/회사 등)이 없으면 팝업을 열지 않는다 */
  requires?: { ok: boolean; message: string };
  disabled?: boolean;
  /** 추가 쿼리 (예: 기수, dimension_id) */
  extraQuery?: Record<string, string | number | boolean | undefined>;
}

/**
 * 공통 Lookup Popup (지침 §21, FR-UI-04).
 *
 * · **F2** → 조건 범위 목록 팝업 (Like)
 * · **Enter** → Exact 검색 → 1건이면 즉시 선택 → 미일치/다건이면 Like 팝업
 * · 상위조건이 없으면 팝업을 열지 않고 선행 선택을 안내한다.
 *
 * ⚠ 서버 프로시저의 `search_mode` 지원이 불균일하지만(설계서 §12.3), 목록 조회는
 * Query Service 가 담당하므로(D2) 프론트엔드는 화면별 예외 분기를 갖지 않는다.
 */
export function LookupPopup<T extends Record<string, unknown>>({
  endpoint,
  codeField,
  nameField,
  columns,
  label,
  value,
  onSelect,
  activeOnly = true,
  requires,
  disabled = false,
  extraQuery,
}: LookupPopupProps<T>) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState(value ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(value ?? ''), [value]);

  const fetchRows = useCallback(
    async (kw: string, mode: SearchMode): Promise<T[]> => {
      setLoading(true);
      try {
        const res = await http.get<Paged<T>>(endpoint, {
          keyword: kw || undefined,
          search_mode: mode,
          active_only: activeOnly,
          size: 200,
          ...extraQuery,
        });
        return res.items ?? [];
      } finally {
        setLoading(false);
      }
    },
    [endpoint, activeOnly, extraQuery],
  );

  const guard = (): boolean => {
    if (requires && !requires.ok) {
      Modal.info({ title: '선행 조건 필요', content: requires.message });
      return false;
    }
    return true;
  };

  /** F2 — 조건 범위 목록 */
  const openList = async () => {
    if (!guard()) return;
    setKeyword(text);
    setRows(await fetchRows(text, SearchMode.Like));
    setOpen(true);
  };

  /** Enter — Exact 우선, 1건이면 즉시 선택 */
  const tryExact = async () => {
    if (!guard()) return;
    if (!text.trim()) return openList();
    const exact = await fetchRows(text, SearchMode.Exact);
    if (exact.length === 1) {
      const r = exact[0];
      onSelect(String(r[codeField]), String(r[nameField] ?? ''), r);
      setText(String(r[codeField]));
      return;
    }
    // 미일치 또는 다건 → Like 팝업
    setKeyword(text);
    setRows(await fetchRows(text, SearchMode.Like));
    setOpen(true);
  };

  const pick = (r: T) => {
    onSelect(String(r[codeField]), String(r[nameField] ?? ''), r);
    setText(String(r[codeField]));
    setOpen(false);
  };

  return (
    <>
      <Input
        ref={inputRef as never}
        value={text}
        disabled={disabled}
        placeholder={`${label} (F2 목록 / Enter 검색)`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'F2') {
            e.preventDefault();
            void openList();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            void tryExact();
          }
        }}
        onDoubleClick={() => void openList()}
      />
      <Modal
        title={`${label} 선택`}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={720}
      >
        <Input.Search
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={async (v) => setRows(await fetchRows(v, SearchMode.Like))}
          placeholder="검색어"
          style={{ marginBottom: 12 }}
          allowClear
        />
        <Table<T>
          size="small"
          rowKey={(r) => String(r[codeField])}
          loading={loading}
          dataSource={rows}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          onRow={(r) => ({ onDoubleClick: () => pick(r), style: { cursor: 'pointer' } })}
          columns={columns.map((c) => ({ title: c.title, dataIndex: c.key, width: c.width }))}
        />
      </Modal>
    </>
  );
}
