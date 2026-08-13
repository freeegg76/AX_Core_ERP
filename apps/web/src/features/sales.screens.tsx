import { Form, Input, InputNumber, Select } from 'antd';
import {
  CONTRACT_STATUS_LABEL,
  CONTRACT_TYPE_LABEL,
  ContractStatus,
  ContractType,
  PIPELINE_STAGE_LABEL,
  PIPELINE_TYPE_LABEL,
  PipelineStage,
  PipelineType,
} from '@ax-bridge/shared-constants';
import { MasterScreen } from './MasterScreen';
import { LookupPopup, Money, StageBadge } from '../shared/ui';

export function PipelineScreen() {
  return (
    <MasterScreen
      title="파이프라인"
      endpoint="/sales/pipelines"
      idField="pipeline_id"
      columns={[
        { key: 'pipeline_id', title: '코드', width: 100 },
        { key: 'client_name', title: '고객사명' },
        {
          key: 'stage',
          title: '스테이지',
          width: 110,
          render: (r) => <StageBadge stage={String(r.stage)} />,
        },
        { key: 'employee_Id', title: '담당자', width: 90 },
      ]}
      renderForm={({ mode, form }) => (
        <>
          <Form.Item label="파이프라인 코드" name="pipeline_id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="유형" name="pipeline_type" rules={[{ required: true }]} initialValue={PipelineType.Agency}>
            <Select
              options={Object.values(PipelineType).map((v) => ({ value: v, label: PIPELINE_TYPE_LABEL[v] }))}
            />
          </Form.Item>
          {/* client_name 은 문자열이다. 계약 연결 시 계약 고객사명과 일치해야 한다(FR-Pipe-08). */}
          <Form.Item label="고객사명" name="client_name">
            <LookupPopup
              endpoint="/partner/clients"
              codeField="client_name"
              nameField="client_name"
              label="고객사"
              columns={[
                { key: 'client_id', title: '코드', width: 90 },
                { key: 'client_name', title: '고객사명' },
              ]}
              onSelect={(_code, name) => form.setFieldValue('client_name', name)}
            />
          </Form.Item>
          {/*
            stage 전환은 Domain 메서드(close/cancel/reopen)를 경유한다 —
            별도 엔드포인트가 아니라 이 PUT 하나로 처리된다(설계서 §11.3).
            closed_date 는 트리거가 관리하므로 화면이 보내지 않는다.
          */}
          <Form.Item label="스테이지" name="stage" initialValue={PipelineStage.Lead}>
            <Select
              options={Object.values(PipelineStage).map((v) => ({ value: v, label: PIPELINE_STAGE_LABEL[v] }))}
            />
          </Form.Item>
          <Form.Item label="담당자" name="employee_id">
            <LookupPopup
              endpoint="/system/employees"
              codeField="employee_Id"
              nameField="employee_name"
              label="담당자"
              columns={[
                { key: 'employee_Id', title: '사번', width: 90 },
                { key: 'employee_name', title: '이름' },
              ]}
              onSelect={(code) => form.setFieldValue('employee_id', code)}
            />
          </Form.Item>
          <Form.Item label="비고" name="note"><Input.TextArea rows={2} maxLength={255} /></Form.Item>
        </>
      )}
      toFormValues={(r) => ({ ...r, employee_id: r.employee_Id })}
      toCreateBody={(v) => v}
      toUpdateBody={({ pipeline_id: _d, ...rest }) => rest}
    />
  );
}

export function ContractScreen() {
  return (
    <MasterScreen
      title="계약"
      endpoint="/sales/contracts"
      idField="contract_id"
      columns={[
        { key: 'contract_id', title: '계약코드', width: 110 },
        {
          key: 'contract_type',
          title: '유형',
          width: 100,
          render: (r) => CONTRACT_TYPE_LABEL[String(r.contract_type) as ContractType] ?? String(r.contract_type),
        },
        { key: 'client_id', title: '고객사', width: 90 },
        {
          key: 'contract_amount',
          title: '계약금액',
          width: 120,
          render: (r) => <Money value={r.contract_amount as number} />,
        },
        {
          key: 'status',
          title: '상태',
          width: 90,
          render: (r) => CONTRACT_STATUS_LABEL[String(r.status) as ContractStatus] ?? String(r.status),
        },
      ]}
      renderForm={({ mode, form }) => (
        <>
          {/* PK 가 (contract_id, contract_type) 복합키다 — 수정 시 둘 다 읽기전용 */}
          <Form.Item label="계약코드" name="contract_id" rules={[{ required: true, max: 20 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="계약유형" name="contract_type" rules={[{ required: true }]} initialValue={ContractType.Agency}>
            <Select
              disabled={mode === 'edit'}
              options={Object.values(ContractType).map((v) => ({ value: v, label: CONTRACT_TYPE_LABEL[v] }))}
            />
          </Form.Item>
          <Form.Item label="고객사" name="client_id" rules={[{ required: true }]}>
            <LookupPopup
              endpoint="/partner/clients"
              codeField="client_id"
              nameField="client_name"
              label="고객사"
              columns={[
                { key: 'client_id', title: '코드', width: 90 },
                { key: 'client_name', title: '고객사명' },
              ]}
              onSelect={(code) => form.setFieldValue('client_id', code)}
            />
          </Form.Item>
          <Form.Item label="계약 시작일" name="start_date" rules={[{ required: true }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="계약 종료일" name="end_date" rules={[{ required: true }]}>
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="계약금액" name="contract_amount">
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            />
          </Form.Item>
          <Form.Item label="상태" name="status" initialValue={ContractStatus.Active}>
            <Select
              options={Object.values(ContractStatus).map((v) => ({ value: v, label: CONTRACT_STATUS_LABEL[v] }))}
            />
          </Form.Item>
          {/* 실제 종료/해지일 — 약정 종료일(end_date)과 구분한다(FR-Contract-06) */}
          <Form.Item label="실제 종료일 (해지)" name="closed_date">
            <Input placeholder="YYYY-MM-DD" />
          </Form.Item>
        </>
      )}
      toFormValues={(r) => ({
        ...r,
        start_date: r.start_date ? String(r.start_date).slice(0, 10) : undefined,
        end_date: r.end_date ? String(r.end_date).slice(0, 10) : undefined,
        closed_date: r.closed_date ? String(r.closed_date).slice(0, 10) : undefined,
      })}
      toCreateBody={(v) => v}
      // 복합키라 서버 경로가 /{contractId}/{contractType} 다. MasterScreen 의 단일키
      // 규약과 달라 수정은 계약유형까지 경로에 붙여야 하므로 여기서는 등록·조회만 제공한다.
      toUpdateBody={(v) => v}
      noDelete
    />
  );
}
