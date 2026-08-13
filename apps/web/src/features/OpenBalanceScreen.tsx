import { App, Card, Col, Form, InputNumber, Row, Select, Space, Statistic, Table, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DebitCredit, DRCR_LABEL } from '@ax-bridge/shared-constants';
import { ApiError, http, type Paged } from '../shared/api/client';
import { AppToolbar, ConfirmedBadge, LookupPopup, Money } from '../shared/ui';

interface ObRow {
  gl_id: string;
  gl_name?: string | null;
  DRCR: string | null;
  bank_id: string | null;
  client_id: string | null;
  vendor_id: string | null;
  amount: number | null;
  closed: boolean | number | null;
  source?: string | null;
}

interface ObTotals {
  debit_total: number;
  credit_total: number;
  difference: number;
}

interface YearRow {
  companyYearId: string;
  companyYear: number;
  actualYear: number;
}

/**
 * 초기이월 입력 (화면기획서 5-4).
 *
 * ⚠ **금액 0 은 저장이 아니라 행 삭제**다 — 서버 프로시저가 `amount > 0` 행만
 * INSERT 한다(설계서 §9.4). 화면이 이 동작을 사용자에게 드러낸다.
 *
 * ⚠ D7 — 연도마감 자동생성분(`source='CLOSING'`)은 **음수가 될 수 있다.**
 * 숨기거나 절대값으로 바꾸지 않고 부호를 살려 표시하고, 합계도 부호 기반으로 낸다.
 */
export function OpenBalanceScreen() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [yearId, setYearId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ObRow[]>([]);

  const years = useQuery({
    queryKey: ['/system/years'],
    queryFn: () => http.get<Paged<YearRow>>('/system/years'),
  });

  const list = useQuery({
    queryKey: ['/finance/open-balances', yearId],
    queryFn: () =>
      http.get<{ items: ObRow[]; totals: ObTotals | null }>('/finance/open-balances', {
        company_year_id: yearId!,
      }),
    enabled: !!yearId,
  });

  const rows = editing ? draft : (list.data?.items ?? []);

  /** 부호를 살려 계산한다 — DRCR 별 단순 SUM 이면 음수 행이 합계를 왜곡한다(D7). */
  const totals = useMemo(() => {
    const debit = rows
      .filter((r) => r.DRCR === DebitCredit.Debit)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const credit = rows
      .filter((r) => r.DRCR === DebitCredit.Credit)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { debit, credit, difference: debit - credit, balanced: debit === credit };
  }, [rows]);

  const hasConfirmed = rows.some((r) => !!r.closed);

  const save = useMutation({
    mutationFn: () =>
      http.put('/finance/open-balances', {
        company_year_id: yearId,
        // 미확정 행만 서버가 교체한다. 0원 행은 서버에서 제외되어 결과적으로 삭제된다.
        rows: draft
          .filter((r) => !r.closed)
          .map((r) => ({
            gl_id: r.gl_id,
            DRCR: r.DRCR ?? DebitCredit.Debit,
            bank_id: r.bank_id,
            client_id: r.client_id,
            vendor_id: r.vendor_id,
            amount: Number(r.amount ?? 0),
          })),
      }),
    onSuccess: async () => {
      message.success('저장되었습니다. (금액 0 인 행은 제거됩니다)');
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['/finance/open-balances', yearId] });
    },
    onError: (e) => modal.error({ title: '저장 불가', content: (e as ApiError).message }),
  });

  const confirm = useMutation({
    mutationFn: () => http.post('/finance/open-balances/close', { company_year_id: yearId }),
    onSuccess: async () => {
      message.success('확정되었습니다.');
      await qc.invalidateQueries({ queryKey: ['/finance/open-balances', yearId] });
    },
    onError: (e) => modal.error({ title: '확정 불가', content: (e as ApiError).message }),
  });

  const unconfirm = useMutation({
    mutationFn: () => http.post('/finance/open-balances/reopen', { company_year_id: yearId }),
    onSuccess: async () => {
      message.success('확정 해제되었습니다.');
      await qc.invalidateQueries({ queryKey: ['/finance/open-balances', yearId] });
    },
    onError: (e) => modal.error({ title: '확정해제 불가', content: (e as ApiError).message }),
  });

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Form layout="inline">
          <Form.Item label="기수" required>
            <Select
              style={{ width: 220 }}
              placeholder="기수를 선택하세요"
              value={yearId}
              loading={years.isFetching}
              onChange={(v) => {
                setYearId(v);
                setEditing(false);
              }}
              options={(years.data?.items ?? []).map((y) => ({
                value: y.companyYearId,
                label: `${y.companyYearId} — ${y.companyYear}기 (${y.actualYear})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Card>

      <AppToolbar
        mode={editing ? 'edit' : 'view'}
        loading={list.isFetching}
        onSearch={() => void list.refetch()}
        onEdit={() => {
          if (!yearId) return message.warning('기수를 먼저 선택하세요.');
          setDraft((list.data?.items ?? []).map((r) => ({ ...r })));
          setEditing(true);
        }}
        onSave={() => save.mutate()}
        onCancel={() => {
          setEditing(false);
          setDraft([]);
        }}
        hideDefaults={['create', 'delete']}
        extras={[
          {
            key: 'addrow',
            label: '행 추가',
            disabled: !editing,
            onClick: () =>
              setDraft((p) => [
                ...p,
                { gl_id: '', DRCR: DebitCredit.Debit, bank_id: null, client_id: null, vendor_id: null, amount: 0, closed: false },
              ]),
          },
          {
            key: 'confirm',
            label: '확정',
            type: 'primary',
            disabled: editing || !yearId,
            onClick: () =>
              modal.confirm({
                title: '초기이월 확정',
                content:
                  '차대변 일치를 검증한 뒤 미확정 행을 확정합니다. ' +
                  '확정은 연도 회계마감과는 별개 개념입니다(설계서 §9.4).',
                okText: '확정',
                onOk: () => confirm.mutate(),
              }),
          },
          {
            key: 'unconfirm',
            label: '확정해제',
            danger: true,
            disabled: editing || !yearId || !hasConfirmed,
            onClick: () =>
              modal.confirm({
                title: '초기이월 확정해제',
                content:
                  '관리자 전용입니다. 해당 연도가 회계마감 상태이거나 연도마감 자동생성분이면 해제할 수 없습니다.',
                okText: '해제',
                okButtonProps: { danger: true },
                onOk: () => unconfirm.mutate(),
              }),
          },
        ]}
      />

      <Card
        size="small"
        title="초기이월 입력"
        extra={
          <Space size="large">
            <Statistic title="차변 합계" value={totals.debit} valueStyle={{ fontSize: 13 }} />
            <Statistic title="대변 합계" value={totals.credit} valueStyle={{ fontSize: 13 }} />
            <Statistic
              title="차액"
              value={Math.abs(totals.difference)}
              valueStyle={{ fontSize: 13, color: totals.balanced ? '#3f8600' : '#cf1322' }}
            />
          </Space>
        }
      >
        <Table<ObRow>
          size="small"
          rowKey={(r, i) => `${r.gl_id}-${r.DRCR}-${r.bank_id ?? ''}-${r.client_id ?? ''}-${r.vendor_id ?? ''}-${i}`}
          loading={list.isFetching}
          dataSource={rows}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            {
              title: '계정',
              width: 200,
              render: (_, r, i) =>
                editing && !r.closed ? (
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
                    onSelect={(code) => setDraft((p) => p.map((x, j) => (j === i ? { ...x, gl_id: code } : x)))}
                  />
                ) : (
                  <span>
                    {r.gl_id} {r.gl_name}
                  </span>
                ),
            },
            {
              title: '차대',
              width: 100,
              render: (_, r, i) =>
                editing && !r.closed ? (
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={r.DRCR ?? DebitCredit.Debit}
                    options={[
                      { value: DebitCredit.Debit, label: DRCR_LABEL[DebitCredit.Debit] },
                      { value: DebitCredit.Credit, label: DRCR_LABEL[DebitCredit.Credit] },
                    ]}
                    onChange={(v) => setDraft((p) => p.map((x, j) => (j === i ? { ...x, DRCR: v } : x)))}
                  />
                ) : (
                  DRCR_LABEL[(r.DRCR ?? '1') as DebitCredit]
                ),
            },
            { title: '은행/카드', width: 90, dataIndex: 'bank_id' },
            { title: '고객사', width: 90, dataIndex: 'client_id' },
            { title: '거래처', width: 90, dataIndex: 'vendor_id' },
            {
              title: '초기이월금액',
              width: 140,
              align: 'right',
              render: (_, r, i) =>
                editing && !r.closed ? (
                  <InputNumber
                    size="small"
                    style={{ width: '100%' }}
                    min={0}
                    value={Number(r.amount ?? 0)}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    onChange={(v) => setDraft((p) => p.map((x, j) => (j === i ? { ...x, amount: Number(v ?? 0) } : x)))}
                  />
                ) : (
                  <Money value={r.amount} />
                ),
            },
            {
              title: '출처',
              width: 90,
              render: (_, r) =>
                r.source === 'CLOSING' ? (
                  <Typography.Text type="secondary">연도마감</Typography.Text>
                ) : (
                  <Typography.Text>수기</Typography.Text>
                ),
            },
            {
              title: '확정',
              width: 80,
              render: (_, r) => <ConfirmedBadge closed={r.closed} />,
            },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          <strong>금액을 0 으로 저장하면 해당 행이 삭제됩니다.</strong> 서버가 금액 0 이하 행을 저장하지 않습니다.
          <br />
          확정(closed=Y) 행과 연도마감 자동생성분은 저장 대상에서 제외되며, 변경하려면 먼저 확정해제해야 합니다.
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
