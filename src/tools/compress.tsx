import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Chip, Field, NumberInput, Section, Switch } from '@/components/ui';
import { process } from '@/engine/client';
import { defaultOutput, type Op, type OutputSpec } from '@/engine/types';
import { runBatch, skip } from '@/lib/batch';
import { formatBytes, percentChange } from '@/lib/format';
import { getScopedTargets } from '@/store/scope';
import { useToolSettings } from '@/store/settings';
import { useActiveItem, current } from '@/store/workspace';
import { toolById } from './registry';
import { ActiveStage, OutputControls, tokenOf, useLivePreview } from './common';

const DEFAULTS = {
  ...defaultOutput,
  format: 'original' as OutputSpec['format'],
  quality: 75,
  pngColors: 256,
  pngOptimize: 2,
  maxSide: 0,
  keepIfLarger: true,
};

type S = typeof DEFAULTS;

const PRESETS: { label: string; patch: Partial<S> }[] = [
  { label: 'Seimbang', patch: { format: 'original', quality: 75, targetKB: null, pngColors: 256 } },
  { label: 'Kecil sekali', patch: { format: 'webp', quality: 55, targetKB: null } },
  { label: 'Upload formulir < 200 KB', patch: { format: 'jpeg', targetKB: 200, allowDownscale: true } },
  { label: 'WhatsApp', patch: { format: 'jpeg', quality: 80, maxSide: 1600, targetKB: null } },
  { label: 'Web modern', patch: { format: 'avif', quality: 55, targetKB: null, maxSide: 2560 } },
];

function buildOps(s: S): Op[] {
  return s.maxSide > 0 ? [{ type: 'resize', mode: 'long', side: s.maxSide, enlarge: false, filter: 'mks2013' }] : [];
}

export default function Compress() {
  const tool = toolById('compress')!;
  const [s, set] = useToolSettings('compress', DEFAULTS);
  const item = useActiveItem();
  const preview = useLivePreview((v) => ({ ops: buildOps(s), output: s, srcMime: v.mime }), tokenOf(s), { debounce: 350 });
  const before = item ? current(item).size : 0;
  const after = preview.result?.blob.size ?? 0;
  const larger = !!preview.result && after >= before;

  const apply = () =>
    runBatch({
      label: 'Mengompres',
      toolLabel: 'Kompres',
      items: getScopedTargets(),
      work: async (_item, v, signal) => {
        const r = await process(v.blob, { ops: buildOps(s), output: s, srcMime: v.mime }, signal);
        if (s.keepIfLarger && r.blob.size >= v.size && r.width === v.width && r.mime === v.mime) {
          return skip('Hasil kompres tidak lebih kecil dari file sekarang, jadi file asli dipertahankan. Turunkan kualitas, ganti format (WebP/AVIF), atau isi target KB.');
        }
        return r;
      },
    });

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage preview={preview.result} busy={preview.busy} note={preview.error ?? preview.result?.note} />}
      panel={
        <>
          <Section title="Preset">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Chip key={p.label} onClick={() => set(p.patch)}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </Section>
          <Section title="Kompresi">
            <OutputControls spec={s} set={set} allowOriginal showTarget formats={['jpeg', 'png', 'webp', 'avif', 'jxl']} />
          </Section>
          <Section title="Lainnya" collapsible defaultOpen={s.maxSide > 0}>
            <Field label="Sisi terpanjang maksimal" hint="0 = tidak diubah. Gambar yang lebih kecil tidak diperbesar.">
              <NumberInput value={s.maxSide} onChange={(maxSide) => set({ maxSide: maxSide ?? 0 })} min={0} max={20000} unit="px" label="Sisi maksimal" />
            </Field>
            <Switch checked={s.keepIfLarger} onChange={(keepIfLarger) => set({ keepIfLarger })} label="Lewati kalau hasil lebih besar" hint="File yang sudah optimal tidak diganti." />
          </Section>
        </>
      }
      footer={
        <ApplyBar
          label="Kompres"
          onApply={apply}
          extra={
            preview.result && (
              <p className="text-center text-[13px] tabular-nums text-muted">
                {formatBytes(before)} → <span className="font-semibold text-fg">{formatBytes(after)}</span>{' '}
                <span className={larger ? 'text-warn' : 'text-ok'}>{percentChange(before, after)}</span>
                {larger && s.keepIfLarger && <span className="block text-xs text-warn">Lebih besar dari asli, gambar ini akan dilewati</span>}
              </p>
            )
          }
        />
      }
    />
  );
}
