import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowCounterClockwiseIcon,
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  CameraIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  ImagesIcon,
  SquaresFourIcon,
  ClockCounterClockwiseIcon,
} from '@phosphor-icons/react';
import { useActiveItem, useWorkspace } from '@/store/workspace';
import { effectiveScope, useScope, type Scope } from '@/store/scope';
import { useScopedTargets } from '@/store/scope';
import type { ToolMeta } from '@/tools/registry';
import { importFiles, pickFiles } from '@/lib/importer';
import { useDesktop, useHotkeys, useMedia } from '@/lib/hooks';
import { isTouch } from '@/lib/device';
import { Filmstrip } from './Filmstrip';
import { openExport } from './ExportSheet';
import { ToolPicker } from './ToolPicker';
import { HistorySheet } from './HistorySheet';
import { Button, IconButton, Segmented, cx } from './ui';
import { pasteFromClipboard } from './GlobalInput';

interface ToolShellProps {
  tool: ToolMeta;
  stage: ReactNode;
  panel: ReactNode;
  footer?: ReactNode;
  needsImage?: boolean;
  filmstrip?: boolean;
  headerExtra?: ReactNode;
  emptyHint?: ReactNode;
}

type Snap = 'min' | 'peek' | 'full';

export function ToolShell({ tool, stage, panel, footer, needsImage = true, filmstrip = true, headerExtra, emptyHint }: ToolShellProps) {
  const desktop = useDesktop();
  // Phones held sideways are wide but only ~400px tall, so the controls move to a side column there too.
  const side = useMedia('(min-width: 1024px), (min-width: 640px) and (orientation: landscape) and (max-height: 640px)');
  const navigate = useNavigate();
  const items = useWorkspace((s) => s.items);
  const active = useActiveItem();
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const [picker, setPicker] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snap, setSnap] = useState<Snap>('peek');
  const targets = useScopedTargets();
  const Icon = tool.icon;

  useHotkeys({
    'mod+z': () => active && undo(active.id),
    'mod+shift+z': () => active && redo(active.id),
    'mod+y': () => active && redo(active.id),
    'mod+s': () => openExport(targets),
  });

  const empty = needsImage && !items.length;

  const header = (
    <header className="pt-safe z-20 shrink-0 border-b border-line bg-surface">
      <div className="flex h-14 items-center gap-0.5 px-1.5 min-[400px]:gap-1 min-[400px]:px-2 lg:px-4">
        {!desktop && <IconButton icon={ArrowLeftIcon} label="Kembali" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />}
        <Icon size={20} className="ml-1 hidden shrink-0 text-accent lg:block" weight="duotone" />
        <h1 className="ml-1 min-w-0 flex-1 truncate text-[15px] font-semibold min-[400px]:text-[17px] lg:ml-2">{tool.name}</h1>
        {headerExtra}
        {needsImage && active && (
          <>
            <IconButton icon={ArrowCounterClockwiseIcon} label="Urungkan (Ctrl+Z)" disabled={active.cursor <= 0} onClick={() => undo(active.id)} />
            <IconButton icon={ArrowClockwiseIcon} label="Ulangi" disabled={active.cursor >= active.versions.length - 1} onClick={() => redo(active.id)} className="hidden sm:inline-flex" />
            <IconButton icon={ClockCounterClockwiseIcon} label="Riwayat versi" onClick={() => setHistoryOpen(true)} className="max-[399px]:hidden" />
          </>
        )}
        <IconButton icon={SquaresFourIcon} label="Pindah ke alat lain" onClick={() => setPicker(true)} />
        {needsImage && items.length > 0 && (
          <Button variant="primary" size="sm" icon={DownloadSimpleIcon} className="ml-1" onClick={() => openExport(targets)}>
            <span className="hidden sm:inline">Simpan</span>
          </Button>
        )}
      </div>
    </header>
  );

  const body = empty ? (
    <EmptyTool tool={tool} hint={emptyHint} />
  ) : side ? (
    <div className={cx('grid min-h-0 flex-1', desktop ? 'grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]' : 'grid-cols-[minmax(0,1fr)_minmax(280px,42%)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]')}>
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="relative min-h-0 flex-1">{stage}</div>
        {filmstrip && needsImage && <Filmstrip />}
      </div>
      <aside className="flex min-h-0 flex-col border-l border-line bg-surface">
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{panel}</div>
        {footer && <div className={cx('shrink-0 border-t border-line', desktop ? 'p-4' : 'px-3 pt-2 pb-[max(8px,var(--safe-bottom))]')}>{footer}</div>}
      </aside>
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">{stage}</div>
      {filmstrip && needsImage && snap !== 'full' && <Filmstrip />}
      <MobilePanel snap={snap} setSnap={setSnap}>
        {panel}
      </MobilePanel>
      {footer && <div className="z-10 shrink-0 border-t border-line bg-surface px-4 pt-3 pb-[max(12px,var(--safe-bottom))]">{footer}</div>}
    </div>
  );

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      {header}
      {body}
      <ToolPicker open={picker} onClose={() => setPicker(false)} current={tool.id} />
      {active && <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} item={active} />}
    </div>
  );
}

const SNAP_HEIGHT: Record<Snap, string> = { min: '0px', peek: '30dvh', full: '72dvh' };

function MobilePanel({ snap, setSnap, children }: { snap: Snap; setSnap: (s: Snap) => void; children: ReactNode }) {
  const start = useRef<{ y: number; t: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const order: Snap[] = ['min', 'peek', 'full'];
  return (
    <div className="relative z-10 shrink-0 border-t border-line bg-surface">
      <button
        type="button"
        aria-label={snap === 'full' ? 'Kecilkan panel' : 'Perbesar panel'}
        className="flex h-6 w-full touch-none items-center justify-center"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { y: e.clientY, t: Date.now() };
        }}
        onPointerMove={(e) => start.current && setDragY(e.clientY - start.current.y)}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          setDragY(0);
          if (!s) return;
          const dy = e.clientY - s.y;
          const i = order.indexOf(snap);
          if (Math.abs(dy) < 6) setSnap(snap === 'full' ? 'peek' : snap === 'min' ? 'peek' : 'full');
          else if (dy < -30) setSnap(order[Math.min(2, i + (dy < -220 ? 2 : 1))]);
          else if (dy > 30) setSnap(order[Math.max(0, i - (dy > 220 ? 2 : 1))]);
        }}
      >
        <span className="h-1 w-10 rounded-full bg-line-strong" />
      </button>
      <div
        className={cx('scroll-thin overflow-y-auto overflow-x-hidden overscroll-contain', !start.current && 'transition-[height] duration-200 ease-out')}
        style={{ height: `calc(${SNAP_HEIGHT[snap]} - ${dragY}px)`, maxHeight: '80dvh' }}
      >
        {children}
      </div>
    </div>
  );
}

function EmptyTool({ tool, hint }: { tool: ToolMeta; hint?: ReactNode }) {
  const Icon = tool.icon;
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <Icon size={40} weight="duotone" className="mx-auto text-accent" />
        <h2 className="mt-3 text-lg font-semibold">{tool.name}</h2>
        <p className="mt-1 text-sm text-muted">{hint ?? `${tool.desc}. Tambahkan gambar dulu, bisa banyak sekaligus.`}</p>
        <div className="mt-6 space-y-2">
          <Button variant="primary" size="lg" block icon={ImagesIcon} onClick={async () => importFiles(await pickFiles())}>
            Pilih gambar
          </Button>
          <div className="flex gap-2">
            {isTouch() && (
              <Button block icon={CameraIcon} onClick={async () => importFiles(await pickFiles({ capture: true, multiple: false }))}>
                Kamera
              </Button>
            )}
            <Button block icon={ClipboardTextIcon} onClick={pasteFromClipboard}>
              Tempel
            </Button>
          </div>
          <p className="pt-2 text-xs text-muted">Bisa juga seret file ke sini. Semua diproses di perangkat ini, tidak ada yang diunggah.</p>
        </div>
      </div>
    </div>
  );
}

export function ScopePicker() {
  const items = useWorkspace((s) => s.items);
  const selected = useWorkspace((s) => s.selected);
  const scope = useScope((s) => s.scope);
  const setScope = useScope((s) => s.setScope);
  if (items.length < 2) return null;
  const eff = effectiveScope(scope, selected.length);
  const options: { value: Scope; label: string }[] = [
    { value: 'active', label: 'Gambar ini' },
    ...(selected.length ? [{ value: 'selected' as Scope, label: `Terpilih (${selected.length})` }] : []),
    { value: 'all', label: `Semua (${items.length})` },
  ];
  return <Segmented size="sm" value={eff} onChange={setScope} options={options} label="Terapkan ke" />;
}

export function ApplyBar({ label, onApply, busy, disabled, count, extra, batch = true }: { label: string; onApply: () => void; busy?: boolean; disabled?: boolean; count?: number; extra?: ReactNode; batch?: boolean }) {
  const targets = useScopedTargets();
  const n = count ?? targets.length;
  return (
    <div className="space-y-2.5">
      {batch && <ScopePicker />}
      {extra}
      <Button variant="primary" size="lg" block loading={busy} disabled={busy || disabled || n === 0} onClick={onApply}>
        {batch && n > 1 ? `${label} · ${n} gambar` : label}
      </Button>
    </div>
  );
}
