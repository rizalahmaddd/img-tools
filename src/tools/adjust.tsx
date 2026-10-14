import { useEffect, useRef, useState } from 'react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Button, Section, Slider, Switch, cx } from '@/components/ui';
import { FILTER_PRESETS, neutralAdjust, isNeutral } from '@/engine/adjust';
import { defaultOutput, type AdjustParams } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { process } from '@/engine/client';
import { useObjectUrl } from '@/lib/hooks';
import { toolById } from './registry';
import { ActiveStage, applyToTargets, tokenOf, useLivePreview } from './common';

const DEFAULTS = { ...neutralAdjust, preset: 'none', strength: 100 };
type S = typeof DEFAULTS;

const GROUPS: { title: string; keys: { k: keyof AdjustParams; label: string; min?: number; max?: number }[] }[] = [
  {
    title: 'Cahaya',
    keys: [
      { k: 'exposure', label: 'Eksposur' },
      { k: 'brightness', label: 'Kecerahan' },
      { k: 'contrast', label: 'Kontras' },
      { k: 'highlights', label: 'Highlight' },
      { k: 'shadows', label: 'Bayangan' },
    ],
  },
  {
    title: 'Warna',
    keys: [
      { k: 'saturation', label: 'Saturasi' },
      { k: 'vibrance', label: 'Vibrance' },
      { k: 'temperature', label: 'Suhu' },
      { k: 'tint', label: 'Tint' },
      { k: 'hue', label: 'Hue', min: -180, max: 180 },
    ],
  },
  {
    title: 'Efek',
    keys: [
      { k: 'sharpen', label: 'Tajamkan', min: 0 },
      { k: 'blur', label: 'Blur', min: 0 },
      { k: 'fade', label: 'Pudar', min: 0 },
      { k: 'vignette', label: 'Vinyet', min: 0 },
      { k: 'grain', label: 'Grain', min: 0 },
      { k: 'grayscale', label: 'Hitam putih', min: 0 },
      { k: 'sepia', label: 'Sepia', min: 0 },
    ],
  },
];

function params(s: S): Partial<AdjustParams> {
  const preset = FILTER_PRESETS.find((p) => p.id === s.preset)?.params ?? {};
  const k = s.strength / 100;
  const out: Partial<AdjustParams> = {};
  (Object.keys(neutralAdjust) as (keyof AdjustParams)[]).forEach((key) => {
    if (key === 'invert') {
      out.invert = s.invert || !!preset.invert;
      return;
    }
    const base = (preset[key] as number | undefined) ?? 0;
    (out as Record<string, number>)[key] = base * k + (s[key] as number);
  });
  return out;
}

function PresetThumb({ id, label, active, onClick, src }: { id: string; label: string; active: boolean; onClick: () => void; src?: Blob }) {
  const [blob, setBlob] = useState<Blob>();
  const url = useObjectUrl(blob ?? src);
  const last = useRef<Blob | undefined>(undefined);
  useEffect(() => {
    if (!src || last.current === src) return;
    last.current = src;
    const preset = FILTER_PRESETS.find((p) => p.id === id)!;
    if (isNeutral(preset.params)) return setBlob(src);
    process(src, { ops: [{ type: 'adjust', ...preset.params }], output: { ...defaultOutput, format: 'jpeg', quality: 80 }, srcMime: 'image/jpeg', previewMax: 140 })
      .then((r) => setBlob(r.blob))
      .catch(() => undefined);
  }, [src, id]);
  return (
    <button type="button" onClick={onClick} className="min-w-0 text-center" aria-pressed={active}>
      <span className={cx('block aspect-square overflow-hidden rounded-md bg-surface-2', active && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}>
        {url && <img src={url} alt="" className="size-full object-cover" />}
      </span>
      <span className={cx('mt-1 block truncate text-[11px]', active ? 'font-semibold text-fg' : 'text-muted')}>{label}</span>
    </button>
  );
}

export default function Adjust() {
  const tool = toolById('adjust')!;
  const [s, set, reset] = useToolSettings('adjust', DEFAULTS);
  const item = useActiveItem();
  const thumbSrc = item ? (current(item).thumb ?? current(item).blob) : undefined;
  const p = params(s);
  const neutral = isNeutral(p);
  const preview = useLivePreview((v) => (neutral ? null : { ops: [{ type: 'adjust', ...p }], output: defaultOutput, srcMime: v.mime }), tokenOf(p), { previewMax: 1600, debounce: 120 });

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage preview={preview.result} busy={preview.busy} />}
      panel={
        <>
          <Section title="Filter" action={!neutral && <Button size="sm" variant="ghost" onClick={reset}>Reset semua</Button>}>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 pt-1">
              {FILTER_PRESETS.map((f) => (
                <PresetThumb key={f.id} id={f.id} label={f.label} active={s.preset === f.id} onClick={() => set({ preset: f.id })} src={thumbSrc} />
              ))}
            </div>
            {s.preset !== 'none' && <Slider label="Kekuatan filter" value={s.strength} min={0} max={150} unit="%" onChange={(strength) => set({ strength })} defaultValue={100} />}
          </Section>
          {GROUPS.map((g) => (
            <Section key={g.title} title={g.title} collapsible defaultOpen={g.title !== 'Efek'}>
              {g.keys.map(({ k, label, min = -100, max = 100 }) => (
                <Slider key={k} label={label} value={s[k] as number} min={min} max={max} onChange={(val) => set({ [k]: val } as Partial<S>)} defaultValue={0} />
              ))}
              {g.title === 'Efek' && <Switch checked={s.invert} onChange={(invert) => set({ invert })} label="Negatif (invert)" />}
            </Section>
          ))}
          <p className="px-4 pb-4 text-xs text-muted">Ketuk dua kali slider untuk kembali ke 0. Pengaturan tersimpan untuk dipakai lagi.</p>
        </>
      }
      footer={<ApplyBar label="Terapkan" disabled={neutral} onApply={() => applyToTargets({ label: 'Menerapkan filter', toolLabel: 'Warna & filter', build: (_i, v) => ({ ops: [{ type: 'adjust', ...p }], output: defaultOutput, srcMime: v.mime }) })} />}
    />
  );
}
