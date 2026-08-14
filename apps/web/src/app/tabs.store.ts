import { create } from 'zustand';

export interface OpenTab {
  path: string;
  label: string;
}

interface TabsState {
  tabs: OpenTab[];
  /** 이미 열린 경로면 아무것도 하지 않는다 — 같은 메뉴를 두 번 눌러도 탭은 하나다. */
  open: (path: string, label: string) => void;
  close: (path: string) => void;
  reset: () => void;
}

/**
 * 상단 실행메뉴(탭) 스토어.
 *
 * 탭은 화면 상태일 뿐이라 저장하지 않는다 — 새로고침하면 현재 경로의 탭만
 * `AppLayout` 의 라우트 감시 effect 가 다시 만든다. 로그아웃 시에는 `reset()`
 * 으로 비워 다른 사용자에게 이전 작업 흔적이 남지 않게 한다.
 */
export const useTabsStore = create<TabsState>((set) => ({
  tabs: [],

  open(path, label) {
    set((s) => (s.tabs.some((t) => t.path === path) ? s : { tabs: [...s.tabs, { path, label }] }));
  },

  close(path) {
    set((s) => ({ tabs: s.tabs.filter((t) => t.path !== path) }));
  },

  reset() {
    set({ tabs: [] });
  },
}));
