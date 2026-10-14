import { useState } from 'react';
import { DownloadSimpleIcon } from '@phosphor-icons/react';
import { ToolShell, ScopePicker } from '@/components/ToolShell';
import { Viewport } from '@/components/Viewport';
import { Button, Field, NumberInput, Section, Segmented } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem, type Item } from '@/store/workspace';
import { useScopedTargets } from '@/store/scope';
import { errorMessage, toast, useUi } from '@/store/ui';
import { process } from '@/engine/client';
import { defaultOutput, type Format } from '@/engine/types';
import { extFromMime } from '@/engine/formats';
import { useObjectUrl } from '@/lib/hooks';
import { downloadMany } from '@/lib/save';
import { haptic } from '@/lib/device';
import { toolById } from './registry';
import { addGenerated } from './compose';

const DEFAULTS = { mode: 'grid' as 'grid' | 'size', rows: 1, cols: 3, tileW: 1080, tileH: 1080, format: 'original' as Format | 'original', quality: 90, order: 'row' as 'row' | 'col' };
type S = typeof DEFAULTS;

const PRESETS = [
  { label: 'Carousel 3', rows: 1, cols: 3 },
  { label: 'Carousel 2', rows: 1, cols: 2 },
  { label: 'Grid 3×3', rows: 3, cols: 3 },
  { label: 'Grid 2×2', rows: 2, cols: 2 },
  { label: 'Grid 3×2', rows: 2, cols: 3 },
  { label: '3 vertikal', rows: 3, cols: 1 },
];

function grid(s: S, w: number, h: number) {
  if (s.mode === 'grid') return { rows: Math.max(1, s.rows), cols: Math.max(1, s.cols), tw: w / Math.max(1, s.cols), th: h / Math.max(1, s.rows) };
  const tw = Math.max(1, s.tileW);
  const th = Math.max(1, s.tileH);
  return { rows: Math.ceil(h / th), cols: Math.ceil(w / tw), tw, th };
}

async function splitItem(item: Item, s: S, signal: AbortSignal) {
  const v = current(item);
  const g = grid(s, v.width, v.height);
  const out: { blob: Blob; name: string }[] = [];
  const cells: [number, number][] = [];
  if (s.order === 'row') for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) cells.push([r, c]);
  else for (let c = 0; c < g.cols; c++) for (let r = 0; r < g.rows; r++) cells.push([r, c]);
  let n = 1;
  for (const [r, c] of cells) {
    const x = Math.round(c * g.tw);
    const y = Math.round(r * g.th);
    const w = Math.min(v.width, Math.round((c + 1) * g.tw)) - x;
    const h = Math.min(v.height, Math.round((r + 1) * g.th)) - y;
    if (w < 1 || h < 1) continue;
    const res = await process(v.blob, { ops: [{ type: 'crop', unit: 'px', x, y, w, h }], output: { ...defaultOutput, format: s.format, quality: s.quality }, srcMime: v.mime }, signal);
    out.push({ blob: res.blob, name: `${item.name}-${String(n++).padStart(2, '0')}` });
  }
  return out;
}

export default function Split() {
  const tool = toolById('split')!;
  const [s, set] = useToolSettings('split', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const targets = useScopedTargets();
  const url = useObjectUrl(v?.blob);
  const [busy, setBusy] = useState(false);
  const g = v ? grid(s, v.width, v.height) : null;
  const total = targets.reduce((n, t) => {
    const cv = current(t);
    const gg = grid(s, cv.width, cv.height);
    return n + gg.rows * gg.cols;
  }, 0);

  const run = async (kind: 'add' | 'zip') => {
    setBusy(true);
    const ui = useUi.getState();
    const ctrl = new AbortController();
    const task = ui.startTask({ label: 'Memecah gambar', total: targets.length, cancel: () => ctrl.abort() });
    try {
      const all: { blob: Blob; name: string }[] = [];
      for (let i = 0; i < targets.length; i++) {
        all.push(...(await splitItem(targets[i], s, ctrl.signal)));
        ui.updateTask(task, { done: i + 1 });
      }
      if (kind === 'add') {
        await addGenerated(all);
        toast({ kind: 'success', title: `${all.length} potongan ditambahkan ke Berkas` });
      } else {
        await downloadMany(all.map((f) => ({ name: `${f.name}.${extFromMime(f.blob.type)}`, blob: f.blob })), `${item?.name ?? 'potongan'}-grid.zip`, true);
      }
      haptic('success');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ kind: 'error', title: 'Gagal memecah', body: errorMessage(e) });
    } finally {
      ui.endTask(task);
      setBusy(false);
    }
  };

  return (
    <ToolShell
      tool={tool}
      stage={
        v &&
        g && (
          <Viewport width={v.width} height={v.height} resetKey={v.id}>
            {() => (
              <>
                {url && <img src={url} alt="" className="absolute inset-0 size-full" draggable={false} />}
                <svg className="pointer-events-none absolute inset-0 size-full drop-shadow-[0_0_1px_rgb(0_0_0)]" viewBox={`0 0 ${v.width} ${v.height}`} preserveAspectRatio="none">
                  {Array.from({ length: g.cols - 1 }, (_, i) => (
                    <line key={`c${i}`} x1={(i + 1) * g.tw} x2={(i + 1) * g.tw} y1={0} y2={v.height} stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ))}
                  {Array.from({ length: g.rows - 1 }, (_, i) => (
                    <line key={`r${i}`} y1={(i + 1) * g.th} y2={(i + 1) * g.th} x1={0} x2={v.width} stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ))}
                </svg>
              </>
            )}
          </Viewport>
        )
      }
      panel={
        <>
          <Section title="Cara memecah">
            <Segmented
              value={s.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'grid', label: 'Baris × kolom' },
                { value: 'size', label: 'Ukuran potongan' },
              ]}
            />
            {s.mode === 'grid' ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => set({ rows: p.rows, cols: p.cols })} className={`h-8 rounded-md border px-2.5 text-xs font-medium ${s.rows === p.rows && s.cols === p.cols ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Baris">
                    <NumberInput value={s.rows} onChange={(rows) => set({ rows: rows ?? 1 })} min={1} max={30} label="Baris" />
                  </Field>
                  <Field label="Kolom">
                    <NumberInput value={s.cols} onChange={(cols) => set({ cols: cols ?? 1 })} min={1} max={30} label="Kolom" />
                  </Field>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Lebar potongan">
                  <NumberInput value={s.tileW} onChange={(tileW) => set({ tileW: tileW ?? 1080 })} min={8} unit="px" label="Lebar potongan" />
                </Field>
                <Field label="Tinggi potongan">
                  <NumberInput value={s.tileH} onChange={(tileH) => set({ tileH: tileH ?? 1080 })} min={8} unit="px" label="Tinggi potongan" />
                </Field>
              </div>
            )}
            {v && g && (
              <p className="text-[13px] tabular-nums text-muted">
                {g.rows * g.cols} potongan @ ±{Math.round(g.tw)}×{Math.round(g.th)} px
              </p>
            )}
            <Field label="Urutan nomor">
              <Segmented
                size="sm"
                value={s.order}
                onChange={(order) => set({ order })}
                options={[
                  { value: 'row', label: 'Per baris' },
                  { value: 'col', label: 'Per kolom' },
                ]}
              />
            </Field>
          </Section>
          <Section title="Format">
            <Segmented
              value={s.format}
              onChange={(format) => set({ format })}
              options={[
                { value: 'original', label: 'Sama' },
                { value: 'jpeg', label: 'JPG' },
                { value: 'png', label: 'PNG' },
                { value: 'webp', label: 'WebP' },
              ]}
            />
          </Section>
        </>
      }
      footer={
        <div className="space-y-2.5">
          <ScopePicker />
          <div className="flex gap-2">
            <Button variant="primary" size="lg" className="flex-1" loading={busy} onClick={() => run('add')}>
              Pecah · {total} potongan
            </Button>
            <Button size="lg" icon={DownloadSimpleIcon} disabled={busy} onClick={() => run('zip')} aria-label="Langsung unduh ZIP" title="Langsung unduh ZIP" />
          </div>
        </div>
      }
    />
  );
}
