import { useAuthStore } from '../../app/auth.store';

const BASE = '/api/v1';

/** 서버 공통 응답 포맷 (설계서 §11.1) */
type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/** 페이징 응답 — 페이징은 서버 Query Service 가 구현한다(D2) */
export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

/** AX-50xxx 코드와 한글 메시지를 그대로 보존하는 오류 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 재발급 재시도를 막기 위한 내부 플래그 */
  _retried?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE}${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

/**
 * API 클라이언트.
 *
 * ⚠ `company_id` / `entity_id` 를 **요청에 넣지 않는다** — 서버가 JWT claim 에서
 * 꺼낸다(FR-Bank-08). 헤더로 보내도 claim 과 다르면 403 이다.
 * 401 을 만나면 refresh 를 1회 시도한 뒤 실패하면 로그아웃한다.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = opts;
  const token = useAuthStore.getState().accessToken;

  const res = await fetch(buildUrl(path, query), {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  if (res.status === 401 && !opts._retried) {
    const refreshed = await useAuthStore.getState().tryRefresh();
    if (refreshed) return api<T>(path, { ...opts, _retried: true });
    useAuthStore.getState().logout();
    throw new ApiError('AX-HTTP-401', '세션이 만료되었습니다. 다시 로그인하세요.', 401);
  }

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!res.ok || !json || json.success === false) {
    const err = json && json.success === false ? json.error : null;
    throw new ApiError(
      err?.code ?? `AX-HTTP-${res.status}`,
      err?.message ?? '요청 처리 중 오류가 발생했습니다.',
      res.status,
    );
  }

  return json.data;
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query']) => api<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};
