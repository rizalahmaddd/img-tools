import { LockSimpleIcon, LockSimpleOpenIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { ColorInput, Field, IconButton, NumberInput, Section, Segmented, Select, Slider, Switch } from '@/components/ui';
import { defaultOutput, type ResizeFilter, type ResizeOp } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem, type Version } from '@/store/workspace';
import { canvasLimits } from '@/lib/device';
import { toolById } from './registry';
import { ActiveStage, applyToTargets } from './common';

type Mode = 'percent' | 'size' | 'long' | 'preset';
type Fit = 'contain' | 'pad' | 'cover' | 'stretch';
type Unit = 'px' | 'cm' | 'in';

const DEFAULTS = {
  mode: 'size' as Mode,
  percent: 50,
  width: 1920 as number | null,
  height: null as number | null,
  lock: true,
  edited: 'w' as 'w' | 'h',
  unit: 'px' as Unit,
  dpi: 300,
  fit: 'contain' as Fit,
  background: '#ffffff',
  enlarge: false,
  filter: 'mks2013' as ResizeFilter,
  side: 1600,
  preset: 'ig-square',
};

type S = typeof DEFAULTS;

export const SIZE_PRESETS: { id: string; group: string; label: string; w: number; h: number }[] = [
  { id: 'ig-square', group: 'Instagram', label: 'Post persegi', w: 1080, h: 1080 },
  { id: 'ig-portrait', group: 'Instagram', label: 'Post potret 4:5', w: 1080, h: 1350 },
  { id: 'ig-story', group: 'Instagram', label: 'Story / Reels', w: 1080, h: 1920 },
  { id: 'wa-status', group: 'WhatsApp', label: 'Status', w: 1080, h: 1920 },
  { id: 'wa-profile', group: 'WhatsApp', label: 'Foto profil', w: 640, h: 640 },
  { id: 'tiktok', group: 'TikTok', label: 'Video cover', w: 1080, h: 1920 },
  { id: 'yt-thumb', group: 'YouTube', label: 'Thumbnail', w: 1280, h: 720 },
  { id: 'yt-banner', group: 'YouTube', label: 'Banner channel', w: 2560, h: 1440 },
  { id: 'fb-post', group: 'Facebook', label: 'Post', w: 1200, h: 630 },
  { id: 'fb-cover', group: 'Facebook', label: 'Sampul', w: 1640, h: 624 },
  { id: 'x-post', group: 'X / Twitter', label: 'Post', w: 1600, h: 900 },
  { id: 'x-header', group: 'X / Twitter', label: 'Header', w: 1500, h: 500 },
  { id: 'li-banner', group: 'LinkedIn', label: 'Banner', w: 1584, h: 396 },
  { id: 'shopee', group: 'Marketplace', label: 'Foto produk 1:1', w: 1000, h: 1000 },
  { id: 'og', group: 'Web', label: 'Open Graph', w: 1200, h: 630 },
  { id: 'hd', group: 'Layar', label: 'Full HD', w: 1920, h: 1080 },
  { id: '4k', group: 'Layar', label: '4K UHD', w: 3840, h: 2160 },
  { id: 'pas-2x3', group: 'Pas foto 300 dpi', label: '2×3 cm', w: 236, h: 354 },
  { id: 'pas-3x4', group: 'Pas foto 300 dpi', label: '3×4 cm', w: 354, h: 472 },
  { id: 'pas-4x6', group: 'Pas foto 300 dpi', label: '4×6 cm', w: 472, h: 709 },
  { id: 'a4', group: 'Cetak 300 dpi', label: 'A4', w: 2480, h: 3508 },
  { id: '4r', group: 'Cetak 300 dpi', label: '4R (10×15 cm)', w: 1200, h: 1800 },
];

const toPx = (v: number | null, s: S) => (v == null ? null : s.unit === 'px' ? v : s.unit === 'cm' ? (v / 2.54) * s.dpi : v * s.dpi);
const fromPx = (v: number, s: S) => (s.unit === 'px' ? Math.round(v) : s.unit === 'cm' ? +((v / s.dpi) * 2.54).toFixed(2) : +(v / s.dpi).toFixed(2));

function buildOp(s: S): ResizeOp | null {
  const base = { type: 'resize' as const, enlarge: s.enlarge, filter: s.filter };
  if (s.mode === 'percent') return { ...base, mode: 'percent', percent: s.percent, enlarge: s.percent > 100 || s.enlarge };
  if (s.mode === 'long') return { ...base, mode: 'long', side: s.side };
  let w: number | null;
  let h: number | null;
  let fit: Fit = s.fit;
  if (s.mode === 'preset') {
    const p = SIZE_PRESETS.find((x) => x.id === s.preset) ?? SIZE_PRESETS[0];
    w = p.w;
    h = p.h;
    if (fit === 'contain') fit = 'cover';
  } else {
    w = toPx(s.width, s);
    h = toPx(s.height, s);
    if (s.lock) {
      if (s.edited === 'w' && w) return { ...base, mode: 'width', width: w };
      if (h) return { ...base, mode: 'height', height: h };
      if (w) return { ...base, mode: 'width', width: w };
      return null;
    }
  }
  if (!w && !h) return null;
  if (!w) return { ...base, mode: 'height', height: h! };
  if (!h) return { ...base, mode: 'width', width: w };
  if (fit === 'stretch') return { ...base, mode: 'exact', width: w, height: h };
  if (fit === 'cover') return { ...base, mode: 'cover', width: w, height: h, enlarge: true };
  if (fit === 'pad') return { ...base, mode: 'contain', width: w, height: h, background: s.background, enlarge: true };
  return { ...base, mode: 'contain', width: w, height: h };
}

function predict(op: ResizeOp | null, v: Version) {
  if (!op) return null;
  const r = v.width / v.height;
  let w = v.width;
  let h = v.height;
  switch (op.mode) {
    case 'percent':
      w = (v.width * op.percent!) / 100;
      h = (v.height * op.percent!) / 100;
      break;
    case 'width':
      w = op.width!;
      h = w / r;
      break;
    case 'height':
      h = op.height!;
      w = h * r;
      break;
    case 'long': {
      const k = op.side! / Math.max(v.width, v.height);
      w = v.width * k;
      h = v.height * k;
      break;
    }
    case 'exact':
    case 'cover':
      w = op.width!;
      h = op.height!;
      break;
    case 'contain': {
      if (op.background !== undefined) {
        w = op.width!;
        h = op.height!;
      } else {
        const k = Math.min(op.width! / v.width, op.height! / v.height);
        w = v.width * k;
        h = v.height * k;
      }
      break;
    }
  }
  if (!op.enlarge && (w > v.width || h > v.height) && op.mode !== 'cover') {
    const k = Math.min(v.width / w, v.height / h);
    w *= k;
    h *= k;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

export default function Resize() {
  const tool = toolById('resize')!;
  const [s, set] = useToolSettings('resize', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const op = buildOp(s);
  const out = v ? predict(op, v) : null;
  const aspect = v ? v.width / v.height : 1;
  const tooBig = out && out.w * out.h > canvasLimits().maxArea;

  const setW = (w: number | null) => {
    if (s.lock && w && v) set({ width: w, height: fromPx((toPx(w, s)! / aspect), s), edited: 'w' });
    else set({ width: w, edited: 'w' });
  };
  const setH = (h: number | null) => {
    if (s.lock && h && v) set({ height: h, width: fromPx(toPx(h, s)! * aspect, s), edited: 'h' });
    else set({ height: h, edited: 'h' });
  };

  const groups = [...new Set(SIZE_PRESETS.map((p) => p.group))];

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage />}
      panel={
        <>
          <Section title="Cara mengubah">
            <Segmented
              value={s.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'size', label: 'Ukuran' },
                { value: 'percent', label: 'Persen' },
                { value: 'long', label: 'Sisi panjang' },
                { value: 'preset', label: 'Preset' },
              ]}
            />
            {s.mode === 'percent' && (
              <>
                <Slider label="Skala" value={s.percent} min={1} max={400} unit="%" onChange={(percent) => set({ percent })} defaultValue={50} />
                <div className="flex flex-wrap gap-1.5">
                  {[25, 50, 75, 150, 200].map((p) => (
                    <button key={p} type="button" className={`h-8 rounded-md border px-3 text-xs font-medium ${s.percent === p ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`} onClick={() => set({ percent: p })}>
                      {p}%
                    </button>
                  ))}
                </div>
              </>
            )}
            {s.mode === 'long' && (
              <Field label="Sisi terpanjang" hint="Potret dan lanskap diperlakukan sama: sisi yang lebih panjang jadi ukuran ini.">
                <NumberInput value={s.side} onChange={(side) => set({ side: side ?? 1600 })} min={1} max={20000} unit="px" label="Sisi terpanjang" />
              </Field>
            )}
            {s.mode === 'size' && (
              <>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label="Lebar">
                      <NumberInput value={s.width} onChange={setW} min={0.01} unit={s.unit} allowEmpty label="Lebar" placeholder="otomatis" />
                    </Field>
                  </div>
                  <IconButton icon={s.lock ? LockSimpleIcon : LockSimpleOpenIcon} label={s.lock ? 'Rasio terkunci' : 'Rasio bebas'} active={s.lock} onClick={() => set({ lock: !s.lock })} />
                  <div className="min-w-0 flex-1">
                    <Field label="Tinggi">
                      <NumberInput value={s.height} onChange={setH} min={0.01} unit={s.unit} allowEmpty label="Tinggi" placeholder="otomatis" />
                    </Field>
                  </div>
                </div>
                <Segmented
                  size="sm"
                  value={s.unit}
                  onChange={(unit) => {
                    const conv = (x: number | null) => (x == null ? null : unit === 'px' ? Math.round(toPx(x, s)!) : fromPx(toPx(x, s)!, { ...s, unit }));
                    set({ unit, width: conv(s.width), height: conv(s.height) });
                  }}
                  options={[
                    { value: 'px', label: 'Piksel' },
                    { value: 'cm', label: 'cm' },
                    { value: 'in', label: 'inci' },
                  ]}
                />
                {s.unit !== 'px' && (
                  <Field label="Resolusi cetak">
                    <NumberInput value={s.dpi} onChange={(dpi) => set({ dpi: dpi ?? 300 })} min={30} max={2400} unit="dpi" label="DPI" />
                  </Field>
                )}
                {s.lock && <p className="text-xs text-muted">Rasio terkunci: setiap gambar mengikuti {s.edited === 'w' ? 'lebar' : 'tinggi'} ini, sisi lain menyesuaikan rasio masing-masing.</p>}
              </>
            )}
            {s.mode === 'preset' && (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="mb-1 text-xs font-medium text-muted">{g}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SIZE_PRESETS.filter((p) => p.group === g).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => set({ preset: p.id })}
                          className={`rounded-md border px-2.5 py-1.5 text-left text-xs ${s.preset === p.id ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2'}`}
                        >
                          <span className="block font-medium">{p.label}</span>
                          <span className="tabular-nums text-muted">
                            {p.w}×{p.h}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
          {(s.mode === 'preset' || (s.mode === 'size' && !s.lock && s.width && s.height)) && (
            <Section title="Kalau rasio berbeda">
              <Segmented
                                value={s.mode === 'preset' && s.fit === 'contain' ? 'cover' : s.fit}
                onChange={(fit) => set({ fit })}
                options={[
                  ...(s.mode === 'size' ? [{ value: 'contain' as Fit, label: 'Muat di dalam' }] : []),
                  { value: 'cover', label: 'Isi & potong' },
                  { value: 'pad', label: 'Beri latar' },
                  { value: 'stretch', label: 'Regangkan' },
                ]}
              />
              {s.fit === 'pad' && (
                <Field label="Warna latar">
                  <ColorInput value={s.background} onChange={(background) => set({ background })} allowTransparent />
                </Field>
              )}
            </Section>
          )}
          <Section title="Kualitas" collapsible defaultOpen={false}>
            <Switch checked={s.enlarge} onChange={(enlarge) => set({ enlarge })} label="Boleh memperbesar" hint="Untuk memperbesar dengan detail lebih baik, pakai Perbesar HD (AI)." />
            <Field label="Metode resampling">
              <Select
                value={s.filter}
                onChange={(filter) => set({ filter })}
                options={[
                  { value: 'mks2013', label: 'Otomatis tajam (disarankan)' },
                  { value: 'lanczos3', label: 'Lanczos 3' },
                  { value: 'lanczos2', label: 'Lanczos 2 (lebih halus)' },
                  { value: 'hamming', label: 'Hamming' },
                  { value: 'box', label: 'Box (pixel art)' },
                ]}
              />
            </Field>
          </Section>
        </>
      }
      footer={
        <ApplyBar
          label="Ubah ukuran"
          disabled={!op}
          onApply={() => op && applyToTargets({ label: 'Mengubah ukuran', toolLabel: 'Ubah ukuran', build: (_i, v) => ({ ops: [op], output: defaultOutput, srcMime: v.mime }) })}
          extra={
            v &&
            out && (
              <p className="text-center text-[13px] tabular-nums text-muted">
                {v.width}×{v.height} → <span className="font-semibold text-fg">{out.w}×{out.h}</span>
                {tooBig && <span className="block text-xs text-warn">Melebihi batas memori perangkat, hasil akan dibatasi.</span>}
              </p>
            )
          }
        />
      }
    />
  );
}

