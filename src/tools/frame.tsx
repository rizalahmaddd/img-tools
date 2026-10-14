import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { ColorInput, Field, Section, Segmented, Slider } from '@/components/ui';
import { defaultOutput, type FrameOp } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { toolById } from './registry';
import { ActiveStage, applyToTargets, tokenOf, useLivePreview } from './common';

const DEFAULTS = {
  padding: 6,
  aspect: 'none',
  bgType: 'color' as FrameOp['bgType'],
  bgColor: '#ffffff',
  bgColor2: '#d9d4cc',
  blur: 60,
  radius: 0,
  border: 0,
  borderColor: '#ffffff',
  shadow: 0,
};
type S = typeof DEFAULTS;

const ASPECTS: { id: string; label: string; r: number }[] = [
  { id: 'none', label: 'Ikuti gambar', r: 0 },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 4 / 5 },
  { id: '9:16', label: '9:16', r: 9 / 16 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
  { id: '3:2', label: '3:2', r: 3 / 2 },
  { id: '2:3', label: '2:3', r: 2 / 3 },
];

const PRESETS: { label: string; patch: Partial<S> }[] = [
  { label: 'Polos putih', patch: { padding: 6, bgType: 'color', bgColor: '#ffffff', radius: 0, shadow: 0, border: 0 } },
  { label: 'Feed IG tanpa crop', patch: { aspect: '1:1', padding: 0, bgType: 'blur', radius: 0, shadow: 0, border: 0 } },
  { label: 'Story blur', patch: { aspect: '9:16', padding: 0, bgType: 'blur', radius: 3, shadow: 40 } },
  { label: 'Kartu bulat', patch: { padding: 8, bgType: 'gradient', bgColor: '#f4efe6', bgColor2: '#dcd3c4', radius: 6, shadow: 50 } },
  { label: 'Polaroid', patch: { padding: 5, bgType: 'color', bgColor: '#fbfaf7', radius: 0, shadow: 0, border: 0 } },
  { label: 'Screenshot', patch: { padding: 7, bgType: 'gradient', bgColor: '#3b3f52', bgColor2: '#1e2130', radius: 3, shadow: 60 } },
];

const toOp = (s: S): FrameOp => ({ type: 'frame', ...s, aspect: ASPECTS.find((a) => a.id === s.aspect)?.r ?? 0 });

export default function Frame() {
  const tool = toolById('frame')!;
  const [s, set] = useToolSettings('frame', DEFAULTS);
  const op = toOp(s);
  const preview = useLivePreview((v) => ({ ops: [op], output: defaultOutput, srcMime: v.mime }), tokenOf(s), { previewMax: 1400, debounce: 150 });

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage preview={preview.result} busy={preview.busy} />}
      panel={
        <>
          <Section title="Preset">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="h-8 rounded-full border border-line px-3 text-[13px] font-medium hover:bg-surface-2" onClick={() => set(p.patch)}>
                  {p.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Kanvas">
            <Field label="Rasio kanvas" hint="Gambar tidak dipotong, kanvas yang menyesuaikan.">
              <Segmented value={s.aspect} onChange={(aspect) => set({ aspect })} options={ASPECTS.map((a) => ({ value: a.id, label: a.label }))} />
            </Field>
            <Slider label="Padding" value={s.padding} min={0} max={40} step={0.5} unit="%" onChange={(padding) => set({ padding })} defaultValue={6} />
          </Section>
          <Section title="Latar">
            <Segmented
              value={s.bgType}
              onChange={(bgType) => set({ bgType })}
              options={[
                { value: 'color', label: 'Warna' },
                { value: 'gradient', label: 'Gradasi' },
                { value: 'blur', label: 'Blur foto' },
                { value: 'transparent', label: 'Transparan' },
              ]}
            />
            {(s.bgType === 'color' || s.bgType === 'gradient') && <ColorInput value={s.bgColor} onChange={(bgColor) => set({ bgColor })} label="Warna latar" />}
            {s.bgType === 'gradient' && <ColorInput value={s.bgColor2} onChange={(bgColor2) => set({ bgColor2 })} label="Warna kedua" />}
            {s.bgType === 'blur' && <Slider label="Kekuatan blur" value={s.blur} min={5} max={100} onChange={(blur) => set({ blur })} defaultValue={60} />}
          </Section>
          <Section title="Gambar">
            <Slider label="Sudut bulat" value={s.radius} min={0} max={50} step={0.5} unit="%" onChange={(radius) => set({ radius })} defaultValue={0} />
            <Slider label="Garis tepi" value={s.border} min={0} max={20} step={0.5} onChange={(border) => set({ border })} defaultValue={0} />
            {s.border > 0 && <ColorInput value={s.borderColor} onChange={(borderColor) => set({ borderColor })} label="Warna garis tepi" />}
            <Slider label="Bayangan" value={s.shadow} min={0} max={100} onChange={(shadow) => set({ shadow })} defaultValue={0} />
          </Section>
        </>
      }
      footer={<ApplyBar label="Terapkan bingkai" onApply={() => applyToTargets({ label: 'Membuat bingkai', toolLabel: 'Bingkai', build: (_i, v) => ({ ops: [op], output: defaultOutput, srcMime: v.mime }) })} />}
    />
  );
}
