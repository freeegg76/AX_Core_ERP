import { App, Card, Col, DatePicker, Descriptions, Input, InputNumber, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DebitCredit, DRCR_LABEL, LEDGER_TYPE_LABEL, LedgerType } from '@ax-bridge/shared-constants';
import { ApiError, http, type Paged } from '../shared/api/client';
import { AppToolbar, ApprovalBadge, LookupPopup, Money, useDirtyGuard } from '../shared/ui';

interface HeadRow {
  ledger_date: string;
  ledger_no: number;
  ledger_name: string | null;
  ledger_type: string;
  employee_Id: string;
  approval_status: boolean;
}

interface GlFlags {
  bank: boolean; team: boolean; pod: boolean; employee: boolean;
  client: boolean; vendor: boolean;
  dim1: boolean; dim2: boolean; dim3: boolean; dim4: boolean; dim5: boolean;
  due: boolean;
}

interface LineRow {
  line_on: number;
  gl_id: string;
  gl_name: string | null;
  DRCR: string;
  amount: number;
  bank_id: string | null;
  bank_name: string | null;
  Team_id: string | null;
  pod_id: string | null;
  employee_Id: string | null;
  client_id: string | null;
  vendor_id: string | null;
  dimension1: string | null;
  dimension2: string | null;
  dimension3: string | null;
  dimension4: string | null;
  dimension5: string | null;
  due_date: string | null;
  flags: GlFlags;
}

interface LedgerDetail {
  head: HeadRow;
  lines: LineRow[];
  totals: { debit: number; credit: number; difference: number; balanced: boolean };
}

const EMPTY_FLAGS: GlFlags = {
  bank: false, team: false, pod: false, employee: false, client: false, vendor: false,
  dim1: false, dim2: false, dim3: false, dim4: false, dim5: false, due: false,
};

/**
 * 전표관리 — 3-Layer 화면 (설계서 §12.5, 화면기획서 5-3).
 *
 * Layer1 헤더 목록 → Layer2 라인(차대·금액·고객사 + **상단 실시간 차대합계**)
 * → Layer3 관리항목(**계정 플래그가 Y 인 필드만 활성**).
 *
 * ⚠ 라인 저장은 전체 집합을 보낸다 — 서버가 `line_on` 을 배열 순서대로 재부여하므로
 * 부분 저장이 불가능하다(설계서 §9.1). 선택 상태는 `line_on` 이 아니라
 * 클라이언트 임시 키(`_key`)로 추적한다.
 */
export function LedgerScreen() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Array<LineRow & { _key: string }>>([]);
  const [activeLine, setActiveLine] = useState<string | null>(null);
  const { confirmLeave } = useDirtyGuard(editing);

  const heads = useQuery({
    queryKey: ['/finance/ledgers'],
    queryFn: () => http.get<Paged<HeadRow>>('/finance/ledgers'),
  });

  const [d, n] = selectedKey ? selectedKey.split('|') : [null, null];
  const detail = useQuery({
    queryKey: ['/finance/ledgers', d, n],
    queryFn: () => http.get<LedgerDetail>(`/finance/ledgers/${d}/${n}`),
    enabled: !!selectedKey,
  });

  /** 편집 중이면 draft, 아니면 서버 값 */
  const lines = editing ? draft : (detail.data?.lines ?? []).map((l) => ({ ...l, _key: `s${l.line_on}` }));

  /** Layer2 상단 실시간 합계 (FR-Ledger-10) — 편집 중에도 즉시 반영된다 */
  const totals = useMemo(() => {
    const debit = lines.filter((l) => l.DRCR === DebitCredit.Debit).reduce((s, l) => s + Number(l.amount || 0), 0);
    const credit = lines.filter((l) => l.DRCR === DebitCredit.Credit).reduce((s, l) => s + Number(l.amount || 0), 0);
    return { debit, credit, difference: debit - credit, balanced: debit === credit && lines.length > 0 };
  }, [lines]);

  const current = lines.find((l) => l._key === activeLine) ?? null;

  const createHead = useMutation({
    mutationFn: (v: { ledger_date: string; ledger_name?: string; ledger_type?: string }) =>
      http.post<{ ledger_date: string; ledger_no: number }>('/finance/ledgers', v),
    onSuccess: async (r) => {
      message.success(`전표 등록 — 번호 ${r.ledger_no} 자동 부여`);
      setSelectedKey(`${r.ledger_date}|${r.ledger_no}`);
      await qc.invalidateQueries({ queryKey: ['/finance/ledgers'] });
    },
    onError: (e) => modal.error({ title: '전표 등록 불가', content: (e as ApiError).message }),
  });

  const saveLines = useMutation({
    mutationFn: () =>
      http.put(`/finance/ledgers/${d}/${n}/lines`, {
        // 배열 순서가 line_on 이 된다
        lines: draft.map((l) => ({
          gl_id: l.gl_id, DRCR: l.DRCR, amount: Number(l.amount),
          bank_id: l.bank_id, Team_id: l.Team_id, pod_id: l.pod_id,
          employee_Id: l.employee_Id, client_id: l.client_id, vendor_id: l.vendor_id,
          dimension1: l.dimension1, dimension2: l.dimension2, dimension3: l.dimension3,
          dimension4: l.dimension4, dimension5: l.dimension5, due_date: l.due_date,
        })),
      }),
    onSuccess: async () => {
      message.success('라인이 저장되었습니다.');
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['/finance/ledgers', d, n] });
    },
    onError: (e) => {
      const err = e as ApiError;
      // Layer3 플래그 위반(50464~50466)은 서버 메시지가 가장 정확하다
      modal.error({ title: '라인 저장 불가', content: err.message });
    },
  });

  const approve = useMutation({
    mutationFn: () => http.post(`/finance/ledgers/${d}/${n}/approve`),
    onSuccess: async () => {
      message.success('승인되었습니다.');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['/finance/ledgers'] }),
        qc.invalidateQueries({ queryKey: ['/finance/ledgers', d, n] }),
      ]);
    },
    onError: (e) => modal.error({ title: '승인 불가', content: (e as ApiError).message }),
  });

  const isApproved = !!detail.data?.head.approval_status;

  /** 계정 변경 시 Layer3 충돌을 확인받고 정리한다 (UC-Ledger-04 예외) */
  const changeAccount = async (key: string, nextGlId: string, nextName: string) => {
    const line = draft.find((l) => l._key === key);
    if (!line) return;
    const res = await http.post<{ conflicts: Array<{ field: string; label: string; currentValue: string }>; nextFlags: GlFlags }>(
      '/finance/ledgers/preview-account-change',
      {
        current_line: {
          gl_id: line.gl_id, DRCR: line.DRCR, amount: Number(line.amount) || 1,
          bank_id: line.bank_id, Team_id: line.Team_id, pod_id: line.pod_id,
          employee_Id: line.employee_Id, client_id: line.client_id, vendor_id: line.vendor_id,
          dimension1: line.dimension1, dimension2: line.dimension2, dimension3: line.dimension3,
          dimension4: line.dimension4, dimension5: line.dimension5, due_date: line.due_date,
        },
        next_gl_id: nextGlId,
      },
    );

    const apply = () =>
      setDraft((prev) =>
        prev.map((l) => {
          if (l._key !== key) return l;
          const cleared: Record<string, null> = {};
          for (const c of res.conflicts) cleared[fieldToColumn(c.field)] = null;
          return { ...l, gl_id: nextGlId, gl_name: nextName, flags: res.nextFlags, ...cleared };
        }),
      );

    if (res.conflicts.length === 0) return apply();

    // 값을 사용자 확인 없이 버리지 않는다
    modal.confirm({
      title: '사용하지 않는 관리항목 값이 있습니다',
      content: (
        <div>
          선택한 계정에서 사용하지 않는 항목의 값을 초기화합니다.
          <ul style={{ marginTop: 8 }}>
            {res.conflicts.map((c) => (
              <li key={c.field}>
                {c.label} = <strong>{c.currentValue}</strong>
              </li>
            ))}
          </ul>
        </div>
      ),
      okText: '초기화하고 변경',
      onOk: apply,
    });
  };

  return (
    <div>
      <AppToolbar
        mode={editing ? 'edit' : 'view'}
        hasSelection={!!selectedKey}
        loading={heads.isFetching}
        onSearch={() => confirmLeave(() => void heads.refetch())}
        onCreate={() =>
          modal.confirm({
            title: '전표 신규 등록',
            content: (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                  전표번호는 회사·일자별로 자동 부여됩니다(수동 입력 불가).
                </Typography.Text>
                <Input id="nl-date" placeholder="전표일자 YYYY-MM-DD" />
                <Input id="nl-name" placeholder="전표 제목" />
              </Space>
            ),
            okText: '등록',
            onOk: () => {
              const date = (document.getElementById('nl-date') as HTMLInputElement)?.value;
              const name = (document.getElementById('nl-name') as HTMLInputElement)?.value;
              if (!date) {
                message.error('전표일자를 입력하세요.');
                return Promise.reject();
              }
              return createHead.mutateAsync({ ledger_date: date, ledger_name: name, ledger_type: LedgerType.General });
            },
          })
        }
        onEdit={() => {
          if (isApproved) return message.warning('승인 완료 전표는 수정할 수 없습니다.');
          setDraft((detail.data?.lines ?? []).map((l) => ({ ...l, _key: `s${l.line_on}` })));
          setEditing(true);
        }}
        onSave={() => saveLines.mutate()}
        onCancel={() => {
          setEditing(false);
          setDraft([]);
        }}
        hideDefaults={['delete']}
        extras={[
          {
            key: 'addline',
            label: '라인 추가',
            disabled: !editing,
            onClick: () =>
              setDraft((p) => [
                ...p,
                {
                  _key: `n${Date.now()}`, line_on: p.length + 1, gl_id: '', gl_name: null,
                  DRCR: DebitCredit.Debit, amount: 0,
                  bank_id: null, bank_name: null, Team_id: null, pod_id: null, employee_Id: null,
                  client_id: null, vendor_id: null,
                  dimension1: null, dimension2: null, dimension3: null, dimension4: null, dimension5: null,
                  due_date: null, flags: EMPTY_FLAGS,
                },
              ]),
          },
          {
            key: 'delline',
            label: '라인 삭제',
            danger: true,
            disabled: !editing || !activeLine,
            onClick: () => setDraft((p) => p.filter((l) => l._key !== activeLine)),
          },
          {
            key: 'approve',
            label: '승인',
            type: 'primary',
            disabled: editing || !selectedKey || isApproved || !totals.balanced,
            onClick: () =>
              modal.confirm({
                title: '전표 승인',
                content: `차변 ${totals.debit.toLocaleString()} = 대변 ${totals.credit.toLocaleString()} (균형 확인). 승인 후에는 일반 수정/삭제가 제한됩니다.`,
                okText: '승인',
                onOk: () => approve.mutate(),
              }),
          },
        ]}
        status={detail.data && <ApprovalBadge approved={detail.data.head.approval_status} />}
      />

      <Row gutter={12}>
        {/* Layer 1 — 헤더 목록 */}
        <Col span={7}>
          <Card size="small" title="Layer 1 · 전표 헤더">
            <Table<HeadRow>
              size="small"
              rowKey={(r) => `${r.ledger_date}|${r.ledger_no}`}
              loading={heads.isFetching}
              dataSource={heads.data?.items ?? []}
              pagination={{ pageSize: 12, showSizeChanger: false }}
              rowClassName={(r) =>
                `${r.ledger_date}|${r.ledger_no}` === selectedKey ? 'ant-table-row-selected' : ''
              }
              onRow={(r) => ({
                style: { cursor: 'pointer' },
                onClick: () =>
                  confirmLeave(() => {
                    setSelectedKey(`${r.ledger_date}|${r.ledger_no}`);
                    setEditing(false);
                    setActiveLine(null);
                  }),
              })}
              columns={[
                {
                  title: '일자',
                  width: 100,
                  render: (_, r) => String(r.ledger_date).slice(0, 10),
                },
                { title: '번호', dataIndex: 'ledger_no', width: 60 },
                { title: '제목', dataIndex: 'ledger_name' },
                {
                  title: '승인',
                  width: 80,
                  render: (_, r) => <ApprovalBadge approved={r.approval_status} />,
                },
              ]}
            />
          </Card>
        </Col>

        {/* Layer 2 — 라인 + 실시간 차대합계 */}
        <Col span={10}>
          <Card
            size="small"
            title="Layer 2 · 전표 라인"
            extra={
              <Space size="large">
                <Statistic title="차변" value={totals.debit} valueStyle={{ fontSize: 13 }} />
                <Statistic title="대변" value={totals.credit} valueStyle={{ fontSize: 13 }} />
                <Statistic
                  title="차액"
                  value={Math.abs(totals.difference)}
                  valueStyle={{ fontSize: 13, color: totals.balanced ? '#3f8600' : '#cf1322' }}
                />
              </Space>
            }
          >
            <Table
              size="small"
              rowKey="_key"
              loading={detail.isFetching}
              dataSource={lines}
              pagination={false}
              rowClassName={(r) => (r._key === activeLine ? 'ant-table-row-selected' : '')}
              onRow={(r) => ({ style: { cursor: 'pointer' }, onClick: () => setActiveLine(r._key) })}
              columns={[
                { title: '#', width: 40, render: (_, __, i) => i + 1 },
                {
                  title: '계정',
                  width: 190,
                  render: (_, r) =>
                    editing ? (
                      <LookupPopup
                        endpoint="/finance/gl"
                        codeField="gl_id"
                        nameField="gl_name"
                        label="계정"
                        value={r.gl_id}
                        activeOnly
                        columns={[
                          { key: 'gl_id', title: '계정코드', width: 100 },
                          { key: 'gl_name', title: '계정과목' },
                        ]}
                        onSelect={(code, name) => void changeAccount(r._key, code, name)}
                      />
                    ) : (
                      <span>
                        {r.gl_id} {r.gl_name}
                      </span>
                    ),
                },
                {
                  title: '차대',
                  width: 90,
                  render: (_, r) =>
                    editing ? (
                      <Select
                        size="small"
                        value={r.DRCR}
                        style={{ width: '100%' }}
                        options={[
                          { value: DebitCredit.Debit, label: DRCR_LABEL[DebitCredit.Debit] },
                          { value: DebitCredit.Credit, label: DRCR_LABEL[DebitCredit.Credit] },
                        ]}
                        onChange={(v) =>
                          setDraft((p) => p.map((l) => (l._key === r._key ? { ...l, DRCR: v } : l)))
                        }
                      />
                    ) : (
                      <Tag color={r.DRCR === DebitCredit.Debit ? 'blue' : 'volcano'}>
                        {DRCR_LABEL[r.DRCR as DebitCredit]}
                      </Tag>
                    ),
                },
                {
                  title: '금액',
                  width: 130,
                  align: 'right',
                  render: (_, r) =>
                    editing ? (
                      <InputNumber
                        size="small"
                        value={r.amount}
                        min={0}
                        style={{ width: '100%' }}
                        formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        onChange={(v) =>
                          setDraft((p) => p.map((l) => (l._key === r._key ? { ...l, amount: Number(v ?? 0) } : l)))
                        }
                      />
                    ) : (
                      <Money value={r.amount} />
                    ),
                },
                { title: '고객사', width: 90, dataIndex: 'client_id' },
              ]}
            />
          </Card>
        </Col>

        {/* Layer 3 — 관리항목 (플래그 Y 만 활성) */}
        <Col span={7}>
          <Card size="small" title="Layer 3 · 은행/카드 · 관리항목">
            {!current ? (
              <Typography.Text type="secondary">라인을 선택하세요.</Typography.Text>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  계정 {current.gl_id} 의 플래그가 <strong>Y 인 항목만</strong> 활성됩니다(FR-Ledger-07·08).
                </Typography.Text>
                <Layer3Field
                  label="은행/카드" enabled={current.flags.bank} value={current.bank_id}
                  editing={editing} endpoint="/finance/bank-accounts"
                  codeField="bank_id" nameField="bank_name"
                  columns={[
                    { key: 'bank_id', title: '코드', width: 80 },
                    { key: 'bank_name', title: '명칭' },
                    { key: 'card_number_masked', title: '카드번호' },
                  ]}
                  onPick={(v) => setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, bank_id: v } : l)))}
                />
                <Layer3Field
                  label="부서" enabled={current.flags.team} value={current.Team_id}
                  editing={editing} endpoint="/system/teams" codeField="Team_id" nameField="team_name_ko"
                  columns={[{ key: 'Team_id', title: '부서코드', width: 100 }, { key: 'team_name_ko', title: '부서명' }]}
                  onPick={(v) => setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, Team_id: v } : l)))}
                />
                <Layer3Field
                  label="Pod" enabled={current.flags.pod} value={current.pod_id}
                  editing={editing} endpoint="/system/pods" codeField="pod_id" nameField="pod_name"
                  columns={[{ key: 'pod_id', title: 'Pod', width: 80 }, { key: 'pod_name', title: 'Pod 명' }]}
                  onPick={(v) => setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, pod_id: v } : l)))}
                />
                <Layer3Field
                  label="직원" enabled={current.flags.employee} value={current.employee_Id}
                  editing={editing} endpoint="/system/employees" codeField="employee_Id" nameField="employee_name"
                  columns={[{ key: 'employee_Id', title: '사번', width: 90 }, { key: 'employee_name', title: '이름' }]}
                  onPick={(v) => setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, employee_Id: v } : l)))}
                />
                <Layer3Field
                  label="고객사" enabled={current.flags.client} value={current.client_id}
                  editing={editing} endpoint="/partner/clients" codeField="client_id" nameField="client_name"
                  columns={[{ key: 'client_id', title: '코드', width: 90 }, { key: 'client_name', title: '고객사명' }]}
                  onPick={(v) => setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, client_id: v } : l)))}
                />
                <Layer3Field
                  label="거래처" enabled={current.flags.vendor} value={current.vendor_id}
                  editing={editing} endpoint="/partner/vendors" codeField="vendor_id" nameField="vendor_name"
                  columns={[{ key: 'vendor_id', title: '코드', width: 90 }, { key: 'vendor_name', title: '거래처명' }]}
                  onPick={(v) => setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, vendor_id: v } : l)))}
                />
                {/* 지급/입금일 — 정책 연결 시 자동계산, 미연결 시 직접입력(FR-Ledger-11) */}
                <div>
                  <Typography.Text type={current.flags.due ? undefined : 'secondary'}>지급/입금일</Typography.Text>
                  <Input
                    value={current.due_date ?? ''}
                    disabled={!editing || !current.flags.due}
                    placeholder={current.flags.due ? 'YYYY-MM-DD' : '이 계정에서 사용하지 않음'}
                    onChange={(e) =>
                      setDraft((p) => p.map((l) => (l._key === current._key ? { ...l, due_date: e.target.value || null } : l)))
                    }
                  />
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {detail.data && (
        <Card size="small" style={{ marginTop: 12 }}>
          <Descriptions size="small" column={4}>
            <Descriptions.Item label="전표일자">{String(detail.data.head.ledger_date).slice(0, 10)}</Descriptions.Item>
            <Descriptions.Item label="전표번호">{detail.data.head.ledger_no}</Descriptions.Item>
            <Descriptions.Item label="전표타입">
              {LEDGER_TYPE_LABEL[detail.data.head.ledger_type as LedgerType] ?? detail.data.head.ledger_type}
            </Descriptions.Item>
            <Descriptions.Item label="입력자">{detail.data.head.employee_Id}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}

/** 플래그 → detail 컬럼명 매핑 (서버 conflict.field 는 camelCase 로 온다) */
function fieldToColumn(field: string): string {
  const map: Record<string, string> = {
    bankId: 'bank_id', teamId: 'Team_id', podId: 'pod_id', employeeId: 'employee_Id',
    clientId: 'client_id', vendorId: 'vendor_id',
    dimension1: 'dimension1', dimension2: 'dimension2', dimension3: 'dimension3',
    dimension4: 'dimension4', dimension5: 'dimension5', dueDate: 'due_date',
  };
  return map[field] ?? field;
}

/** 플래그가 N 이면 비활성 + 안내를 띄운다 — 값 입력 자체를 막는다. */
function Layer3Field({
  label, enabled, value, editing, endpoint, codeField, nameField, columns, onPick,
}: {
  label: string;
  enabled: boolean;
  value: string | null;
  editing: boolean;
  endpoint: string;
  codeField: string;
  nameField: string;
  columns: Array<{ key: string; title: string; width?: number }>;
  onPick: (v: string) => void;
}) {
  return (
    <div>
      <Typography.Text type={enabled ? undefined : 'secondary'}>{label}</Typography.Text>
      {enabled && editing ? (
        <LookupPopup
          endpoint={endpoint}
          codeField={codeField}
          nameField={nameField}
          label={label}
          value={value}
          columns={columns}
          activeOnly
          onSelect={(code) => onPick(code)}
        />
      ) : (
        <Input value={value ?? ''} disabled placeholder={enabled ? '' : '이 계정에서 사용하지 않음'} />
      )}
    </div>
  );
}
