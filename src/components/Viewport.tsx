import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGesture } from '@use-gesture/react';
import { CornersOutIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@phosphor-icons/react';
import { useElementSize } from '@/lib/hooks';
import { cx } from './ui';

interface ViewportProps {
  width: number;
  height: number;
  children: (v: { scale: number }) => ReactNode;
  singlePan?: boolean;
  checker?: boolean;
  resetKey?: unknown;
  padding?: number;
  className?: string;
  controls?: boolean;
  overlay?: ReactNode;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const panKey = { held: false };

export function Viewport({ width, height, children, singlePan = true, checker = true, resetKey, padding = 16, className, controls = true, overlay }: ViewportProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const space = useRef(false);
  const pinching = useRef(false);
  const blocked = useRef(false);

  const availW = Math.max(1, size.width - padding * 2);
  const availH = Math.max(1, size.height - padding * 2);
  const fitRaw = Math.min(availW / Math.max(1, width), availH / Math.max(1, height));
  const fit = fitRaw > 1 ? Math.min(fitRaw, Math.max(1, Math.min(4, 320 / Math.max(width, height)))) : fitRaw;
  const scale = fit * view.z;
  const bw = width * scale;
  const bh = height * scale;

  useEffect(() => setView({ z: 1, x: 0, y: 0 }), [resetKey, width, height]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest('input,textarea,select,button')) space.current = panKey.held = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = panKey.held = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const bound = (z: number, x: number, y: number) => {
    const w = width * fit * z;
    const h = height * fit * z;
    const mx = Math.max(0, (w - size.width) / 2) + size.width * 0.35;
    const my = Math.max(0, (h - size.height) / 2) + size.height * 0.35;
    return { z, x: clamp(x, -mx, mx), y: clamp(y, -my, my) };
  };

  const zoomAt = (nz: number, px: number, py: number, base = view) => {
    nz = clamp(nz, 0.25, Math.max(8, 16 / fit));
    const r = nz / base.z;
    return bound(nz, px - (px - base.x) * r, py - (py - base.y) * r);
  };

  const rel = (cx: number, cy: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return [cx - rect.left - rect.width / 2, cy - rect.top - rect.height / 2] as const;
  };

  useGesture(
    {
      onPinch: ({ origin: [ox, oy], first, last, movement: [ms], memo }) => {
        pinching.current = !last;
        const [px, py] = rel(ox, oy);
        if (first) return { base: view, px, py };
        const m = memo as { base: typeof view; px: number; py: number };
        const next = zoomAt(m.base.z * ms, m.px, m.py, m.base);
        setView(bound(next.z, next.x + (px - m.px), next.y + (py - m.py)));
        return m;
      },
      onWheel: ({ event, delta: [dx, dy] }) => {
        const e = event as WheelEvent;
        if (e.ctrlKey || e.metaKey) {
          const [px, py] = rel(e.clientX, e.clientY);
          setView((v) => zoomAt(v.z * Math.exp(-dy * 0.01), px, py, v));
        } else setView((v) => bound(v.z, v.x - dx, v.y - dy));
      },
      onDrag: ({ delta: [dx, dy], event, touches, pinching: p, tap, first, last }) => {
        if (first) blocked.current = !!(event.target as HTMLElement)?.closest?.('[data-no-zoom],[data-no-pan]') && !space.current && ((event as PointerEvent).buttons & 4) !== 4;
        if (last) {
          const was = blocked.current;
          blocked.current = false;
          if (was) return;
        }
        if (blocked.current || p || pinching.current || tap) return;
        const e = event as PointerEvent;
        const allow = singlePan || space.current || e.button === 1 || (e.buttons & 4) === 4 || touches >= 2;
        if (!allow) return;
        setView((v) => bound(v.z, v.x + dx, v.y + dy));
      },
    },
    {
      target: ref,
      eventOptions: { passive: false },
      drag: { pointer: { buttons: [1, 4] }, filterTaps: true },
      pinch: { scaleBounds: { min: 0.1, max: 64 }, rubberband: false },
      wheel: { preventDefault: true } as never,
    },
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', prevent);
    el.addEventListener('gesturechange', prevent);
    return () => {
      el.removeEventListener('gesturestart', prevent);
      el.removeEventListener('gesturechange', prevent);
    };
  }, [ref]);

  const left = (size.width - bw) / 2 + view.x;
  const top = (size.height - bh) / 2 + view.y;

  return (
    <div
      ref={ref}
      className={cx('relative h-full w-full touch-none select-none overflow-hidden bg-stage', className)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-no-zoom]')) return;
        const [px, py] = rel(e.clientX, e.clientY);
        setView((v) => (v.z > 1.05 ? { z: 1, x: 0, y: 0 } : zoomAt(2.5, px, py, v)));
      }}
    >
      {size.width > 0 && (
        <div
          className={cx('absolute', checker && 'checker')}
          style={{ left, top, width: bw, height: bh, boxShadow: '0 0 0 1px rgb(0 0 0 / 0.06), 0 6px 24px -8px rgb(0 0 0 / 0.35)' }}
        >
          {children({ scale })}
        </div>
      )}
      {overlay}
      {controls && size.width > 0 && (
        <div data-no-zoom className="absolute bottom-3 right-3 hidden items-center gap-0.5 rounded-md border border-line bg-surface/90 p-0.5 backdrop-blur md:flex">
          <button type="button" className="flex size-8 items-center justify-center rounded-sm hover:bg-surface-2" aria-label="Perkecil" onClick={() => setView((v) => zoomAt(v.z / 1.4, 0, 0, v))}>
            <MagnifyingGlassMinusIcon size={17} />
          </button>
          <button type="button" className="h-8 min-w-12 rounded-sm px-1 text-xs tabular-nums hover:bg-surface-2" aria-label="Ukuran asli" onClick={() => setView(bound(1 / fit, 0, 0))}>
            {Math.round(scale * 100)}%
          </button>
          <button type="button" className="flex size-8 items-center justify-center rounded-sm hover:bg-surface-2" aria-label="Perbesar" onClick={() => setView((v) => zoomAt(v.z * 1.4, 0, 0, v))}>
            <MagnifyingGlassPlusIcon size={17} />
          </button>
          <button type="button" className="flex size-8 items-center justify-center rounded-sm hover:bg-surface-2" aria-label="Pas layar" onClick={() => setView({ z: 1, x: 0, y: 0 })}>
            <CornersOutIcon size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
