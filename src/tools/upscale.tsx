import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlassPlusIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { ImageStage, type StageImage } from '@/components/ImageStage';
import { Button, Notice, Progress, Section, Segmented, Slider, cx } from '@/components/ui';
import { defaultOutput } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem, type Version } from '@/store/workspace';
import { getScopedTargets } from '@/store/scope';
import { errorMessage, toast } from '@/store/ui';
import { runBatch } from '@/lib/batch';
import { process } from '@/engine/client';
import { canvasLimits } from '@/lib/device';
import { fitArea } from '@/engine/canvas';
import { isModelCached, pickDevice, upscale } from '@/ai/client';
import { UPSCALE_MODELS } from '@/ai/models';
import { toolById } from './registry';
import { ActiveStage } from './common';

const DEFAULTS = { model: 'general', scale: 2, sharpen: 0 };
type S = typeof DEFAULTS;

function plan(v: Version, scale: number) {
  const { maxArea, maxDim } = canvasLimits();
  const target = fitArea(v.width * scale, v.height * scale, maxArea, maxDim);
  const inW = Math.max(1, Math.round(target.w / 4));
  const inH = Math.max(1, Math.round(target.h / 4));
  return { target, preShrink: inW < v.width, inW, inH, capped: target.scaled };
}

async function runUpscale(v: Version, s: S, signal: AbortSignal, report?: (p: number, d?: string) => void) {
  const p = plan(v, s.scale);
  let input = v.blob;
  if (p.preShrink) {
    input = (await process(v.blob, { ops: [{ type: 'resize', mode: 'exact', width: p.inW, height: p.inH, enlarge: false, filter: 'mks2013' }], output: { ...defaultOutput, format: 'png' }, srcMime: v.mime }, signal)).blob;
  }
  const { maxArea } = canvasLimits();
  const r = await upscale(input, s.model, maxArea, (e) => report?.(e.progress, e.stage === 'download' ? `Mengunduh model ${e.detail ?? ''}` : e.detail), signal);
  const needResize = Math.abs(r.width - p.target.w) > 1 || Math.abs(r.height - p.target.h) > 1;
  if (!needResize && !s.sharpen) return { blob: r.blob, width: r.width, height: r.height, mime: r.blob.type, note: p.capped ? `Dibatasi ${p.target.w}×${p.target.h} karena memori perangkat.` : undefined };
  const ops = [
    ...(needResize ? [{ type: 'resize' as const, mode: 'exact' as const, width: p.target.w, height: p.target.h, enlarge: false, filter: 'lanczos3' as const }] : []),
    ...(s.sharpen ? [{ type: 'adjust' as const, sharpen: s.sharpen }] : []),
  ];
  const out = await process(r.blob, { ops, output: defaultOutput, srcMime: r.blob.type }, signal);
  return { ...out, note: p.capped ? `Dibatasi ${p.target.w}×${p.target.h} karena memori perangkat.` : out.note };
}

export default function Upscale() {
  const tool = toolById('upscale')!;
  const [s, set] = useToolSettings('upscale', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const [device, setDevice] = useState('');
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [sample, setSample] = useState<{ before: StageImage; after: StageImage } | null>(null);
  const [busy, setBusy] = useState<{ p: number; detail?: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    pickDevice().then(setDevice);
    UPSCALE_MODELS.forEach((m) => isModelCached('upscale', m.id).then((c) => setCached((x) => ({ ...x, [m.id]: c }))));
  }, []);
  useEffect(() => setSample(null), [v?.id, s.model]);

  const p = v ? plan(v, s.scale) : null;

  const trySample = async () => {
    if (!v) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy({ p: 0, detail: 'Menyiapkan' });
    try {
      const size = Math.min(192, v.width, v.height);
      const crop = await process(v.blob, { ops: [{ type: 'crop', unit: 'px', x: (v.width - size) / 2, y: (v.height - size) / 2, w: size, h: size }], output: { ...defaultOutput, format: 'png' }, srcMime: v.mime }, ctrl.signal);
      const { maxArea } = canvasLimits();
      const r = await upscale(crop.blob, s.model, maxArea, (e) => setBusy({ p: e.progress, detail: e.stage === 'download' ? `Mengunduh model · ${e.detail ?? ''}` : e.detail }), ctrl.signal);
      const plain = await process(crop.blob, { ops: [{ type: 'resize', mode: 'exact', width: r.width, height: r.height, enlarge: true, filter: 'box' }], output: { ...defaultOutput, format: 'png' }, srcMime: 'image/png' }, ctrl.signal);
      setSample({ before: { blob: plain.blob, width: r.width, height: r.height }, after: { blob: r.blob, width: r.width, height: r.height } });
      setCached((x) => ({ ...x, [s.model]: true }));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ kind: 'error', title: 'Gagal memperbesar', body: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const apply = () =>
    runBatch({
      label: 'Memperbesar dengan AI',
      toolLabel: `Perbesar ${s.scale}×`,
      items: getScopedTargets(),
      concurrency: 1,
      work: (_i, ver, signal, _idx, report) => runUpscale(ver, s, signal, report),
    });

  return (
    <ToolShell
      tool={tool}
      stage={
        <div className="relative h-full">
          {sample ? <ImageStage before={sample.before} after={sample.after} showInfo={false} /> : <ActiveStage />}
          {sample && <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-surface/90 px-2 py-1 text-xs shadow">Contoh area tengah, diperbesar 4×</span>}
          {sample && (
            <button type="button" onClick={() => setSample(null)} className="absolute right-3 top-3 rounded-md bg-surface/90 px-2.5 py-1 text-xs font-medium shadow">
              Lihat gambar penuh
            </button>
          )}
          {busy && (
            <div className="absolute inset-x-4 top-14 mx-auto max-w-sm rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-pop)]">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{busy.detail}</span>
                <button type="button" className="text-[13px] font-medium text-muted" onClick={() => abort.current?.abort()}>
                  Batal
                </button>
              </div>
              <Progress value={busy.p > 0 ? busy.p : undefined} />
            </div>
          )}
        </div>
      }
      panel={
        <>
          <Section title="Model AI">
            <div className="grid gap-2">
              {UPSCALE_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => set({ model: m.id })}
                  aria-pressed={s.model === m.id}
                  className={cx('rounded-md border p-3 text-left', s.model === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{m.label}</span>
                    <span className="text-[11px] text-muted">{cached[m.id] ? 'Tersimpan offline' : `Unduh ${m.sizeMB} MB sekali`}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{m.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">Berjalan di {device === 'webgpu' ? 'GPU (WebGPU)' : 'CPU, cukup lambat untuk gambar besar'}.</p>
            {s.model === 'x4plus' && device !== 'webgpu' && <Notice kind="warn">Model ini sangat berat tanpa GPU. Gambar 1000 px bisa makan beberapa menit.</Notice>}
          </Section>
          <Section title="Skala">
            <Segmented
              value={s.scale}
              onChange={(scale) => set({ scale })}
              options={[
                { value: 2, label: '2×' },
                { value: 3, label: '3×' },
                { value: 4, label: '4×' },
              ]}
            />
            {v && p && (
              <p className="text-[13px] tabular-nums text-muted">
                {v.width}×{v.height} → <span className="font-semibold text-fg">{p.target.w}×{p.target.h}</span>
                {p.capped && <span className="block text-xs text-warn">Dibatasi oleh memori perangkat ini.</span>}
              </p>
            )}
            <Slider label="Tajamkan hasil" value={s.sharpen} min={0} max={60} onChange={(sharpen) => set({ sharpen })} defaultValue={0} />
            <Button block icon={MagnifyingGlassPlusIcon} loading={!!busy} onClick={trySample}>
              Coba di area kecil dulu
            </Button>
            <p className="text-xs text-muted">AI menebak detail yang hilang. Cocok untuk foto kecil, buram, atau hasil kompres. Teks kecil bisa berubah bentuk.</p>
          </Section>
        </>
      }
      footer={<ApplyBar label={`Perbesar ${s.scale}×`} onApply={apply} />}
    />
  );
}
