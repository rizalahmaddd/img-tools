import { useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, KeyboardSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
  ImagesIcon,
  PlusIcon,
  SquaresFourIcon,
  TrashIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react';
import { Page } from '@/components/AppShell';
import { Thumb } from '@/components/Filmstrip';
import { Button, IconButton, TextInput, cx } from '@/components/ui';
import { Confirm, Sheet } from '@/components/Sheet';
import { openExport } from '@/components/ExportSheet';
import { ToolPicker } from '@/components/ToolPicker';
import { current, useWorkspace, type Item } from '@/store/workspace';
import { usePrefs } from '@/store/settings';
import { useScope } from '@/store/scope';
import { importFiles, pickFiles } from '@/lib/importer';
import { formatBytes, uid } from '@/lib/format';
import { mimeLabel } from '@/engine/formats';
import { useObjectUrl } from '@/lib/hooks';
import { haptic } from '@/lib/device';

function Card({ item, selected, onOpen }: { item: Item; selected: boolean; onOpen: () => void }) {
  const toggle = useWorkspace((s) => s.toggleSelect);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const v = current(item);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('group relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        type="button"
        onClick={onOpen}
        {...attributes}
        {...listeners}
        className={cx('block w-full overflow-hidden rounded-md text-left outline-offset-2', selected && 'ring-2 ring-accent ring-offset-2 ring-offset-bg')}
        aria-label={`Buka ${item.name}`}
      >
        <Thumb item={item} className="aspect-square w-full" />
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
        className="absolute left-1 top-1 flex size-9 items-center justify-center"
      >
        <span className={cx('flex size-6 items-center justify-center rounded-full border-2 shadow', selected ? 'border-accent bg-accent text-accent-fg' : 'border-white bg-black/30')}>
          {selected && <CheckIcon size={14} weight="bold" />}
        </span>
      </button>
      {item.cursor > 0 && <span className="absolute right-1.5 top-1.5 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">diedit</span>}
      <div className="mt-1.5 px-0.5">
        <p className="truncate text-[13px] font-medium">{item.name}</p>
        <p className="truncate text-[11px] tabular-nums text-muted">
          {v.width}×{v.height} · {formatBytes(v.size)} · {mimeLabel(v.mime)}
        </p>
      </div>
    </div>
  );
}

function Detail({ item, onClose }: { item: Item; onClose: () => void }) {
  const v = current(item);
  const url = useObjectUrl(v.blob);
  const [name, setName] = useState(item.name);
  const ws = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const prefs = usePrefs();
  const original = item.versions[0];
  return (
    <Sheet
      open
      onClose={onClose}
      title="Detail gambar"
      wide
      footer={
        <div className="flex gap-2">
          <Button variant="primary" block icon={DownloadSimpleIcon} onClick={() => openExport([item])}>
            Simpan
          </Button>
          <IconButton icon={ArrowCounterClockwiseIcon} label="Kembalikan ke asli" disabled={item.cursor === 0} onClick={() => ws.revert(item.id)} />
          <IconButton
            icon={CopyIcon}
            label="Duplikat"
            onClick={() => {
              const copy: Item = { ...item, id: uid(), name: `${item.name} salinan`, addedAt: Date.now(), versions: [{ ...v, id: uid(), label: 'Asli' }], cursor: 0 };
              ws.add([copy]);
            }}
          />
          <IconButton icon={TrashIcon} label="Hapus" className="text-danger" onClick={() => (prefs.confirmDelete ? setConfirm(true) : (ws.remove([item.id]), onClose()))} />
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <div className={cx('flex max-h-[45dvh] justify-center overflow-hidden rounded-md bg-stage', v.hasAlpha && 'checker')}>
          {url && <img src={url} alt={item.name} className="max-h-[45dvh] object-contain" />}
        </div>
        <div className="flex items-center gap-2">
          <PencilSimpleIcon size={16} className="shrink-0 text-muted" />
          <div className="flex-1">
            <TextInput value={name} onChange={setName} label="Nama gambar" />
          </div>
          {name !== item.name && (
            <Button size="sm" variant="primary" onClick={() => ws.rename(item.id, name)}>
              Simpan nama
            </Button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Sekarang</dt>
          <dd className="tabular-nums">
            {v.width}×{v.height} · {formatBytes(v.size)} · {mimeLabel(v.mime)}
          </dd>
          <dt className="text-muted">File asli</dt>
          <dd className="tabular-nums">
            {original.width}×{original.height} · {formatBytes(item.source.size)} · {mimeLabel(item.sourceMime)}
          </dd>
          <dt className="text-muted">Riwayat</dt>
          <dd>{item.versions.length} versi</dd>
          {item.animated && (
            <>
              <dt className="text-muted">Catatan</dt>
              <dd>Animasi, hanya frame pertama yang diedit</dd>
            </>
          )}
        </dl>
        {item.versions.length > 1 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {item.versions.map((ver, i) => (
              <VersionChip key={ver.id} label={i === 0 ? 'Asli' : ver.label} blob={ver.thumb ?? ver.blob} active={i === item.cursor} alpha={ver.hasAlpha} onClick={() => ws.goto(item.id, i)} />
            ))}
          </div>
        )}
      </div>
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Hapus gambar ini?"
        body="Gambar dan seluruh riwayat editnya dihapus dari perangkat."
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          ws.remove([item.id]);
          onClose();
        }}
      />
    </Sheet>
  );
}

function VersionChip({ label, blob, active, onClick, alpha }: { label: string; blob: Blob; active: boolean; onClick: () => void; alpha: boolean }) {
  const url = useObjectUrl(blob);
  return (
    <button type="button" onClick={onClick} className="w-16 shrink-0 text-left">
      <span className={cx('block aspect-square overflow-hidden rounded-sm', active ? 'ring-2 ring-accent' : 'opacity-80', alpha && 'checker')}>{url && <img src={url} alt="" className="size-full object-cover" />}</span>
      <span className="mt-1 block truncate text-[11px] text-muted">{label}</span>
    </button>
  );
}

export default function Files() {
  const items = useWorkspace((s) => s.items);
  const selected = useWorkspace((s) => s.selected);
  const ws = useWorkspace.getState;
  const [detail, setDetail] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const prefs = usePrefs();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sel = items.filter((i) => selected.includes(i.id));
  const targets = sel.length ? sel : items;
  const totalSize = items.reduce((n, i) => n + current(i).size, 0);
  const detailItem = items.find((i) => i.id === detail);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    ws().reorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };

  return (
    <Page
      title="Berkas"
      wide
      actions={
        <Button size="sm" variant="primary" icon={PlusIcon} onClick={async () => importFiles(await pickFiles())}>
          Tambah
        </Button>
      }
    >
      {!items.length ? (
        <div className="py-20 text-center">
          <ImagesIcon size={40} weight="duotone" className="mx-auto text-faint" />
          <p className="mt-3 font-medium">Belum ada gambar</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Gambar yang kamu tambahkan tersimpan di sini, lengkap dengan riwayat editnya, sampai kamu hapus.</p>
          <Button className="mt-5" variant="primary" icon={ImagesIcon} onClick={async () => importFiles(await pickFiles())}>
            Pilih gambar
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted">
              {items.length} gambar · {formatBytes(totalSize)}
              {sel.length > 0 && <span className="font-medium text-fg"> · {sel.length} dipilih</span>}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => ws().selectAll()}>
                {selected.length === items.length ? 'Batal pilih' : 'Pilih semua'}
              </Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted">Seret untuk mengubah urutan (dipakai untuk PDF, kolase, dan GIF). Di HP, tahan sebentar lalu seret.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {items.map((i) => (
                  <Card key={i.id} item={i} selected={selected.includes(i.id)} onOpen={() => setDetail(i.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="h-24" />
          <div className="fixed inset-x-0 bottom-[calc(64px+var(--safe-bottom))] z-20 px-4 lg:bottom-4 lg:left-60">
            <div className="mx-auto flex max-w-xl items-center gap-2 rounded-lg border border-line bg-surface p-2 shadow-[var(--shadow-pop)]">
              <Button variant="primary" className="flex-1" icon={DownloadSimpleIcon} onClick={() => openExport(targets)}>
                {sel.length ? `Simpan ${sel.length}` : 'Simpan semua'}
              </Button>
              <Button
                icon={SquaresFourIcon}
                onClick={() => {
                  useScope.getState().setScope(sel.length ? 'selected' : 'all');
                  setPicker(true);
                }}
              >
                Olah
              </Button>
              <IconButton icon={TrashIcon} label={sel.length ? 'Hapus yang dipilih' : 'Hapus semua'} className="text-danger" onClick={() => (prefs.confirmDelete ? setConfirm(true) : ws().remove(targets.map((t) => t.id)))} />
            </div>
          </div>
        </>
      )}
      {detailItem && <Detail item={detailItem} onClose={() => setDetail(null)} />}
      <ToolPicker open={picker} onClose={() => setPicker(false)} />
      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title={sel.length ? `Hapus ${sel.length} gambar?` : 'Hapus semua gambar?'}
        body="Gambar dan riwayat editnya dihapus dari perangkat ini. Tidak bisa dibatalkan."
        confirmLabel="Hapus"
        danger
        onConfirm={() => ws().remove(targets.map((t) => t.id))}
      />
    </Page>
  );
}
