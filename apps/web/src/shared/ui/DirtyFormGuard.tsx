import { Modal } from 'antd';
import { useCallback, useEffect } from 'react';

/**
 * 미저장 변경 보호 (지침 §22, FR-UI-06).
 *
 * 신규/수정 모드에서 다른 Head 행 선택·재조회·메뉴 이동·브라우저 이동·취소·
 * 회사/그룹 조건 변경 시 확인을 받는다.
 */
export function useDirtyGuard(dirty: boolean) {
  // 브라우저 이동(새로고침·닫기)
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /** 화면 내 이동(행 선택·재조회·메뉴 이동) 전에 호출한다. */
  const confirmLeave = useCallback(
    (onProceed: () => void) => {
      if (!dirty) return onProceed();
      Modal.confirm({
        title: '저장하지 않은 변경이 있습니다',
        content: '변경 내용을 버리고 이동하시겠습니까?',
        okText: '버리고 이동',
        cancelText: '머무르기',
        onOk: onProceed,
      });
    },
    [dirty],
  );

  return { confirmLeave };
}
