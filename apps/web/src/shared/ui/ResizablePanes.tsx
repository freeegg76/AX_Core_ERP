import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface ResizablePanesProps {
  /** 화면별로 폭을 기억하는 키 (localStorage) */
  storageKey: string;
  /** 초기 폭 비율(%) — 자녀 수와 길이가 같고 합이 100 이어야 한다 */
  initial: number[];
  children: ReactNode[];
  /** 패널 최소 폭(%) */
  min?: number;
  /** 분할바 두께(px) */
  barWidth?: number;
}

const STORAGE_PREFIX = 'ax-panes:';

function load(key: string, expectedLen: number): number[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || v.length !== expectedLen) return null;
    if (!v.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;
    return v as number[];
  } catch {
    return null;
  }
}

/**
 * 드래그로 폭을 조절하는 좌우 분할 패널.
 *
 * 설계서 §12.1(공통 UI 재사용, 화면별 중복 구현 금지)에 따라 화면마다 따로 만들지 않는다.
 * 조절한 폭은 `storageKey` 별로 localStorage 에 남아 다음 방문에도 유지된다.
 *
 * · 분할바 드래그 → **인접한 두 패널만** 조정한다(전체 레이아웃이 흔들리지 않는다)
 * · 분할바 더블클릭 → 초기 비율 복원
 * · 분할바 포커스 후 ←/→ (Shift 로 크게) → 키보드 조절
 */
export function ResizablePanes({
  storageKey,
  initial,
  children,
  min = 12,
  barWidth = 8,
}: ResizablePanesProps) {
  const panes = children.length;
  const [sizes, setSizes] = useState<number[]>(() => load(storageKey, panes) ?? initial);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startX: number; a: number; b: number } | null>(null);
  /** 최신 sizes 를 이벤트 핸들러에서 읽기 위한 참조 */
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;

  // 자녀 수가 바뀌면 저장값을 버리고 초기 비율로 돌아간다.
  useEffect(() => {
    if (sizesRef.current.length !== panes) setSizes(initial);
  }, [panes, initial]);

  const persist = useCallback(
    (next: number[]) => {
      try {
        localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(next));
      } catch {
        /* 저장 실패는 무시한다 — 폭 유지는 편의 기능이다 */
      }
    },
    [storageKey],
  );

  /** 인접 두 패널 사이에서만 폭을 주고받는다. 최소 폭을 넘으면 되돌린다. */
  const applyDelta = useCallback(
    (index: number, deltaPct: number, base: { a: number; b: number }) => {
      setSizes((prev) => {
        const next = [...prev];
        let a = base.a + deltaPct;
        let b = base.b - deltaPct;
        if (a < min) {
          b -= min - a;
          a = min;
        }
        if (b < min) {
          a -= min - b;
          b = min;
        }
        next[index] = a;
        next[index + 1] = b;
        return next;
      });
    },
    [min],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const el = containerRef.current;
      if (!d || !el) return;
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return;
      applyDelta(d.index, ((e.clientX - d.startX) / width) * 100, { a: d.a, b: d.b });
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      persist(sizesRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [applyDelta, persist]);

  const startDrag = (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const cur = sizesRef.current;
    dragRef.current = { index, startX: e.clientX, a: cur[index], b: cur[index + 1] };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const resetAll = () => {
    setSizes(initial);
    persist(initial);
  };

  const onKey = (index: number) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? 5 : 2) * (e.key === 'ArrowLeft' ? -1 : 1);
    const cur = sizesRef.current;
    applyDelta(index, step, { a: cur[index], b: cur[index + 1] });
    // setSizes 는 비동기이므로 다음 프레임에 저장한다.
    requestAnimationFrame(() => persist(sizesRef.current));
  };

  return (
    <div ref={containerRef} style={{ display: 'flex', alignItems: 'stretch', width: '100%' }}>
      {children.map((child, i) => (
        <Fragment key={i}>
          <div
            style={{
              // grow/shrink 를 막아 드래그 결과가 정확히 반영되게 한다
              flex: `0 0 calc(${sizes[i] ?? 100 / panes}% - ${(barWidth * (panes - 1)) / panes}px)`,
              minWidth: 0,
            }}
          >
            {child}
          </div>
          {i < panes - 1 && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="패널 폭 조절"
              tabIndex={0}
              onPointerDown={startDrag(i)}
              onDoubleClick={resetAll}
              onKeyDown={onKey(i)}
              title="드래그하여 폭 조절 · 더블클릭하면 초기화"
              style={{
                flex: `0 0 ${barWidth}px`,
                cursor: 'col-resize',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}
            >
              {/* 얇은 손잡이 — 호버 시에만 진해진다 */}
              <div
                style={{
                  width: 2,
                  height: '100%',
                  borderRadius: 1,
                  background: '#e5e7eb',
                  transition: 'background 120ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1677ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#e5e7eb')}
              />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}
