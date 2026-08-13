import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** 성공 응답 포맷 (설계서 §11.1) */
export interface ApiOk<T> {
  success: true;
  data: T;
}

/** 페이징 응답 (D2 — 페이징은 Query Service 가 구현한다) */
export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

const RAW = Symbol('ax:raw-response');

/** 이 데코레이터가 붙은 핸들러는 래핑하지 않는다(204 등). */
export const RawResponse = () => (t: object, k: string, d: PropertyDescriptor) => {
  Reflect.defineMetadata(RAW, true, d.value);
  return d;
};

/**
 * 모든 성공 응답을 `{ success: true, data: … }` 로 감싼다.
 * 오류 응답은 AllExceptionsFilter 가 `{ success: false, error: {…} }` 로 만든다.
 */
@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isRaw = Reflect.getMetadata(RAW, ctx.getHandler()) === true;
    return next.handle().pipe(
      map((data) => (isRaw || data === undefined ? data : ({ success: true, data } as ApiOk<unknown>))),
    );
  }
}
