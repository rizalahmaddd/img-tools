import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SpinnerGapIcon } from '@phosphor-icons/react';
import { useObjectUrl } from '@/lib/hooks';
import { formatBytes, percentChange } from '@/lib/format';
import { mimeLabel } from '@/engine/formats';
import { engine } from '@/engine/client';
import { Viewport } from './Viewport';
import { cx } from './ui';

export interface StageImage {
  blob: Blob;
  width: number;
  height: number;
  mime?: string;
}

interface Props {
  before: StageImage;
  after?: StageImage | null;
  busy?: boolean;
  busyLabel?: string;
  showInfo?: boolean;
  resetKey?: unknown;
  extra?: ReactNode;
  note?: string;
}

const NOT_DISPLAYABLE = ['image/tiff', 'image/jxl', 'image/x-icon', 'image/heic'];
const displayCache = new WeakMap<Blob, Promise<Blob>>();

function useDisplayBlob(blob: Blob | undefined, mime?: string) {
  const [out, setOut] = useState<Blob | undefined>(blob);
  useEffect(() => {
    if (!blob || !NOT_DISPLAYABLE.includes(mime ?? blob.type)) return setOut(blob);
    let alive = true;
    let p = displayCache.get(blob);
    if (!p) {
      p = engine.toPng(blob).then((r) => r.blob);
      displayCache.set(blob, p);
    }
    p.then((b) => alive && setOut(b)).catch(() => alive && setOut(blob));
    return () => {
      alive = false;
    };
  }, [blob, mime]);
  return out;
}

export function ImageStage({ before, after, busy, busyLabel, showInfo = true, resetKey, extra, note }: Props) {
  const beforeUrl = useObjectUrl(useDisplayBlob(before.blob, before.mime));
  const afterUrl = useObjectUrl(useDisplayBlob(after?.blob, after?.mime));
  const sameAspect = after && Math.abs(after.width / after.height - before.width / before.height) < 0.01;
  const [tab, setTab] = useState<'after' | 'before'>('after');
  const [split, setSplit] = useState(0.5);
  useEffect(() => setTab('after'), [after?.blob]);

  const shown = after && (sameAspect || tab === 'after') ? after : before;

  return (
    <div className="relative h-full w-full">
      <Viewport width={shown.width} height={shown.height} resetKey={resetKey}>
        {() => (
          <>
            {after && sameAspect ? (
              <>
                <img src={afterUrl} alt="Sesudah" className="absolute inset-0 size-full" draggable={false} />
                <img src={beforeUrl} alt="Sebelum" className="absolute inset-0 size-full" style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }} draggable={false} />
                <SplitHandle split={split} onChange={setSplit} />
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">Sebelum</span>
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-sm bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white">Sesudah</span>
              </>
            ) : (
              <img src={shown === after ? afterUrl : beforeUrl} alt="" className="absolute inset-0 size-full" draggable={false} />
            )}
          </>
        )}
      </Viewport>

      {showInfo && (
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-24px)] flex-wrap gap-1.5">
          <InfoChip>
            {before.width}×{before.height} · {formatBytes(before.blob.size)}
            {before.mime && <span className="text-faint"> · {mimeLabel(before.mime)}</span>}
          </InfoChip>
          {after && (
            <InfoChip accent>
              {after.width}×{after.height} · {formatBytes(after.blob.size)}
              {after.mime && <span className="opacity-80"> · {mimeLabel(after.mime)}</span>}
              <span className="ml-1 font-semibold">{percentChange(before.blob.size, after.blob.size)}</span>
            </InfoChip>
          )}
        </div>
      )}

      {after && !sameAspect && (
        <div data-no-zoom className="absolute bottom-3 left-1/2 flex -translate-x-1/2 rounded-full border border-line bg-surface/90 p-0.5 text-xs font-medium backdrop-blur">
          {(['before', 'after'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cx('h-7 rounded-full px-3', tab === t ? 'bg-fg text-bg' : 'text-muted')}>
              {t === 'before' ? 'Sebelum' : 'Sesudah'}
            </button>
          ))}
        </div>
      )}


      {note && (
        <div className="pointer-events-none absolute inset-x-3 bottom-14 flex justify-center md:bottom-3">
          <span className="rounded-md bg-warn px-2.5 py-1 text-xs font-medium text-white shadow">{note}</span>
        </div>
      )}

      {busy && (
        <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-medium shadow backdrop-blur">
          <SpinnerGapIcon size={14} className="animate-spin text-accent" />
          {busyLabel ?? 'Memproses pratinjau'}
        </div>
      )}
      {extra}
    </div>
  );
}

function InfoChip({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span className={cx('rounded-md px-2 py-1 text-xs tabular-nums shadow-sm backdrop-blur', accent ? 'bg-accent text-accent-fg' : 'bg-surface/90 text-fg')}>{children}</span>
  );
}

function SplitHandle({ split, onChange }: { split: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const box = ref.current?.parentElement?.getBoundingClientRect();
    if (box) onChange(Math.min(1, Math.max(0, (clientX - box.left) / box.width)));
  };
  return (
    <div
      ref={ref}
      data-no-zoom
      className="absolute inset-y-0 z-10 w-10 -translate-x-1/2 cursor-ew-resize touch-none"
      style={{ left: `${split * 100}%` }}
      role="slider"
      aria-label="Geser untuk membandingkan"
      aria-valuenow={Math.round(split * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onChange(Math.max(0, split - 0.05));
        if (e.key === 'ArrowRight') onChange(Math.min(1, split + 0.05));
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.buttons) move(e.clientX);
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]" />
      <div className="absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-md">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M6 3 1 8l5 5V3Zm4 0v10l5-5-5-5Z" />
        </svg>
      </div>
    </div>
  );
}
