import { SetMetadata } from '@nestjs/common';

/** 인증 없이 접근 가능 — POST /auth/login, POST /auth/refresh 만 해당(설계서 §6.2). */
export const IS_PUBLIC_KEY = 'ax:public';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
