import { BadRequestException } from '@nestjs/common';
import { EmploymentStatus, SaveMode } from '@ax-bridge/shared-constants';
import { EmployeeAccountPolicy, type AccountCheck } from './employee-account.policy';

const policy = new EmployeeAccountPolicy();

const check = (p: Partial<AccountCheck> = {}): AccountCheck => ({
  mode: SaveMode.Insert,
  userYn: true,
  userId: 'jdoe',
  hasPassword: true,
  status: EmploymentStatus.Active,
  ...p,
});

describe('EmployeeAccountPolicy — 사용자 계정 (FR-Emp-04/05)', () => {
  it('사용자 계정 신규 등록의 정상 조합은 통과한다', () => {
    expect(() => policy.assertValid(check())).not.toThrow();
  });

  it('user_yn=Y 인데 user_id 가 없으면 거부한다', () => {
    expect(() => policy.assertValid(check({ userId: undefined })))
      .toThrow(BadRequestException);
    expect(() => policy.assertValid(check({ userId: undefined })))
      .toThrow('로그인 ID(user_id)가 필요합니다.');
  });

  it('공백만 있는 user_id 는 없는 것으로 본다', () => {
    expect(() => policy.assertValid(check({ userId: '   ' })))
      .toThrow('로그인 ID(user_id)가 필요합니다.');
  });

  it('FR-Emp-05: 신규 등록에는 초기 비밀번호가 필요하다', () => {
    expect(() => policy.assertValid(check({ mode: SaveMode.Insert, hasPassword: false })))
      .toThrow('사용자 계정을 만들려면 초기 비밀번호가 필요합니다.');
  });

  it('FR-Emp-05: 수정 시 비밀번호 미입력은 "기존 해시 유지"라 허용한다', () => {
    expect(() => policy.assertValid(check({ mode: SaveMode.Update, hasPassword: false })))
      .not.toThrow();
  });

  it('user_yn=N 이면 user_id 를 지정할 수 없다', () => {
    expect(() => policy.assertValid(check({ userYn: false, userId: 'jdoe' })))
      .toThrow('사용자 여부가 N 이면 로그인 ID 를 지정할 수 없습니다.');
  });

  it('user_yn=N 이고 user_id 도 없으면 통과한다 — 로그인하지 않는 직원', () => {
    expect(() => policy.assertValid(check({ userYn: false, userId: undefined, hasPassword: false })))
      .not.toThrow();
  });
});

describe('EmployeeAccountPolicy — 재직상태 (FR-Emp-07)', () => {
  it('inactive 인데 계정을 켜두면 거부한다 — 인증 차단 상태이기 때문이다', () => {
    expect(() => policy.assertValid(check({ status: EmploymentStatus.Inactive })))
      .toThrow('퇴사(inactive) 상태에서는 사용자 계정을 유지할 수 없습니다.');
  });

  it('inactive 라도 계정이 없으면 통과한다', () => {
    expect(() => policy.assertValid(check({
      status: EmploymentStatus.Inactive, userYn: false, userId: undefined, hasPassword: false,
    }))).not.toThrow();
  });

  it.each([
    EmploymentStatus.Planned,
    EmploymentStatus.Probation,
    EmploymentStatus.Active,
    EmploymentStatus.OnLeave,
    EmploymentStatus.LeavingSoon,
  ])('%s 상태에서는 계정을 유지할 수 있다 — 차단되는 것은 inactive 뿐이다', (status) => {
    expect(() => policy.assertValid(check({ status }))).not.toThrow();
  });

  it('user_id 누락과 inactive 가 겹치면 user_id 오류를 먼저 알린다', () => {
    expect(() => policy.assertValid(check({ userId: undefined, status: EmploymentStatus.Inactive })))
      .toThrow('로그인 ID(user_id)가 필요합니다.');
  });
});
