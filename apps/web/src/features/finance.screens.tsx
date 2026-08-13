import { App, Card, Checkbox, Col, Form, Input, Row, Select, Table, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GL_TYPE_LABEL, GlDetail, GlType, VatGl } from '@ax-bridge/shared-constants';
import { ApiError, http, type Paged } from '../shared/api/client';
import { MasterScreen } from './MasterScreen';
import { ActiveBadge, AppToolbar, ClosingBadge, LookupPopup, Money } from '../shared/ui';

const ONE_ACTIVE = [
  { value: 1, label: '사용' },
  { value: 0, label: '미사용' },
];
const ZERO_ACTIVE = [
  { value: 0, label: '사용' },
  { value: 1, label: '미사용' },
];

/* ═════════════════ 계정과목 — 2-Frame (화면기획서 5-1) ═════════════════ */

/** Layer3 사용플래그 12종 — 실제 값이 아니라 사용여부다(FR-GL-06) */
const FLAG_FIELDS: Array<{ name: string; label: string }> = [
  { name: 'bank', label: '은행/카드' },
  { name: 'team', label: '부서' },
  { name: 'pod', label: 'Pod' },
  { name: 'employee', label: '직원' },
  { name: 'client', label: '고객사' },
  { name: 'vendor', label: '거래처' },
  { name: 'due', label: '지급/입금일' },
  { name: 'dim1', label: '관리항목1' },
  { name: 'dim2', label: '관리항목2' },
  { name: 'dim3', label: '관리항목3' },
  { name: 'dim4', label: '관리항목4' },
  { name: 'dim5', label: '관리항목5' },
];

export function GlScreen() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: () => http.post<{ inserted_count: number }>('/finance/gl/generate-standard'),
    onSuccess: async (r) => {
      message.success(`표준 계정과목 ${r.inserted_count}건이 생성되었습니다.`);
      await qc.invalidateQueries({ queryKey: ['/finance/gl'] });
    },
    onError: (e) => {
      const err = e as ApiError;
      // 전표가 1건이라도 있으면 409 (FR-GL-12)
      modal.error({ title: '계정과목 생성 불가', content: err.message });
    },
  });

  return (
    <div>
      <MasterScreen
        title="계정과목"
        endpoint="/finance/gl"
        idField="gl_id"
        headSpan={10}
        columns={[
          // 화면기획서 5-1 ② : 좌측 Head 는 계정구분·계정코드·계정과목 3컬럼
          {
            key: 'gl_type',
            title: '계정구분',
            width: 100,
            render: (r) => GL_TYPE_LABEL[String(r.gl_type) as GlType] ?? String(r.gl_type ?? ''),
          },
          { key: 'gl_id', title: '계정코드', width: 100 },
          { key: 'gl_name', title: '계정과목' },
        ]}
        renderForm={({ mode, form }) => (
          <>
            <Row gutter={8}>
              <Col span={8}>
                <Form.Item label="계정코드" name="gl_id" rules={[{ required: true, max: 10 }]}>
                  <Input disabled={mode === 'edit'} />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item label="계정과목명" name="gl_name" rules={[{ required: true, max: 100 }]}>
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col span={8}>
                <Form.Item label="계정구분" name="gl_type" rules={[{ required: true }]}>
                  <Select
                    options={Object.values(GlType).map((v) => ({ value: v, label: `${v} ${GL_TYPE_LABEL[v]}` }))}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="계정성격" name="gl_detail" initialValue={GlDetail.Normal}>
                  <Select
                    options={[
                      { value: GlDetail.Normal, label: '보통계정' },
                      { value: GlDetail.Contra, label: '차감항목' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="사용여부" name="status" initialValue={1}>
                  <Select options={ONE_ACTIVE} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={8}>
              <Col span={12}>
                <Form.Item label="부가세 구분" name="vat_gl">
                  <Select
                    allowClear
                    options={[
                      { value: VatGl.Purchase, label: '매입부가가치세' },
                      { value: VatGl.Sales, label: '매출부가가치세' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                {/* 자기참조 — 자기 자신 불가, 차감항목일 때만 (설계서 §7.4) */}
                <Form.Item label="차감계정 (contra_gl)" name="contra_gl">
                  <LookupPopup
                    endpoint="/finance/gl"
                    codeField="gl_id"
                    nameField="gl_name"
                    label="차감계정"
                    columns={[
                      { key: 'gl_id', title: '계정코드', width: 100 },
                      { key: 'gl_name', title: '계정과목' },
                    ]}
                    onSelect={(code) => form.setFieldValue('contra_gl', code)}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Card size="small" title="Layer3 사용플래그 12종 — 전표 입력영역 제어(FR-GL-06)">
              <Row>
                {FLAG_FIELDS.map((f) => (
                  <Col span={6} key={f.name}>
                    <Form.Item name={['flags', f.name]} valuePropName="checked" noStyle>
                      <Checkbox>{f.label}</Checkbox>
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </Card>
          </>
        )}
        toFormValues={(r) => ({
          ...r,
          flags: {
            bank: !!r.bank_id, team: !!r.Team_id, pod: !!r.pod_id, employee: !!r.employee_Id,
            client: !!r.client_id, vendor: !!r.vendor_id, due: !!r.due_date,
            dim1: !!r.dimension1, dim2: !!r.dimension2, dim3: !!r.dimension3,
            dim4: !!r.dimension4, dim5: !!r.dimension5,
          },
        })}
        toCreateBody={(v) => v}
        toUpdateBody={({ gl_id: _d, ...rest }) => rest}
      />
      <Card size="small" style={{ marginTop: 12 }}>
        <AppToolbar
          mode="view"
          hideDefaults={['search', 'create', 'edit', 'save', 'delete', 'cancel']}
          extras={[
            {
              key: 'gen',
              label: '계정과목 생성 (표준 GL)',
              type: 'primary',
              onClick: () =>
                modal.confirm({
                  title: '계정과목 생성 확인',
                  content:
                    '현재 로그인 회사의 기존 계정과목이 모두 삭제되고 표준 계정과목으로 재생성됩니다. ' +
                    '대상은 세션 회사로 고정이며 변경할 수 없습니다. 계속하시겠습니까?',
                  okText: '생성 실행',
                  okButtonProps: { danger: true },
                  onOk: () => generate.mutate(),
                }),
            },
          ]}
        />
      </Card>
    </div>
  );
}

/* ═════════════════ 관리항목 ═════════════════ */

export function DimensionScreen() {
  return (
    <MasterScreen
      title="관리항목"
      endpoint="/finance/dimensions"
      idField="dimension_id"
      columns={[
        { key: 'slot_no', title: 'Slot', width: 70 },
        { key: 'dimension_id', title: '코드', width: 100 },
        { key: 'dimension_name', title: '관리항목명' },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="finance_dimension" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode }) => (
        <>
          <Form.Item label="관리항목코드" name="dimension_id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="관리항목명" name="dimension_name" rules={[{ required: true, max: 100 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="사용여부" name="status" initialValue={1}>
            <Select options={ONE_ACTIVE} />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            회사당 최대 5개이며 Slot 은 최초 등록 순서로 자동 부여됩니다.
            <br />
            <strong>Slot 은 재정렬·재매핑되지 않습니다</strong> — 과거 전표의 dimension1~5 의미를 보존합니다(FR-Dim-05).
          </Typography.Paragraph>
        </>
      )}
      toCreateBody={(v) => v}
      toUpdateBody={({ dimension_id: _d, ...rest }) => rest}
    />
  );
}

/* ═════════════════ 은행/카드 ═════════════════ */

export function BankScreen() {
  return (
    <MasterScreen
      title="은행/카드"
      endpoint="/finance/bank-accounts"
      idField="bank_id"
      columns={[
        { key: 'bank_id', title: '코드', width: 90 },
        { key: 'bank_name', title: '명칭' },
        { key: 'bank_account', title: '계좌번호', width: 150 },
        { key: 'card_number_masked', title: '카드번호', width: 170 },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="finance_bank_account" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode }) => (
        <>
          <Form.Item label="코드" name="bank_id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="명칭" name="bank_name" rules={[{ required: true, max: 50 }]}><Input /></Form.Item>
          {/* 계좌 XOR 카드 — 정확히 하나만 (FR-Bank-05) */}
          <Form.Item label="계좌번호" name="bank_account" extra="계좌와 카드 중 하나만 입력합니다.">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item label="카드번호" name="card_number" extra="저장 후에는 뒤 4자리만 표시됩니다.">
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item label="사용여부" name="status" initialValue={0}>
            <Select options={ZERO_ACTIVE} />
          </Form.Item>
        </>
      )}
      toFormValues={(r) => ({ ...r, card_number: undefined })}
      toCreateBody={(v) => v}
      toUpdateBody={({ bank_id: _d, ...rest }) => rest}
    />
  );
}

/* ═════════════════ 마감관리 (화면기획서 5-6) ═════════════════ */

interface ClosingRow {
  company_year_id: string;
  company_year: number;
  actual_year: number;
  closing: number;
  closing_date: string | null;
  prior_year_open: number;
}

export function ClosingScreen() {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['/finance/closings'],
    queryFn: () => http.get<Paged<ClosingRow>>('/finance/closings'),
  });
  const rows = data?.items ?? [];

  const run = useMutation({
    mutationFn: (yearId: string) =>
      http.post<{ carried_rows: number; next_year_id: string }>(`/finance/closings/${yearId}/execute`),
    onSuccess: async (r) => {
      message.success(`마감 완료 — 차년도(${r.next_year_id}) 이월 ${r.carried_rows}건 생성`);
      await qc.invalidateQueries({ queryKey: ['/finance/closings'] });
    },
    onError: (e) => modal.error({ title: '마감 불가', content: (e as ApiError).message }),
  });

  const reopen = useMutation({
    mutationFn: (yearId: string) =>
      http.post<{ removed_rows: number }>(`/finance/closings/${yearId}/reopen`),
    onSuccess: async (r) => {
      message.success(`마감 해제 완료 — 차년도 자동생성 이월 ${r.removed_rows}건 회수`);
      await qc.invalidateQueries({ queryKey: ['/finance/closings'] });
    },
    onError: (e) => modal.error({ title: '마감 해제 불가', content: (e as ApiError).message }),
  });

  return (
    <Card size="small" title="마감관리 — 기수·연도별 회계마감 현황">
      {/* 툴바 구성이 표준 6버튼과 다르다: 조회 · 마감 · 취소 (화면기획서 5-6-A) */}
      <AppToolbar
        mode="view"
        loading={isFetching}
        onSearch={() => void refetch()}
        hideDefaults={['create', 'edit', 'save', 'delete', 'cancel']}
      />
      <Table<ClosingRow>
        size="small"
        rowKey="company_year_id"
        loading={isFetching}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '기수코드', dataIndex: 'company_year_id', width: 110 },
          { title: '기수', dataIndex: 'company_year', width: 70 },
          { title: '연도', dataIndex: 'actual_year', width: 80 },
          {
            title: '마감여부',
            width: 100,
            render: (_, r) => <ClosingBadge closed={r.closing} />,
          },
          {
            title: '마감일자',
            width: 120,
            render: (_, r) => (r.closing_date ? String(r.closing_date).slice(0, 10) : '—'),
          },
          {
            title: '비고',
            render: (_, r) =>
              r.closing
                ? '마감 완료 — 재마감 불가, 전표·초기이월 조회만 가능'
                : r.prior_year_open
                  ? '선행연도 미마감 — 후행 마감 제한'
                  : '마감 가능',
          },
          {
            title: '작업',
            width: 190,
            render: (_, r) => {
              if (r.closing) {
                return (
                  <a
                    onClick={() =>
                      modal.confirm({
                        title: `${r.actual_year}년 회계마감 해제`,
                        content:
                          '차년도 자동생성 이월이 회수되고 해당 연도에 신규 전표 등록이 가능해집니다. ' +
                          '해제는 늦은 연도부터 순차로만 가능합니다. ' +
                          '단, 기존 승인 전표는 승인취소 기능이 없어 여전히 편집할 수 없습니다.',
                        okText: '해제 실행',
                        okButtonProps: { danger: true },
                        onOk: () => reopen.mutate(r.company_year_id),
                      })
                    }
                  >
                    마감 해제
                  </a>
                );
              }
              return (
                <a
                  onClick={() =>
                    modal.confirm({
                      title: `${r.actual_year}년 회계마감`,
                      content:
                        '선행조건(선행연도 마감·차년도 기수 존재·미승인 전표 0건·차년도 이월 미존재)을 ' +
                        '검증한 뒤 차년도 이월을 생성합니다. 잔액계산은 승인 전표만 포함합니다.',
                      okText: '마감 실행',
                      onOk: () => run.mutate(r.company_year_id),
                    })
                  }
                  style={{ opacity: r.prior_year_open ? 0.4 : 1, pointerEvents: r.prior_year_open ? 'none' : 'auto' }}
                >
                  마감 실행
                </a>
              );
            },
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        이월 대상은 자산·부채·자본(gl_type 0~2)만이며, 집계 단위는 계정+은행/카드+고객사+거래처입니다.
        <br />
        자산 = 전년이월 + 당해차변 − 당해대변 → 차변 이월 · 부채/자본 = 전년이월 + 당해대변 − 당해차변 → 대변 이월.
        <br />
        자동생성 이월은 <Money value={-1} /> 처럼 <strong>음수가 될 수 있습니다</strong>(부호를 살려 표시합니다).
      </Typography.Paragraph>
    </Card>
  );
}
