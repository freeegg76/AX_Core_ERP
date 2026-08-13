import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SqlProcedureError } from './sql-procedure.error';

/** 공통 응답 포맷 (설계서 §11.1) */
export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

/**
 * 전역 예외 필터 — THROW 50xxx → AX-50xxx → HTTP 상태.
 *
 * 프로시저가 만든 한글 메시지를 그대로 전달한다. 500 계열에서는 내부 메시지를
 * 노출하지 않는다(정보 누출 방지).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = 500;
    let code = 'AX-50000';
    let message = '서버 오류가 발생했습니다.';

    if (exception instanceof SqlProcedureError) {
      status = exception.httpStatus;
      code = exception.axCode;
      if (exception.isAppError) {
        message = exception.message;
      } else {
        this.logger.error(
          `[${req.method} ${req.originalUrl}] ${exception.procName ?? '-'} SQL#${exception.sqlNumber}: ${exception.message}`,
        );
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = `AX-HTTP-${status}`;
      if (typeof body === 'string') {
        message = body;
      } else {
        const b = body as { message?: string | string[] };
        message = Array.isArray(b.message) ? b.message.join(' / ') : (b.message ?? exception.message);
      }
    } else {
      this.logger.error(
        `[${req.method} ${req.originalUrl}] ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    const payload: ApiError = { success: false, error: { code, message } };
    res.status(status).json(payload);
  }
}
