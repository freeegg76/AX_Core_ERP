import { App, Button, Form, Input, InputNumber, Select, Space, Typography } from 'antd';
import { useState } from 'react';
import { PaymentBaseRule } from '@ax-bridge/shared-constants';
import { http } from '../shared/api/client';
import { MasterScreen } from './MasterScreen';
import { ActiveBadge, LookupPopup } from '../shared/ui';

/** partner_* 계열의 사용여부 — **활성 = 1** 이다(설계서 §9.9. system_* 와 반대) */
const ONE_ACTIVE_OPTIONS = [
  { value: 1, label: '사용' },
  { value: 0, label: '미사용' },
];

/** 지급일 계산 미리보기 (화면기획서 5-3-C) */
function DueDatePreview({ termId }: { termId: string | null }) {
  const { message } = App.useApp();
  const [baseDate, setBaseDate] = useState('');
  const [result, setResult] = useState<string | null>(null);

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text type="secondary">지급일 계산 미리보기</Typography.Text>
      <Space>
        <Input
          placeholder="기준일 YYYY-MM-DD"
          value={baseDate}
          onChange={(e) => setBaseDate(e.target.value)}
          style={{ width: 160 }}
        />
        <Button
          disabled={!termId || !baseDate}
          onClick={async () => {
            try {
              const r = await http.get<{ due_date: string | null }>(
                `/partner/terms/${encodeURIComponent(termId!)}/due-date`,
                { base_date: baseDate },
              );
              setResult(r.due_date);
            } catch (e) {
              message.error((e as Error).message);
            }
          }}
        >
          계산
        </Button>
        {result && <Typography.Text strong>→ {result}</Typography.Text>}
      </Space>
    </Space>
  );
}

export function TermScreen() {
  return (
    <MasterScreen
      title="지급/수금정책"
      endpoint="/partner/terms"
      idField="term_id"
      columns={[
        { key: 'term_id', title: '정책코드', width: 110 },
        { key: 'base_rule', title: '기준', width: 80 },
        { key: 'term_condition', title: '정책식', width: 110 },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="partner_term" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode, form, selected }) => {
        const rule = form.getFieldValue('base_rule');
        return (
          <>
            <Form.Item label="정책코드" name="term_id" rules={[{ required: true, max: 10 }]}>
              <Input disabled={mode === 'edit'} />
            </Form.Item>
            <Form.Item label="기준규칙" name="base_rule" rules={[{ required: true }]} initialValue={PaymentBaseRule.EndOfMonth}>
              <Select
                options={[
                  { value: PaymentBaseRule.EndOfMonth, label: 'EOM — 기준월 말일 + N일' },
                  { value: PaymentBaseRule.CurrentMonth, label: 'CURM — 기준월 DD일' },
                ]}
              />
            </Form.Item>
            {/* CK_term_shape: EOM → fixed_day NULL / CURM → fixed_day 1~31 & offset 0 */}
            <Form.Item
              label="offset_days (EOM 전용)"
              name="offset_days"
              initialValue={0}
              extra="EOM 에서만 사용합니다. CURM 이면 0 이어야 합니다."
            >
              <InputNumber min={0} max={999} disabled={rule === PaymentBaseRule.CurrentMonth} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="fixed_day (CURM 전용)"
              name="fixed_day"
              extra="CURM 에서만 사용합니다. 월말을 넘으면 월말로 보정됩니다."
            >
              <InputNumber min={1} max={31} disabled={rule !== PaymentBaseRule.CurrentMonth} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="사용여부" name="status" initialValue={1}>
              <Select options={ONE_ACTIVE_OPTIONS} />
            </Form.Item>
            {mode === 'view' && <DueDatePreview termId={selected ? String(selected.term_id) : null} />}
          </>
        );
      }}
      toCreateBody={(v) => v}
      toUpdateBody={({ term_id: _d, ...rest }) => rest}
    />
  );
}

function partnerFormItems(kind: 'client' | 'vendor', mode: string, form: { setFieldValue: (n: string, v: unknown) => void }) {
  const isClient = kind === 'client';
  const idName = isClient ? 'client_id' : 'vendor_id';
  const nameName = isClient ? 'client_name' : 'vendor_name';
  const termName = isClient ? 'collecting_type' : 'payment_type';
  return (
    <>
      <Form.Item label={isClient ? '고객사코드' : '거래처코드'} name={idName} rules={[{ required: true, max: 10 }]}>
        <Input disabled={mode === 'edit'} />
      </Form.Item>
      <Form.Item label={isClient ? '고객사명' : '거래처명'} name={nameName} rules={[{ required: true, max: 50 }]}>
        <Input />
      </Form.Item>
      <Form.Item label={isClient ? '수금정책' : '지급정책'} name={termName}>
        <LookupPopup
          endpoint="/partner/terms"
          codeField="term_id"
          nameField="term_condition"
          label="정책"
          columns={[
            { key: 'term_id', title: '정책코드', width: 110 },
            { key: 'term_condition', title: '정책식' },
          ]}
          onSelect={(code) => form.setFieldValue(termName, code)}
        />
      </Form.Item>
      <Form.Item label="사업자번호" name="vat_id"><Input maxLength={20} /></Form.Item>
      <Form.Item label="대표자" name="RepName"><Input maxLength={50} /></Form.Item>
      <Form.Item label="주소" name="address"><Input maxLength={200} /></Form.Item>
      <Form.Item label="전화" name="PhoneNumber"><Input maxLength={20} /></Form.Item>
      <Form.Item label="사용여부" name="status" initialValue={1}>
        <Select options={ONE_ACTIVE_OPTIONS} />
      </Form.Item>
    </>
  );
}

export function ClientScreen() {
  return (
    <MasterScreen
      title="고객사"
      endpoint="/partner/clients"
      idField="client_id"
      columns={[
        { key: 'client_id', title: '고객사코드', width: 110 },
        { key: 'client_name', title: '고객사명' },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="partner_client" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode, form }) => partnerFormItems('client', mode, form)}
      toFormValues={(r) => ({ ...r, address: r.client_Address })}
      toCreateBody={(v) => v}
      toUpdateBody={({ client_id: _d, ...rest }) => rest}
    />
  );
}

export function VendorScreen() {
  return (
    <MasterScreen
      title="거래처"
      endpoint="/partner/vendors"
      idField="vendor_id"
      columns={[
        { key: 'vendor_id', title: '거래처코드', width: 110 },
        { key: 'vendor_name', title: '거래처명' },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="partner_vendor" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode, form }) => partnerFormItems('vendor', mode, form)}
      toFormValues={(r) => ({ ...r, address: r.vendor_Address })}
      toCreateBody={(v) => v}
      toUpdateBody={({ vendor_id: _d, ...rest }) => rest}
    />
  );
}
