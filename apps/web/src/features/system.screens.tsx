import { Form, Input, Select } from 'antd';
import { EMPLOYMENT_STATUS_LABEL, EmploymentStatus } from '@ax-bridge/shared-constants';
import { MasterScreen } from './MasterScreen';
import { ActiveBadge, EmploymentBadge, LookupPopup } from '../shared/ui';

/** system_* 계열의 사용여부 — **활성 = 0** 이다(설계서 §9.9) */
const ZERO_ACTIVE_OPTIONS = [
  { value: 0, label: '사용' },
  { value: 1, label: '미사용' },
];

export function CompanyScreen() {
  return (
    <MasterScreen
      title="그룹"
      endpoint="/system/companies"
      idField="company_id"
      columns={[
        { key: 'company_id', title: '그룹코드', width: 110 },
        { key: 'company_name_ko', title: '그룹명' },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="system_company" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode }) => (
        <>
          <Form.Item label="그룹코드" name="company_id" rules={[{ required: true, max: 10 }]}>
            {/* 수정 시 식별키는 읽기전용 */}
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="그룹명(영문)" name="company_name" rules={[{ required: true, max: 50 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="그룹명(한글)" name="company_name_ko" rules={[{ required: true, max: 50 }]}>
            <Input />
          </Form.Item>
          <Form.Item label="비고" name="note"><Input.TextArea rows={2} maxLength={200} /></Form.Item>
          <Form.Item label="사용여부" name="status" initialValue={0}>
            <Select options={ZERO_ACTIVE_OPTIONS} />
          </Form.Item>
        </>
      )}
      toCreateBody={(v) => v}
      toUpdateBody={({ company_id: _drop, ...rest }) => rest}
    />
  );
}

export function EntityScreen() {
  return (
    <MasterScreen
      title="회사"
      endpoint="/system/entities"
      idField="entity_id"
      columns={[
        { key: 'entity_id', title: '회사코드', width: 110 },
        { key: 'entity_name_ko', title: '회사명' },
        { key: 'RepName', title: '대표자', width: 100 },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="system_entity" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode }) => (
        <>
          <Form.Item label="회사코드" name="entity_id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="회사명(영문)" name="entity_name" rules={[{ required: true, max: 50 }]}><Input /></Form.Item>
          <Form.Item label="회사명(한글)" name="entity_name_ko" rules={[{ required: true, max: 50 }]}><Input /></Form.Item>
          <Form.Item label="대표자" name="RepName"><Input maxLength={100} /></Form.Item>
          <Form.Item label="사업자번호" name="RegNum"><Input maxLength={20} /></Form.Item>
          <Form.Item label="법인번호" name="BizNum"><Input maxLength={20} /></Form.Item>
          <Form.Item label="주소" name="Address"><Input maxLength={255} /></Form.Item>
          <Form.Item label="사용여부" name="status" initialValue={0}>
            <Select options={ZERO_ACTIVE_OPTIONS} />
          </Form.Item>
        </>
      )}
      toCreateBody={(v) => v}
      toUpdateBody={({ entity_id: _d, ...rest }) => rest}
    />
  );
}

export function PodScreen() {
  return (
    <MasterScreen
      title="Pod"
      endpoint="/system/pods"
      idField="pod_id"
      columns={[
        { key: 'pod_id', title: 'Pod 코드', width: 100 },
        { key: 'pod_name', title: 'Pod 명' },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="system_pod" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode }) => (
        <>
          <Form.Item label="Pod 코드 (4자)" name="pod_id" rules={[{ required: true, max: 4 }]}>
            <Input disabled={mode === 'edit'} maxLength={4} />
          </Form.Item>
          <Form.Item label="Pod 명" name="pod_name" rules={[{ required: true, max: 200 }]}><Input /></Form.Item>
          <Form.Item label="사용여부" name="status" initialValue={0}>
            <Select options={ZERO_ACTIVE_OPTIONS} />
          </Form.Item>
        </>
      )}
      toCreateBody={(v) => v}
      toUpdateBody={({ pod_id: _d, ...rest }) => rest}
    />
  );
}

export function TeamScreen() {
  return (
    <MasterScreen
      title="부서"
      endpoint="/system/teams"
      idField="Team_id"
      columns={[
        { key: 'Team_id', title: '부서코드', width: 100 },
        { key: 'team_name_ko', title: '부서명' },
        { key: 'owner', title: '오너', width: 90 },
        { key: 'leader_user_id', title: '리더', width: 90 },
        {
          key: 'status',
          title: '사용여부',
          width: 90,
          render: (r) => <ActiveBadge table="system_team" status={r.status as boolean} />,
        },
      ]}
      renderForm={({ mode, form }) => (
        <>
          <Form.Item label="부서코드" name="Team_id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="부서명(영문)" name="team_name"><Input maxLength={200} /></Form.Item>
          <Form.Item label="부서명(한글)" name="team_name_ko"><Input maxLength={200} /></Form.Item>
          {/* 오너·리더는 직원이다. DDL 에 FK 가 없어 프로시저가 검증한다(순환참조). */}
          <Form.Item label="오너 (직원)" name="owner" rules={[{ required: true }]}>
            <LookupPopup
              endpoint="/system/employees"
              codeField="employee_Id"
              nameField="employee_name"
              label="오너"
              columns={[
                { key: 'employee_Id', title: '사번', width: 100 },
                { key: 'employee_name', title: '이름' },
                { key: 'title', title: '직위', width: 100 },
              ]}
              onSelect={(code) => form.setFieldValue('owner', code)}
            />
          </Form.Item>
          <Form.Item label="리더 (직원)" name="leader_user_id" rules={[{ required: true }]}>
            <LookupPopup
              endpoint="/system/employees"
              codeField="employee_Id"
              nameField="employee_name"
              label="리더"
              columns={[
                { key: 'employee_Id', title: '사번', width: 100 },
                { key: 'employee_name', title: '이름' },
              ]}
              onSelect={(code) => form.setFieldValue('leader_user_id', code)}
            />
          </Form.Item>
          <Form.Item label="Pod" name="pod_id">
            <LookupPopup
              endpoint="/system/pods"
              codeField="pod_id"
              nameField="pod_name"
              label="Pod"
              columns={[
                { key: 'pod_id', title: 'Pod', width: 90 },
                { key: 'pod_name', title: 'Pod 명' },
              ]}
              onSelect={(code) => form.setFieldValue('pod_id', code)}
            />
          </Form.Item>
          <Form.Item label="사용여부" name="status" initialValue={0}>
            <Select options={ZERO_ACTIVE_OPTIONS} />
          </Form.Item>
        </>
      )}
      toCreateBody={({ Team_id, ...rest }) => ({ team_id: Team_id, ...rest })}
      toUpdateBody={({ Team_id: _d, ...rest }) => rest}
    />
  );
}

export function EmployeeScreen() {
  return (
    <MasterScreen
      title="직원"
      endpoint="/system/employees"
      idField="employee_Id"
      headSpan={11}
      columns={[
        { key: 'employee_Id', title: '사번', width: 90 },
        { key: 'employee_name', title: '이름', width: 100 },
        {
          key: 'status',
          title: '재직상태',
          width: 90,
          render: (r) => <EmploymentBadge status={String(r.status)} />,
        },
        { key: 'user_id', title: '로그인ID', width: 100 },
      ]}
      renderForm={({ mode, form }) => (
        <>
          {/* 화면기획서 5-5: 항목이 많아 기본정보/계정정보를 구분한다.
              비밀번호·해시는 어느 쪽에도 표시하지 않는다. */}
          <Form.Item label="사번" name="employee_Id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item label="이름" name="employee_name" rules={[{ required: true, max: 40 }]}><Input /></Form.Item>
          <Form.Item label="부서" name="Team_id" rules={[{ required: true }]}>
            <LookupPopup
              endpoint="/system/teams"
              codeField="Team_id"
              nameField="team_name_ko"
              label="부서"
              columns={[
                { key: 'Team_id', title: '부서코드', width: 100 },
                { key: 'team_name_ko', title: '부서명' },
              ]}
              onSelect={(code) => form.setFieldValue('Team_id', code)}
            />
          </Form.Item>
          <Form.Item label="이메일" name="email"><Input type="email" maxLength={100} /></Form.Item>
          <Form.Item label="직위" name="title"><Input maxLength={40} /></Form.Item>
          <Form.Item label="재직상태" name="status" rules={[{ required: true }]} initialValue={EmploymentStatus.Active}>
            <Select
              options={Object.values(EmploymentStatus).map((v) => ({
                value: v,
                label: EMPLOYMENT_STATUS_LABEL[v],
              }))}
            />
          </Form.Item>
          <Form.Item label="사용자 계정" name="user_yn" initialValue={false}>
            <Select
              options={[
                { value: false, label: 'N — 로그인 불가' },
                { value: true, label: 'Y — 로그인 사용' },
              ]}
            />
          </Form.Item>
          <Form.Item label="로그인 ID" name="user_id">
            <Input maxLength={20} placeholder="사용자 계정이 Y 일 때만" />
          </Form.Item>
          <Form.Item
            label="초기 비밀번호"
            name="init_password"
            extra="미입력 시 기존 비밀번호를 유지합니다. 서버가 Argon2id 로 해시합니다."
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </>
      )}
      toFormValues={(r) => ({ ...r, init_password: undefined })}
      toCreateBody={({ employee_Id, Team_id, ...rest }) => ({
        employee_id: employee_Id,
        team_id: Team_id,
        ...rest,
      })}
      toUpdateBody={({ employee_Id: _d, Team_id, ...rest }) => ({ team_id: Team_id, ...rest })}
    />
  );
}

export function YearScreen() {
  return (
    <MasterScreen
      title="회사 기수"
      endpoint="/system/years"
      idField="companyYearId"
      columns={[
        { key: 'companyYearId', title: '기수코드', width: 110 },
        { key: 'companyYear', title: '기수', width: 80 },
        { key: 'actualYear', title: '연도', width: 90 },
      ]}
      renderForm={({ mode }) => (
        <>
          <Form.Item label="기수코드" name="company_year_id" rules={[{ required: true, max: 10 }]}>
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          {/* DB 는 numeric(10,2) 지만 정수로만 다룬다(D6 — 경계에서 변환) */}
          <Form.Item label="기수" name="company_year" rules={[{ required: true }]}>
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item label="실제 연도" name="actual_year" rules={[{ required: true }]}>
            <Input type="number" min={1000} max={9999} />
          </Form.Item>
        </>
      )}
      toFormValues={(r) => ({
        company_year_id: r.companyYearId,
        company_year: r.companyYear,
        actual_year: r.actualYear,
      })}
      toCreateBody={(v) => v}
      toUpdateBody={({ company_year_id: _d, ...rest }) => rest}
    />
  );
}
