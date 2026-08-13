import { App, Form, Input, Table, type FormInstance } from 'antd';
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, http, type Paged } from '../shared/api/client';
import { AppToolbar, HeadDetailLayout, useDirtyGuard, type ScreenMode } from '../shared/ui';

export interface MasterScreenProps<T extends Record<string, unknown>> {
  title: string;
  /** 목록/저장 엔드포인트 기준 경로 (예: '/system/pods') */
  endpoint: string;
  /** PK 필드명 — 단일키 마스터 전용 */
  idField: keyof T & string;
  columns: Array<{ key: string; title: string; width?: number; render?: (r: T) => ReactNode }>;
  /** Detail 폼 — mode 에 따라 읽기전용 처리는 호출자가 한다 */
  renderForm: (args: { form: FormInstance; mode: ScreenMode; selected: T | null }) => ReactNode;
  /** 폼 값 → 등록 payload */
  toCreateBody: (v: Record<string, unknown>) => unknown;
  /** 폼 값 → 수정 payload */
  toUpdateBody: (v: Record<string, unknown>) => unknown;
  /** 선택 행 → 폼 초기값 */
  toFormValues?: (row: T) => Record<string, unknown>;
  searchFields?: ReactNode;
  extraQuery?: Record<string, string | number | boolean | undefined>;
  headSpan?: number;
  /** 삭제를 제공하지 않는 화면(예: 관리항목 상세값) */
  noDelete?: boolean;
}

/**
 * 마스터 CRUD 공통 화면 (설계서 §12.2, 지침 §6 — 화면별 중복 구현 금지).
 *
 * 표준 흐름: 조회조건 → 조회 → Head Grid → 행 선택 → Detail → 신규/수정 → 검증
 * → 저장 트랜잭션 → Head 재조회 + 선택 유지.
 *
 * 미저장 변경이 있으면 행 선택·재조회 전에 `DirtyFormGuard` 가 확인을 받는다.
 */
export function MasterScreen<T extends Record<string, unknown>>({
  title,
  endpoint,
  idField,
  columns,
  renderForm,
  toCreateBody,
  toUpdateBody,
  toFormValues,
  searchFields,
  extraQuery,
  headSpan = 12,
  noDelete = false,
}: MasterScreenProps<T>) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [mode, setMode] = useState<ScreenMode>('view');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [dirty, setDirty] = useState(false);
  const { confirmLeave } = useDirtyGuard(dirty);

  const queryKey = [endpoint, keyword, extraQuery];
  const { data, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => http.get<Paged<T>>(endpoint, { keyword: keyword || undefined, size: 200, ...extraQuery }),
  });

  const rows = data?.items ?? [];
  const selected = rows.find((r) => String(r[idField]) === selectedId) ?? null;

  const reset = () => {
    setMode('view');
    setDirty(false);
    form.resetFields();
    if (selected) form.setFieldsValue(toFormValues ? toFormValues(selected) : selected);
  };

  const save = useMutation({
    mutationFn: async () => {
      const v = await form.validateFields();
      if (mode === 'create') return http.post(endpoint, toCreateBody(v));
      return http.put(`${endpoint}/${encodeURIComponent(selectedId!)}`, toUpdateBody(v));
    },
    onSuccess: async (res) => {
      message.success('저장되었습니다.');
      setDirty(false);
      setMode('view');
      // 저장 성공 후 Head 재조회 + 선택 유지 (FR-UI-07)
      const newId = (res as Record<string, unknown> | undefined)?.[idField];
      if (newId) setSelectedId(String(newId));
      await qc.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: (e) => {
      const err = e as ApiError;
      // 프로시저가 만든 한글 메시지를 그대로 보여준다 — 서버가 다시 쓰지 않는다.
      message.error(`[${err.code}] ${err.message}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => http.del(`${endpoint}/${encodeURIComponent(selectedId!)}`),
    onSuccess: async () => {
      message.success('삭제되었습니다.');
      setSelectedId(null);
      form.resetFields();
      await qc.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: (e) => {
      const err = e as ApiError;
      // 409 = 참조 중 → 미사용 전환 안내 (설계서 §9.9)
      if (err.status === 409) {
        modal.warning({
          title: '삭제할 수 없습니다',
          content: `${err.message}\n\n삭제 대신 「미사용」으로 전환하세요.`,
        });
        return;
      }
      message.error(`[${err.code}] ${err.message}`);
    },
  });

  return (
    <HeadDetailLayout
      headTitle={`${title} 목록 (${rows.length}건)`}
      detailTitle={`${title} 상세`}
      headSpan={headSpan}
      // 화면별로 폭을 따로 기억한다 (endpoint 가 화면 식별자 역할을 한다)
      paneKey={`master${endpoint.replace(/\//g, '-')}`}
      searchBar={
        <Form layout="inline">
          {searchFields}
          <Form.Item label="검색어">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={() => confirmLeave(() => void refetch())}
              allowClear
              placeholder="코드 또는 명칭"
            />
          </Form.Item>
        </Form>
      }
      toolbar={
        <AppToolbar
          mode={mode}
          hasSelection={!!selected}
          loading={isFetching}
          onSearch={() => confirmLeave(() => void refetch())}
          onCreate={() => {
            setMode('create');
            setSelectedId(null);
            form.resetFields();
            setDirty(false);
          }}
          onEdit={() => setMode('edit')}
          onSave={() => save.mutate()}
          onDelete={() =>
            modal.confirm({
              title: '삭제하시겠습니까?',
              content: `${title} ${selectedId}`,
              okText: '삭제',
              okButtonProps: { danger: true },
              onOk: () => remove.mutate(),
            })
          }
          onCancel={reset}
          hideDefaults={noDelete ? ['delete'] : []}
        />
      }
      head={
        <Table<T>
          size="small"
          rowKey={(r) => String(r[idField])}
          loading={isFetching}
          dataSource={rows}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          rowClassName={(r) => (String(r[idField]) === selectedId ? 'ant-table-row-selected' : '')}
          onRow={(r) => ({
            style: { cursor: 'pointer' },
            onClick: () =>
              confirmLeave(() => {
                setSelectedId(String(r[idField]));
                setMode('view');
                setDirty(false);
                form.resetFields();
                form.setFieldsValue(toFormValues ? toFormValues(r) : r);
              }),
          })}
          columns={columns.map((c) => ({
            title: c.title,
            dataIndex: c.key,
            width: c.width,
            render: c.render ? (_: unknown, r: T) => c.render!(r) : undefined,
          }))}
        />
      }
      detail={
        <Form
          form={form}
          layout="vertical"
          disabled={mode === 'view'}
          onValuesChange={() => setDirty(true)}
        >
          {renderForm({ form, mode, selected })}
        </Form>
      }
    />
  );
}
