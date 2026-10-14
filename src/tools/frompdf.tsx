import { useState } from 'react';
import { DownloadSimpleIcon, FilePdfIcon } from '@phosphor-icons/react';
import { ToolShell } from '@/components/ToolShell';
import { Button, Field, Section, Segmented, Slider, TextInput } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { errorMessage, toast, useUi } from '@/store/ui';
import { pickFiles } from '@/lib/importer';
import { pdfPageCount, renderPdf } from '@/lib/pdf';
import { downloadMany } from '@/lib/save';
import { baseName, formatBytes } from '@/lib/format';
import { canvasLimits, haptic } from '@/lib/device';
import { toolById } from './registry';
import { addGenerated } from './compose';

const DEFAULTS = { dpi: 150, format: 'image/jpeg' as 'image/jpeg' | 'image/png' | 'image/webp', quality: 90 };

function parsePages(input: string, total: number): number[] {
  if (!input.trim()) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of input.split(',')) {
    const [a, b] = part.split('-').map((x) => parseInt(x.trim(), 10));
    if (Number.isFinite(a) && Number.isFinite(b)) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
    else if (Number.isFinite(a)) out.add(a);
  }
  return [...out].filter((n) => n >= 1 && n <= total).sort((x, y) => x - y);
}

export default function FromPdf() {
  const tool = toolById('frompdf')!;
  const [s, set] = useToolSettings('frompdf', DEFAULTS);
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(0);
  const [range, setRange] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const [f] = await pickFiles({ multiple: false, accept: 'application/pdf,.pdf' });
    if (!f) return;
    try {
      const n = await pdfPageCount(f);
      setFile(f);
      setPages(n);
      setRange('');
    } catch (e) {
      toast({ kind: 'error', title: 'PDF tidak bisa dibuka', body: /password/i.test(String(e)) ? 'PDF ini dikunci kata sandi.' : errorMessage(e) });
    }
  };

  const run = async (kind: 'add' | 'zip') => {
    if (!file) return;
    const list = parsePages(range, pages);
    if (!list.length) return toast({ kind: 'warn', title: 'Halaman tidak valid', body: `Isi antara 1 dan ${pages}, contoh 1-3,5` });
    setBusy(true);
    const ui = useUi.getState();
    const ctrl = new AbortController();
    const task = ui.startTask({ label: 'Merender halaman PDF', total: list.length, cancel: () => ctrl.abort() });
    try {
      const blobs = await renderPdf(file, { scale: s.dpi / 72, format: s.format, quality: s.quality / 100, pages: list, onPage: (d) => ui.updateTask(task, { done: d }), signal: ctrl.signal, maxArea: canvasLimits().maxArea });
      const name = baseName(file.name);
      const files = blobs.map((blob, i) => ({ blob, name: `${name}-hal-${list[i]}` }));
      if (kind === 'add') {
        await addGenerated(files);
        toast({ kind: 'success', title: `${files.length} halaman ditambahkan ke Berkas`, body: 'Lanjutkan ke alat lain, misalnya Kompres atau Gambar ke PDF.' });
      } else await downloadMany(files.map((f) => ({ name: `${f.name}.${s.format.split('/')[1].replace('jpeg', 'jpg')}`, blob: f.blob })), `${name}-gambar.zip`, true);
      haptic('success');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ kind: 'error', title: 'Gagal mengubah PDF', body: errorMessage(e) });
    } finally {
      ui.endTask(task);
      setBusy(false);
    }
  };

  return (
    <ToolShell
      tool={tool}
      needsImage={false}
      filmstrip={false}
      stage={
        <div className="flex h-full items-center justify-center bg-stage p-6">
          <button type="button" onClick={choose} className="flex w-full max-w-sm flex-col items-center gap-3 rounded-lg border-2 border-dashed border-line-strong bg-surface p-8 text-center hover:border-accent">
            <FilePdfIcon size={44} weight="duotone" className="text-accent" />
            {file ? (
              <>
                <span className="max-w-full truncate font-semibold">{file.name}</span>
                <span className="text-sm text-muted">
                  {pages} halaman · {formatBytes(file.size)}
                </span>
                <span className="text-xs font-medium text-accent">Ganti PDF</span>
              </>
            ) : (
              <>
                <span className="font-semibold">Pilih file PDF</span>
                <span className="text-sm text-muted">Setiap halaman diubah jadi gambar. Diproses di perangkat.</span>
              </>
            )}
          </button>
        </div>
      }
      panel={
        <>
          <Section title="Halaman">
            <Field label="Halaman yang diambil" hint={pages ? `Kosongkan untuk semua ${pages} halaman. Contoh: 1-3, 5, 8-10` : 'Pilih PDF dulu'}>
              <TextInput value={range} onChange={setRange} placeholder="semua" label="Rentang halaman" />
            </Field>
          </Section>
          <Section title="Kualitas">
            <Slider label="Resolusi" value={s.dpi} min={50} max={400} step={10} unit=" dpi" onChange={(dpi) => set({ dpi })} defaultValue={150} hint="150 dpi cukup untuk layar, 300 dpi untuk cetak." />
            <Segmented
              value={s.format}
              onChange={(format) => set({ format })}
              options={[
                { value: 'image/jpeg', label: 'JPG' },
                { value: 'image/png', label: 'PNG' },
                { value: 'image/webp', label: 'WebP' },
              ]}
            />
            {s.format !== 'image/png' && <Slider label="Kualitas" value={s.quality} min={30} max={100} onChange={(quality) => set({ quality })} defaultValue={90} />}
          </Section>
        </>
      }
      footer={
        <div className="flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" loading={busy} disabled={!file} onClick={() => run('add')}>
            Ubah ke gambar
          </Button>
          <Button size="lg" icon={DownloadSimpleIcon} disabled={!file || busy} onClick={() => run('zip')} aria-label="Unduh ZIP langsung" title="Unduh ZIP langsung" />
        </div>
      }
    />
  );
}
