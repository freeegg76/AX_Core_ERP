import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '@ax-bridge/shared-constants';

export interface SessionUser {
  userId: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  entityId: string;
  roles: Role[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  tryRefresh: () => Promise<boolean>;
  hasRole: (r: Role) => boolean;
}

/**
 * 인증 스토어.
 *
 * ⚠ `companyId`/`entityId` 는 **표시용**이다. 서버는 이 값을 신뢰하지 않고
 * JWT claim 에서 직접 꺼낸다(FR-Bank-08). 화면 조건으로 권한을 판단하지 않는다.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      async login(userId, password) {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, password }),
        });
        const json = await res.json();
        if (!res.ok || json.success === false) {
          throw new Error(json?.error?.message ?? '로그인에 실패했습니다.');
        }
        const d = json.data;
        set({ accessToken: d.access_token, refreshToken: d.refresh_token, user: d.user });
      },

      logout() {
        set({ accessToken: null, refreshToken: null, user: null });
      },

      async tryRefresh() {
        const rt = get().refreshToken;
        if (!rt) return false;
        try {
          const res = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: rt }),
          });
          const json = await res.json();
          if (!res.ok || json.success === false) return false;
          set({ accessToken: json.data.access_token });
          return true;
        } catch {
          return false;
        }
      },

      hasRole(r) {
        return get().user?.roles.includes(r) ?? false;
      },
    }),
    { name: 'ax-bridge-auth' },
  ),
);
