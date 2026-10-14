import { useEffect, useState } from 'react';
import { DownloadSimpleIcon, ShareNetworkIcon } from '@phosphor-icons/react';
import { ToolShell, ScopePicker } from '@/components/ToolShell';
import { Button, ColorInput, Field, NumberInput, Notice, Section, Segmented, Slider, Switch } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, type Item } from '@/store/workspace';
import { useScopedTargets } from '@/store/scope';
import { errorMessage, toast, useUi } from '@/store/ui';
import { engine } from '@/engine/client';
import { useDebounced, useObjectUrl } from '@/lib/hooks';
import { canShare, downloadBlob, shareFiles } from '@/lib/save';
import { formatBytes } from '@/lib/format';
import { haptic } from '@/lib/device';
import { toolById } from './registry';

const DEFAULTS = { width: 600, delay: 500, loop: true, fit: 'cover' as 'cover' | 'contain', background: '#ffffff', colors: 128, boomerang: false };
type S = typeof DEFAULTS;

function frames(items: Item[], s: S) {
  const list = items.map((i) => current(i).blob);
  return s.boomerang && list.length > 2 ? [...list, ...list.slice(1, -1).reverse()] : list;
}

function dims(items: Item[], width: number) {
  const first = items[0] ? current(items[0]) : null;
  const aspect = first ? first.width / first.height : 1;
  return { width: Math.round(width), height: Math.max(1, Math.round(width / aspect)) };
}

export default function Gif() {
  const tool = toolById('gif')!;
  const [s, set] = useToolSettings('gif', DEFAULTS);
  const targets = useScopedTargets();
  const [preview, setPreview] = useState<Blob | null>(null);
  const [making, setMaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = useObjectUrl(preview);
  const ds = useDebounced(s, 400);
  const key = targets.map((t) => current(t).id).join(',');

  useEffect(() => {
    if (targets.length < 2) return setPreview(null);
    let alive = true;
    setMaking(true);
    const d = dims(targets, Math.min(320, ds.width));
    engine
      .makeGif(frames(targets, ds), { ...d, delay: ds.delay, loop: ds.loop, fit: ds.fit, background: ds.background, colors: Math.min(ds.colors, 128) })
      .then((b) => alive && setPreview(b))
      .catch(() => undefined)
      .finally(() => alive && setMaking(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, key]);

  const run = async (kind: 'download' | 'share') => {
    setBusy(true);
    const ui = useUi.getState();
    const task = ui.startTask({ label: 'Membuat GIF', total: 1 });
    try {
      const d = dims(targets, s.width);
      const gif = await engine.makeGif(frames(targets, s), { ...d, delay: s.delay, loop: s.loop, fit: s.fit, background: s.background, colors: s.colors });
      const name = `animasi-${targets.length}.gif`;
      if (kind === 'share') await shareFiles([{ name, blob: gif }]);
      else downloadBlob(gif, name);
      haptic('success');
      toast({ kind: 'success', title: 'GIF siap', body: `${d.width}×${d.height} · ${formatBytes(gif.size)}` });
    } catch (e) {
      toast({ kind: 'error', title: 'Gagal membuat GIF', body: errorMessage(e) });
    } finally {
      ui.endTask(task);
      setBusy(false);
    }
  };

  const d = dims(targets, s.width);
  const frameCount = frames(targets, s).length;

  return (
    <ToolShell
      tool={tool}
      stage={
        <div className="checker flex h-full items-center justify-center p-6">
          {targets.length < 2 ? (
            <p className="rounded-md bg-surface px-4 py-3 text-sm text-muted shadow">Centang minimal 2 gambar di bawah sebagai frame.</p>
          ) : url ? (
            <figure className="text-center">
              <img src={url} alt="Pratinjau GIF" className="max-h-[50dvh] max-w-full rounded-sm shadow-lg" style={{ width: Math.min(320, s.width) }} />
              <figcaption className="mt-2 text-xs text-muted">{making ? 'Memperbarui pratinjau…' : `Pratinjau · ${frameCount} frame · ${((frameCount * s.delay) / 1000).toFixed(1)} detik`}</figcaption>
            </figure>
          ) : (
            <p className="text-sm text-muted">Menyiapkan pratinjau…</p>
          )}
        </div>
      }
      panel={
        <>
          <Section title="Animasi">
            <Slider label="Durasi per frame" value={s.delay} min={20} max={3000} step={10} unit=" ms" onChange={(delay) => set({ delay })} defaultValue={500} hint={`≈ ${(1000 / s.delay).toFixed(1)} frame per detik`} />
            <Switch checked={s.loop} onChange={(loop) => set({ loop })} label="Ulang terus" />
            <Switch checked={s.boomerang} onChange={(boomerang) => set({ boomerang })} label="Bolak-balik (boomerang)" />
          </Section>
          <Section title="Ukuran">
            <Field label="Lebar" hint={`Tinggi mengikuti frame pertama: ${d.width}×${d.height}`}>
              <NumberInput value={s.width} onChange={(width) => set({ width: width ?? 600 })} min={16} max={2000} unit="px" label="Lebar GIF" />
            </Field>
            <Segmented
              value={s.fit}
              onChange={(fit) => set({ fit })}
              options={[
                { value: 'cover', label: 'Isi penuh' },
                { value: 'contain', label: 'Utuh' },
              ]}
            />
            {s.fit === 'contain' && <ColorInput value={s.background} onChange={(background) => set({ background })} label="Warna latar" />}
            <Slider label="Jumlah warna" value={s.colors} min={8} max={256} step={8} onChange={(colors) => set({ colors })} defaultValue={128} hint="Lebih sedikit warna = file lebih kecil." />
            {d.width * d.height * frameCount > 60_000_000 && <Notice kind="warn">GIF besar dengan banyak frame bisa berukuran puluhan MB. Kecilkan lebar atau jumlah frame.</Notice>}
          </Section>
        </>
      }
      footer={
        <div className="space-y-2.5">
          <ScopePicker />
          <div className="flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" icon={DownloadSimpleIcon} loading={busy} disabled={targets.length < 2} onClick={() => run('download')}>
              Unduh GIF · {frameCount} frame
            </Button>
            {canShare([{ name: 'a.gif', blob: new Blob([], { type: 'image/gif' }) }]) && <Button size="lg" icon={ShareNetworkIcon} disabled={busy || targets.length < 2} onClick={() => run('share')} aria-label="Bagikan GIF" />}
          </div>
        </div>
      }
    />
  );
}
