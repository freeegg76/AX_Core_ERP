import { BadRequestException, Injectable } from '@nestjs/common';
import { EmploymentStatus, SaveMode } from '@ax-bridge/shared-constants';

export interface AccountCheck {
  mode: SaveMode;
  userYn: boolean;
  userId?: string;
  hasPassword: boolean;
  status: EmploymentStatus;
}

/**
 * 직원 사용자계정 정책 (FR-Emp-04/05/07).
 *
 * Domain 계층이므로 NestJS·Prisma 타입에 의존하지 않는 순수 규칙이어야 한다.
 * (`@Injectable()` 은 DI 편의를 위한 것이고 로직은 프레임워크와 무관하다.)
 *
 * 이 규칙들은 프로시저에도 있지만, 지침 §29 에 따라 **UI/Controller 의 단순 if 가
 * 아니라 Domain 이 1차 권위를 갖도록** 여기에 표현한다. 오류 UX·테스트성이 목적이다.
 */
@Injectable()
export class EmployeeAccountPolicy {
  assertValid(c: AccountCheck): void {
    if (c.userYn) {
      if (!c.userId?.trim()) {
        throw new BadRequestException('사용자 여부가 Y 이면 로그인 ID(user_id)가 필요합니다.');
      }
      // 신규 등록 시에는 초기 비밀번호가 있어야 로그인이 가능해진다.
      // 수정 시 미입력은 "기존 해시 유지"를 뜻하므로 허용한다(FR-Emp-05).
      if (c.mode === SaveMode.Insert && !c.hasPassword) {
        throw new BadRequestException('사용자 계정을 만들려면 초기 비밀번호가 필요합니다.');
      }
    } else if (c.userId?.trim()) {
      throw new BadRequestException('사용자 여부가 N 이면 로그인 ID 를 지정할 수 없습니다.');
    }

    // inactive 는 인증 차단 상태다(FR-Emp-07). 계정을 켜둔 채 퇴사 처리하는 것을 막는다.
    if (c.status === EmploymentStatus.Inactive && c.userYn) {
      throw new BadRequestException('퇴사(inactive) 상태에서는 사용자 계정을 유지할 수 없습니다.');
    }
  }
}
