import { useRef } from 'react';
import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import { current, useWorkspace, type Item } from '@/store/workspace';
import { useObjectUrl } from '@/lib/hooks';
import { importFiles, pickFiles } from '@/lib/importer';
import { haptic } from '@/lib/device';
import { cx } from './ui';

export function Thumb({ item, className }: { item: Item; className?: string }) {
  const v = current(item);
  const url = useObjectUrl(v.thumb ?? v.blob);
  return (
    <span className={cx('relative block overflow-hidden bg-surface-2', v.hasAlpha && 'checker', className)}>
      {url && <img src={url} alt="" className="size-full object-cover" draggable={false} loading="lazy" decoding="async" />}
    </span>
  );
}

function StripItem({ item, active, selected }: { item: Item; active: boolean; selected: boolean }) {
  const setActive = useWorkspace((s) => s.setActive);
  const toggle = useWorkspace((s) => s.toggleSelect);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const long = useRef(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`${item.name}${active ? ', sedang dilihat' : ''}`}
        aria-current={active}
        className={cx('block size-12 overflow-hidden rounded-md outline-offset-2 md:size-16', active ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-85 hover:opacity-100')}
        onPointerDown={() => {
          long.current = false;
          timer.current = setTimeout(() => {
            long.current = true;
            haptic('medium');
            toggle(item.id);
          }, 450);
        }}
        onPointerUp={() => clearTimeout(timer.current)}
        onPointerLeave={() => clearTimeout(timer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (long.current) return;
          setActive(item.id);
        }}
      >
        <Thumb item={item} className="size-full" />
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Pilih ${item.name}`}
        onClick={() => {
          haptic('light');
          toggle(item.id);
        }}
        className="absolute -right-1.5 -top-1.5 flex size-7 items-center justify-center"
      >
        <span className={cx('flex size-5 items-center justify-center rounded-full border-2 shadow', selected ? 'border-accent bg-accent text-accent-fg' : 'border-white bg-black/30')}>
          {selected && <CheckIcon size={12} weight="bold" />}
        </span>
      </button>
    </div>
  );
}

export function Filmstrip() {
  const items = useWorkspace((s) => s.items);
  const activeId = useWorkspace((s) => s.activeId);
  const selected = useWorkspace((s) => s.selected);
  const selectAll = useWorkspace((s) => s.selectAll);
  if (!items.length) return null;
  const active = activeId ?? items[0]?.id;
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 py-1.5 md:py-2.5">
      <button
        type="button"
        aria-label="Tambah gambar"
        onClick={async () => importFiles(await pickFiles())}
        className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed border-line-strong text-muted hover:bg-surface-2 hover:text-fg md:size-16"
      >
        <PlusIcon size={20} />
      </button>
      <div className="no-scrollbar flex min-w-0 flex-1 gap-3 overflow-x-auto px-1.5 py-1.5">
        {items.map((i) => (
          <StripItem key={i.id} item={i} active={i.id === active} selected={selected.includes(i.id)} />
        ))}
      </div>
      {items.length > 1 && (
        <button type="button" onClick={selectAll} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg">
          {selected.length === items.length ? 'Batal pilih' : 'Pilih semua'}
          <span className="block text-[11px] font-normal tabular-nums">
            {selected.length}/{items.length}
          </span>
        </button>
      )}
    </div>
  );
}
