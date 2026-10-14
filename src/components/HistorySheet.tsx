import { CheckIcon } from '@phosphor-icons/react';
import { Sheet } from './Sheet';
import { useWorkspace, type Item, type Version } from '@/store/workspace';
import { useObjectUrl } from '@/lib/hooks';
import { formatBytes } from '@/lib/format';
import { mimeLabel } from '@/engine/formats';
import { cx } from './ui';

function Row({ v, active, onClick, index }: { v: Version; active: boolean; onClick: () => void; index: number }) {
  const url = useObjectUrl(v.thumb ?? v.blob);
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-3 rounded-md p-2 text-left', active ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
      <span className={cx('size-12 shrink-0 overflow-hidden rounded-sm bg-surface-2', v.hasAlpha && 'checker')}>{url && <img src={url} alt="" className="size-full object-cover" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {index === 0 ? 'Asli' : v.label}
        </span>
        <span className="block text-xs tabular-nums text-muted">
          {v.width}×{v.height} · {formatBytes(v.size)} · {mimeLabel(v.mime)}
        </span>
      </span>
      {active && <CheckIcon size={18} className="text-accent" weight="bold" />}
    </button>
  );
}

export function HistorySheet({ open, onClose, item }: { open: boolean; onClose: () => void; item: Item }) {
  const goto = useWorkspace((s) => s.goto);
  return (
    <Sheet open={open} onClose={onClose} title="Riwayat versi">
      <div className="space-y-1 px-3 pb-4">
        <p className="px-1 pb-2 text-[13px] text-muted">Ketuk versi untuk kembali ke sana. Edit baru setelahnya akan mengganti versi di atasnya.</p>
        {[...item.versions].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => (
          <Row key={v.id} v={v} index={i} active={i === item.cursor} onClick={() => goto(item.id, i)} />
        ))}
      </div>
    </Sheet>
  );
}
