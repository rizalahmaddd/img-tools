import { useState } from 'react';
import { create } from 'zustand';
import { ClipboardTextIcon, DownloadSimpleIcon, FolderOpenIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { Sheet } from './Sheet';
import { Button, Field, Segmented, Slider, Switch, TextInput } from './ui';
import { current, useWorkspace, type Item } from '@/store/workspace';
import { usePrefs, useSettings, useToolSettings } from '@/store/settings';
import { errorMessage, toast, useUi } from '@/store/ui';
import { process } from '@/engine/client';
import { defaultOutput, type Format } from '@/engine/types';
import { extFromMime } from '@/engine/formats';
import { applyPattern, formatBytes } from '@/lib/format';
import { canShare, copyImage, downloadMany, saveToFolder, shareFiles, type OutFile } from '@/lib/save';
import { canPickDirectory, supportsClipboardWrite } from '@/lib/device';
import { copyExif } from '@/lib/metadata';

interface ExportState {
  ids: string[] | null;
  open: (ids: string[]) => void;
  close: () => void;
}

export const useExport = create<ExportState>((set) => ({
  ids: null,
  open: (ids) => set({ ids }),
  close: () => set({ ids: null }),
}));

export const openExport = (items: Item[]) => {
  if (!items.length) return toast({ kind: 'warn', title: 'Belum ada gambar untuk disimpan' });
  useExport.getState().open(items.map((i) => i.id));
};

const EXPORT_DEFAULTS = { format: 'keep' as 'keep' | Format, quality: 85 };

export async function buildFiles(items: Item[], format: 'keep' | Format, quality: number, pattern: string, keepExif: boolean, signal?: AbortSignal, onEach?: () => void): Promise<OutFile[]> {
  const out: OutFile[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const v = current(item);
    let blob = v.blob;
    let w = v.width;
    let h = v.height;
    if (format !== 'keep') {
      const r = await process(blob, { ops: [], output: { ...defaultOutput, format, quality }, srcMime: v.mime }, signal);
      blob = r.blob;
      w = r.width;
      h = r.height;
    }
    if (keepExif && blob.type === 'image/jpeg') blob = await copyExif(item.source, blob).catch(() => blob);
    out.push({ name: applyPattern(pattern, { name: item.name, n: i + 1, w, h, ext: extFromMime(blob.type) }), blob });
    onEach?.();
  }
  return out;
}

export function ExportSheet() {
  const ids = useExport((s) => s.ids);
  const close = useExport((s) => s.close);
  const all = useWorkspace((s) => s.items);
  const items = ids ? all.filter((i) => ids.includes(i.id)) : [];
  const prefs = usePrefs();
  const setPrefs = useSettings((s) => s.setPrefs);
  const [o, set] = useToolSettings('export', EXPORT_DEFAULTS);
  const [busy, setBusy] = useState(false);
  const total = items.reduce((n, i) => n + current(i).size, 0);
  const multi = items.length > 1;

  const run = async (kind: 'download' | 'share' | 'folder' | 'copy') => {
    setBusy(true);
    const ui = useUi.getState();
    const ctrl = new AbortController();
    const task = items.length > 2 && o.format !== 'keep' ? ui.startTask({ label: 'Menyiapkan file', total: items.length, cancel: () => ctrl.abort() }) : null;
    let n = 0;
    try {
      const files = await buildFiles(items, o.format, o.quality, prefs.namePattern, prefs.keepExif, ctrl.signal, () => task && ui.updateTask(task, { done: ++n }));
      if (kind === 'download') {
        await downloadMany(files, `racik-${new Date().toISOString().slice(0, 10)}.zip`, prefs.zip);
        toast({ kind: 'success', title: multi && prefs.zip ? 'ZIP diunduh' : multi ? `${files.length} file diunduh` : 'File diunduh' });
      } else if (kind === 'share') {
        const ok = await shareFiles(files);
        if (!ok) toast({ kind: 'warn', title: 'Perangkat ini tidak mendukung berbagi file' });
      } else if (kind === 'folder') {
        const count = await saveToFolder(files);
        toast({ kind: 'success', title: `${count} file disimpan ke folder` });
      } else {
        await copyImage(files[0].blob);
        toast({ kind: 'success', title: 'Gambar disalin ke clipboard' });
      }
      close();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ kind: 'error', title: 'Gagal menyimpan', body: errorMessage(e) });
    } finally {
      if (task) ui.endTask(task);
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={!!ids}
      onClose={close}
      title={multi ? `Simpan ${items.length} gambar` : 'Simpan gambar'}
      footer={
        <div className="space-y-2">
          <Button variant="primary" size="lg" block icon={DownloadSimpleIcon} loading={busy} disabled={busy || !items.length} onClick={() => run('download')}>
            {multi ? (prefs.zip ? 'Unduh ZIP' : 'Unduh semua') : 'Unduh'}
          </Button>
          <div className="flex gap-2">
            {canShare([{ name: 'a.png', blob: new Blob([], { type: 'image/png' }) }]) && (
              <Button block icon={ShareNetworkIcon} disabled={busy} onClick={() => run('share')}>
                Bagikan
              </Button>
            )}
            {canPickDirectory() && (
              <Button block icon={FolderOpenIcon} disabled={busy} onClick={() => run('folder')}>
                Ke folder
              </Button>
            )}
            {!multi && supportsClipboardWrite() && (
              <Button block icon={ClipboardTextIcon} disabled={busy} onClick={() => run('copy')}>
                Salin
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <p className="text-sm text-muted">
          {items.length} file · {formatBytes(total)} {o.format !== 'keep' && '(sebelum konversi)'}
        </p>
        <Field label="Format">
          <Segmented
            value={o.format}
            onChange={(format) => set({ format })}
            options={[
              { value: 'keep', label: 'Tetap' },
              { value: 'jpeg', label: 'JPG' },
              { value: 'png', label: 'PNG' },
              { value: 'webp', label: 'WebP' },
              { value: 'avif', label: 'AVIF' },
            ]}
          />
        </Field>
        {o.format !== 'keep' && o.format !== 'png' && <Slider label="Kualitas" value={o.quality} min={10} max={100} onChange={(quality) => set({ quality })} defaultValue={85} />}
        <Field label="Nama file" hint={<>Variabel: {'{name}'} {'{n}'} {'{w}'} {'{h}'} {'{date}'}</>}>
          <TextInput value={prefs.namePattern} onChange={(namePattern) => setPrefs({ namePattern })} placeholder="{name}" label="Pola nama file" />
        </Field>
        {multi && <Switch checked={prefs.zip} onChange={(zip) => setPrefs({ zip })} label="Satukan dalam ZIP" hint="Matikan untuk mengunduh satu per satu" />}
        <Switch checked={prefs.keepExif} onChange={(keepExif) => setPrefs({ keepExif })} label="Pertahankan EXIF (JPG)" hint="Data kamera & tanggal disalin dari file asli. Lokasi GPS ikut tersalin." />
      </div>
    </Sheet>
  );
}
