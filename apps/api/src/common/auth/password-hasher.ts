import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * 비밀번호 해시 (설계서 §6.1, FR-Emp-04/05, FR-Admin-03).
 *
 * · `user_pass varchar(255)` 에는 Argon2id 해시만 저장한다. 평문·복호화 금지.
 * · 해시 생성·검증은 **WAS 담당**이다. DB 는 저장만 한다.
 * · `usp_auth_get_credential` 이 반환한 해시는 어떤 API 응답에도 노출하지 않는다.
 * · `user_yn=0` 계정은 NOT NULL 충족용으로 `!LOCKED!<random>` 이 저장되어 있다 —
 *   Argon2 형식이 아니므로 verify 가 항상 실패한다(로그인 불가).
 */
@Injectable()
export class PasswordHasher {
  private readonly logger = new Logger(PasswordHasher.name);

  /** DB 가 로그인 불가 계정에 저장하는 접두어 (02 프로시저 규칙) */
  static readonly LOCKED_PREFIX = '!LOCKED!';

  private readonly opts: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB — OWASP 권장 하한
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plain: string): Promise<string> {
    const h = await argon2.hash(plain, this.opts);
    if (h.length > 255) throw new Error('해시 길이가 user_pass varchar(255) 를 초과한다');
    return h;
  }

  /**
   * 저장된 해시와 평문을 검증한다.
   * 형식이 Argon2 가 아니거나 LOCKED 계정이면 조용히 false 를 반환한다 —
   * 오류 메시지로 계정 상태를 추측할 수 없게 한다.
   */
  async verify(storedHash: string | null | undefined, plain: string): Promise<boolean> {
    if (!storedHash) return false;
    if (storedHash.startsWith(PasswordHasher.LOCKED_PREFIX)) return false;
    if (!storedHash.startsWith('$argon2')) {
      // bcrypt 등 레거시 해시가 섞여 있으면 여기서 분기한다. 현재는 미지원.
      this.logger.warn('Argon2 형식이 아닌 해시가 발견되었다 — 재설정이 필요하다');
      return false;
    }
    try {
      return await argon2.verify(storedHash, plain);
    } catch {
      return false;
    }
  }
}
