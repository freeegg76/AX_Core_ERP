import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthUser } from '../auth/auth-user';

/** 로그에서 절대 남기지 않는 필드 (설계서 §11.1 · §6.1) */
const MASKED_FIELDS = new Set([
  'password',
  'new_password',
  'current_password',
  'newPassword',
  'currentPassword',
  'init_password',
  'initPassword',
  'user_pass',
  'userPass',
  'card_number',
  'cardNumber',
  'new_pass_hash',
]);

function maskBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(maskBody);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = MASKED_FIELDS.has(k) ? '***' : maskBody(v);
  }
  return out;
}

/**
 * 쓰기 요청 감사 로깅 (설계서 §11.1).
 *
 * user_id · IP · 경로 · 결과코드를 기록한다. 비밀번호·카드번호는 마스킹한다.
 *
 * ⚠ 이 로그의 중요성 — `insert_date`/`update_date`/`closed_date`/`closing_date` 가
 * `date`(일 단위)이므로(D8), **초 단위 행위 이력은 이 로그가 유일한 근거**다.
 * 보존기간을 감사 요건에 맞춰 설정한다. (`approved_date` 만 datetime2(0) 로 상향됨)
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');
  private static readonly WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!AuditInterceptor.WRITE_METHODS.has(req.method)) return next.handle();

    const started = Date.now();
    const who = req.user?.userId ?? 'anonymous';
    const scope = req.user ? `${req.user.companyId}/${req.user.entityId}` : '-';
    const ip = req.ip ?? req.socket?.remoteAddress ?? '-';
    // DELETE 등 body 가 없는 요청에서 JSON.stringify(undefined) 는 문자열이 아닌
    // undefined 를 돌려주므로 반드시 기본값을 둔다.
    const raw = JSON.stringify(maskBody(req.body)) ?? '-';
    const body = raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;

    const write = (outcome: string) =>
      this.logger.log(
        `${req.method} ${req.originalUrl} user=${who} scope=${scope} ip=${ip} ` +
          `${outcome} ${Date.now() - started}ms body=${body}`,
      );

    return next.handle().pipe(
      tap({
        next: () => write('result=OK'),
        error: (e: { axCode?: string; status?: number }) =>
          write(`result=${e?.axCode ?? e?.status ?? 'ERR'}`),
      }),
    );
  }
}
