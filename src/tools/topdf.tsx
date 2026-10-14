import { useState } from 'react';
import { Link } from 'react-router';
import { DownloadSimpleIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { ToolShell, ScopePicker } from '@/components/ToolShell';
import { Thumb } from '@/components/Filmstrip';
import { Button, ColorInput, Field, Section, Segmented, Select, Slider, TextInput } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current } from '@/store/workspace';
import { useScopedTargets } from '@/store/scope';
import { errorMessage, toast, useUi } from '@/store/ui';
import { process } from '@/engine/client';
import { defaultOutput } from '@/engine/types';
import { makePdf, type PdfOptions } from '@/lib/pdf';
import { canShare, downloadBlob, shareFiles } from '@/lib/save';
import { formatBytes, sanitizeName } from '@/lib/format';
import { haptic } from '@/lib/device';
import { toolById } from './registry';

const DEFAULTS = {
  pageSize: 'a4' as PdfOptions['pageSize'],
  orientation: 'auto' as PdfOptions['orientation'],
  margin: 10,
  fit: 'contain' as PdfOptions['fit'],
  background: '#ffffff',
  quality: 82,
  maxSide: 2480,
  title: 'dokumen',
};

export default function ToPdf() {
  const tool = toolById('topdf')!;
  const [s, set] = useToolSettings('topdf', DEFAULTS);
  const targets = useScopedTargets();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Blob | null>(null);

  const build = async () => {
    const ui = useUi.getState();
    const ctrl = new AbortController();
    const task = ui.startTask({ label: 'Menyusun PDF', total: targets.length, cancel: () => ctrl.abort() });
    try {
      const imgs: { blob: Blob; width: number; height: number }[] = [];
      for (let i = 0; i < targets.length; i++) {
        const v = current(targets[i]);
        const r = await process(
          v.blob,
          {
            ops: s.maxSide > 0 ? [{ type: 'resize', mode: 'long', side: s.maxSide, enlarge: false, filter: 'mks2013' }] : [],
            output: { ...defaultOutput, format: v.hasAlpha && v.mime === 'image/png' ? 'png' : 'jpeg', quality: s.quality, background: s.background },
            srcMime: v.mime,
          },
          ctrl.signal,
        );
        imgs.push(r);
        ui.updateTask(task, { done: i + 1, progress: undefined, detail: 'Menyiapkan gambar' });
      }
      ui.updateTask(task, { detail: 'Menulis PDF' });
      return await makePdf(imgs, s);
    } finally {
      ui.endTask(task);
    }
  };

  const run = async (kind: 'download' | 'share') => {
    setBusy(true);
    try {
      const pdf = await build();
      setLast(pdf);
      const name = `${sanitizeName(s.title || 'dokumen')}.pdf`;
      if (kind === 'share') await shareFiles([{ name, blob: pdf }]);
      else downloadBlob(pdf, name);
      haptic('success');
      toast({ kind: 'success', title: `PDF ${targets.length} halaman siap`, body: formatBytes(pdf.size) });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ kind: 'error', title: 'Gagal membuat PDF', body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell
      tool={tool}
      filmstrip
      stage={
        <div className="scroll-thin h-full overflow-y-auto bg-stage p-4">
          <div className="mx-auto grid max-w-3xl grid-cols-3 gap-4 sm:grid-cols-4">
            {targets.map((t, i) => (
              <div key={t.id}>
                <div className="relative flex aspect-[1/1.414] items-center justify-center overflow-hidden rounded-sm bg-white shadow" style={{ background: s.background, padding: `${(s.margin / 210) * 100}%` }}>
                  <Thumb item={t} className={s.fit === 'cover' ? 'size-full' : 'max-h-full w-full [&>img]:object-contain'} />
                </div>
                <p className="mt-1 truncate text-center text-[11px] text-muted">
                  {i + 1}. {t.name}
                </p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-center text-xs text-muted">
            Urutan halaman mengikuti urutan di{' '}
            <Link to="/berkas" className="font-medium text-accent">
              Berkas
            </Link>
            .
          </p>
        </div>
      }
      panel={
        <>
          <Section title="Halaman">
            <Field label="Ukuran kertas">
              <Select
                value={s.pageSize}
                onChange={(pageSize) => set({ pageSize })}
                options={[
                  { value: 'a4', label: 'A4 (210×297 mm)' },
                  { value: 'f4', label: 'F4 / Folio (215×330 mm)' },
                  { value: 'letter', label: 'Letter' },
                  { value: 'legal', label: 'Legal' },
                  { value: 'a3', label: 'A3' },
                  { value: 'a5', label: 'A5' },
                  { value: 'fit', label: 'Ikuti ukuran gambar' },
                ]}
              />
            </Field>
            {s.pageSize !== 'fit' && (
              <Segmented
                value={s.orientation}
                onChange={(orientation) => set({ orientation })}
                options={[
                  { value: 'auto', label: 'Otomatis' },
                  { value: 'portrait', label: 'Potret' },
                  { value: 'landscape', label: 'Lanskap' },
                ]}
              />
            )}
            <Slider label="Margin" value={s.margin} min={0} max={40} unit=" mm" onChange={(margin) => set({ margin })} defaultValue={10} />
            {s.pageSize !== 'fit' && (
              <Segmented
                value={s.fit}
                onChange={(fit) => set({ fit })}
                options={[
                  { value: 'contain', label: 'Utuh' },
                  { value: 'cover', label: 'Penuhi' },
                  { value: 'stretch', label: 'Regangkan' },
                ]}
              />
            )}
            <ColorInput value={s.background} onChange={(background) => set({ background })} label="Warna halaman" />
          </Section>
          <Section title="Ukuran file">
            <Slider label="Kualitas gambar" value={s.quality} min={30} max={100} onChange={(quality) => set({ quality })} defaultValue={82} />
            <Slider
              label="Resolusi maksimal"
              value={s.maxSide}
              min={0}
              max={6000}
              step={10}
              onChange={(maxSide) => set({ maxSide })}
              format={(v) => (v === 0 ? 'Asli' : `${v} px`)}
              hint="2480 px ≈ A4 300 dpi. Turunkan untuk PDF yang lebih kecil (mis. kirim via email)."
            />
          </Section>
          <Section title="Nama file">
            <TextInput value={s.title} onChange={(title) => set({ title })} label="Nama PDF" placeholder="dokumen" />
          </Section>
        </>
      }
      footer={
        <div className="space-y-2.5">
          <ScopePicker />
          <div className="flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" icon={DownloadSimpleIcon} loading={busy} disabled={!targets.length} onClick={() => run('download')}>
              Buat PDF · {targets.length} hal
            </Button>
            {canShare([{ name: 'a.pdf', blob: new Blob([], { type: 'application/pdf' }) }]) && <Button size="lg" icon={ShareNetworkIcon} disabled={busy} onClick={() => run('share')} aria-label="Bagikan PDF" />}
          </div>
          {last && <p className="text-center text-xs text-muted">Terakhir: {formatBytes(last.size)}</p>}
        </div>
      }
    />
  );
}
