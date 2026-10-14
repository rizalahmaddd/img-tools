import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, FlipHorizontalIcon, FlipVerticalIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Button, ColorInput, Field, Section, Slider, Switch } from '@/components/ui';
import { defaultOutput, type Op } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { toolById } from './registry';
import { ActiveStage, applyToTargets, tokenOf, useLivePreview } from './common';

const DEFAULTS = { angle: 90, flipH: false, flipV: false, background: 'transparent', fill: false };
type S = typeof DEFAULTS;

const ops = (s: S): Op[] => {
  const out: Op[] = [];
  if (s.flipH || s.flipV) out.push({ type: 'flip', h: s.flipH, v: s.flipV });
  if (s.angle % 360) out.push({ type: 'rotate', angle: s.angle, background: s.background, fill: s.fill });
  return out;
};

export default function Rotate() {
  const tool = toolById('rotate')!;
  const [s, set] = useToolSettings('rotate', DEFAULTS);
  const preview = useLivePreview((v) => (ops(s).length ? { ops: ops(s), output: defaultOutput, srcMime: v.mime } : null), tokenOf(s), { previewMax: 1400, debounce: 150 });
  const norm = ((s.angle % 360) + 360) % 360;
  const odd = norm % 90 !== 0;

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage preview={preview.result} busy={preview.busy} />}
      panel={
        <>
          <Section title="Putar">
            <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
              <Button icon={ArrowCounterClockwiseIcon} className="px-2!" onClick={() => set({ angle: (norm + 270) % 360 })} aria-label="Putar kiri 90°">
                90°
              </Button>
              <Button icon={ArrowClockwiseIcon} className="px-2!" onClick={() => set({ angle: (norm + 90) % 360 })} aria-label="Putar kanan 90°">
                90°
              </Button>
              <Button className="px-2!" onClick={() => set({ angle: (norm + 180) % 360 })}>180°</Button>
              <Button variant="ghost" className="px-2!" onClick={() => set({ angle: 0 })}>
                0°
              </Button>
            </div>
            <Slider label="Sudut" value={s.angle > 180 ? s.angle - 360 : s.angle} min={-180} max={180} step={0.5} unit="°" onChange={(angle) => set({ angle: (angle + 360) % 360 })} defaultValue={0} />
            {odd && (
              <>
                <Switch checked={s.fill} onChange={(fill) => set({ fill })} label="Potong pinggiran kosong" hint="Gambar diperbesar sedikit supaya tidak ada sudut kosong." />
                {!s.fill && (
                  <Field label="Warna sudut kosong">
                    <ColorInput value={s.background} onChange={(background) => set({ background })} allowTransparent />
                  </Field>
                )}
              </>
            )}
          </Section>
          <Section title="Balik (mirror)">
            <div className="grid grid-cols-2 gap-2">
              <Button icon={FlipHorizontalIcon} onClick={() => set({ flipH: !s.flipH })} className={s.flipH ? 'ring-2 ring-accent' : ''}>
                Horizontal
              </Button>
              <Button icon={FlipVerticalIcon} onClick={() => set({ flipV: !s.flipV })} className={s.flipV ? 'ring-2 ring-accent' : ''}>
                Vertikal
              </Button>
            </div>
          </Section>
        </>
      }
      footer={
        <ApplyBar
          label="Terapkan"
          disabled={!ops(s).length}
          onApply={() => applyToTargets({ label: 'Memutar', toolLabel: 'Putar', build: (_i, v) => ({ ops: ops(s), output: defaultOutput, srcMime: v.mime }) })}
        />
      }
    />
  );
}
