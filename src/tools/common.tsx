import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ImageStage } from '@/components/ImageStage';
import { Field, NumberInput, Segmented, Slider, Switch, ColorInput } from '@/components/ui';
import { process } from '@/engine/client';
import { formatById, FORMATS } from '@/engine/formats';
import type { Format, Job, JobResult, OutputSpec } from '@/engine/types';
import { defaultOutput } from '@/engine/types';
import { runBatch } from '@/lib/batch';
import { getScopedTargets } from '@/store/scope';
import { current, useActiveItem, type Item, type Version } from '@/store/workspace';
import { errorMessage } from '@/store/ui';

export type JobInput = Omit<Job, 'maxArea' | 'maxDim'>;

export function useLivePreview(build: (v: Version, item: Item) => JobInput | null, key: string, opts: { previewMax?: number; debounce?: number; enabled?: boolean } = {}) {
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const [state, setState] = useState<{ result: JobResult | null; busy: boolean; error: string | null; forKey: string }>({ result: null, busy: false, error: null, forKey: '' });
  const seq = useRef(0);
  const running = useRef(false);
  const pending = useRef<(() => void) | null>(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  const fullKey = `${v?.id}|${key}|${opts.previewMax ?? 0}`;
  const enabled = opts.enabled ?? true;

  useEffect(() => {
    if (!item || !v || !enabled) {
      setState({ result: null, busy: false, error: null, forKey: fullKey });
      return;
    }
    const job = buildRef.current(v, item);
    if (!job) {
      setState({ result: null, busy: false, error: null, forKey: fullKey });
      return;
    }
    const id = ++seq.current;
    const run = () => {
      running.current = true;
      setState((s) => ({ ...s, busy: true }));
      process(v.blob, { ...job, previewMax: opts.previewMax })
        .then((result) => {
          if (id === seq.current) setState({ result, busy: false, error: null, forKey: fullKey });
        })
        .catch((e) => {
          if (id === seq.current) setState({ result: null, busy: false, error: errorMessage(e), forKey: fullKey });
        })
        .finally(() => {
          running.current = false;
          const p = pending.current;
          pending.current = null;
          p?.();
        });
    };
    const t = setTimeout(() => {
      if (running.current) pending.current = run;
      else run();
    }, opts.debounce ?? 280);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, enabled]);

  return { ...state, stale: state.forKey !== fullKey };
}

export function applyToTargets(o: { label: string; toolLabel: string; build: (item: Item, v: Version, index: number) => JobInput | null; onDone?: () => void }) {
  const items = getScopedTargets();
  return runBatch({
    label: o.label,
    toolLabel: o.toolLabel,
    items,
    work: async (item, v, signal, index) => {
      const job = o.build(item, v, index);
      if (!job) return null;
      return process(v.blob, job, signal);
    },
    onDone: o.onDone,
  });
}

export function ActiveStage({ preview, busy, note, extra }: { preview?: JobResult | null; busy?: boolean; note?: string; extra?: ReactNode }) {
  const item = useActiveItem();
  if (!item) return null;
  const v = current(item);
  return (
    <ImageStage
      before={{ blob: v.blob, width: v.width, height: v.height, mime: v.mime }}
      after={preview ? { blob: preview.blob, width: preview.width, height: preview.height, mime: preview.mime } : null}
      busy={busy}
      resetKey={item.id}
      note={note}
      extra={extra}
    />
  );
}

export const tokenOf = (o: unknown) => JSON.stringify(o, (_k, v) => (v instanceof Blob ? `blob:${v.size}:${v.type}` : v));

export function OutputControls({
  spec,
  set,
  formats = ['jpeg', 'png', 'webp', 'avif'],
  allowOriginal,
  showTarget,
}: {
  spec: OutputSpec;
  set: (p: Partial<OutputSpec>) => void;
  formats?: Format[];
  allowOriginal?: boolean;
  showTarget?: boolean;
}) {
  const fmt = spec.format === 'original' || spec.format === 'auto' ? null : formatById(spec.format);
  const lossy = !fmt || fmt.lossy;
  const usesTarget = showTarget && !!spec.targetKB;
  return (
    <div className="space-y-4">
      <Field label="Format hasil">
        <Segmented
                    value={spec.format}
          onChange={(format) => set({ format })}
          options={[
            ...(allowOriginal ? [{ value: 'original' as const, label: 'Sama' }] : []),
            ...formats.map((f) => ({ value: f, label: formatById(f).label, title: formatById(f).note })),
          ]}
        />
      </Field>
      {fmt?.note && <p className="-mt-2 text-xs text-muted">{fmt.note}</p>}
      {showTarget && (
        <Field label="Target ukuran maksimal" hint={usesTarget ? 'Kualitas dicari otomatis supaya file tidak melebihi target.' : 'Kosongkan untuk memakai slider kualitas.'}>
          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1">
              <NumberInput value={spec.targetKB ?? null} onChange={(targetKB) => set({ targetKB })} min={1} max={100000} unit="KB" placeholder="mis. 200" allowEmpty label="Target KB" />
            </div>
            {[100, 200, 500].map((kb) => (
              <button
                key={kb}
                type="button"
                onClick={() => set({ targetKB: spec.targetKB === kb ? null : kb })}
                className={`h-10 shrink-0 rounded-md border px-2.5 text-xs font-medium ${spec.targetKB === kb ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2'}`}
              >
                {kb}
              </button>
            ))}
          </div>
        </Field>
      )}
      {usesTarget && <Switch checked={!!spec.allowDownscale} onChange={(allowDownscale) => set({ allowDownscale })} label="Boleh perkecil dimensi" hint="Kalau target terlalu kecil, gambar diperkecil sampai muat." />}
      {lossy && !usesTarget && !spec.lossless && spec.format !== 'png' && (
        <Slider label="Kualitas" value={spec.quality} min={1} max={100} onChange={(quality) => set({ quality })} defaultValue={82} hint={qualityHint(spec.quality)} />
      )}
      {(spec.format === 'png' || spec.format === 'gif') && (
        <>
          <Slider
            label="Jumlah warna"
            value={spec.pngColors === 0 ? 257 : spec.pngColors}
            min={2}
            max={257}
            onChange={(n) => set({ pngColors: n >= 257 ? 0 : Math.round(n) })}
            format={(n) => (n >= 257 ? 'Tanpa batas (lossless)' : `${Math.round(n)} warna`)}
            hint="Membatasi warna memperkecil PNG drastis, mirip TinyPNG. 128–256 biasanya tidak terlihat bedanya."
          />
          {spec.pngColors > 0 && <Switch checked={spec.pngDither} onChange={(pngDither) => set({ pngDither })} label="Dithering" hint="Gradasi lebih halus, file sedikit lebih besar." />}
          {spec.format === 'png' && (
            <Switch
              checked={spec.pngOptimize >= 0}
              onChange={(on) => set({ pngOptimize: on ? 3 : -1 })}
              label="Optimasi OxiPNG"
              hint="Tanpa mengubah piksel. Lebih lambat untuk gambar besar."
            />
          )}
        </>
      )}
      {fmt && fmt.lossless && fmt.lossy && <Switch checked={spec.lossless} onChange={(lossless) => set({ lossless })} label="Lossless" hint="Tanpa penurunan kualitas, file lebih besar." />}
      {spec.format === 'jpeg' && (
        <>
          <Switch checked={spec.jpegProgressive} onChange={(jpegProgressive) => set({ jpegProgressive })} label="Progressive" hint="Muncul bertahap di web, biasanya sedikit lebih kecil." />
          <Switch checked={spec.jpegChroma === '444'} onChange={(on) => set({ jpegChroma: on ? '444' : '420' })} label="Warna penuh (4:4:4)" hint="Teks & garis merah lebih tajam, file lebih besar." />
        </>
      )}
      {(spec.format === 'avif' || spec.format === 'webp' || spec.format === 'jxl') && (
        <Slider label="Usaha kompresi" value={spec.effort} min={0} max={9} onChange={(effort) => set({ effort })} format={(v) => (v <= 2 ? 'Cepat' : v >= 7 ? 'Maksimal' : 'Seimbang')} />
      )}
      {fmt && !fmt.alpha && (
        <Field label="Warna latar untuk area transparan">
          <ColorInput value={spec.background} onChange={(background) => set({ background })} />
        </Field>
      )}
    </div>
  );
}

function qualityHint(q: number) {
  if (q >= 90) return 'Hampir sama dengan asli, file besar.';
  if (q >= 75) return 'Seimbang. Cocok untuk web & media sosial.';
  if (q >= 50) return 'Kecil, mulai terlihat artefak di detail halus.';
  return 'Sangat kecil, kualitas turun jelas.';
}

export const FORMAT_IDS = FORMATS.map((f) => f.id);
export { defaultOutput };
