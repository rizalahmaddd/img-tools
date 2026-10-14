import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Field, Section, Notice } from '@/components/ui';
import { defaultOutput, type OutputSpec } from '@/engine/types';
import { formatById, FORMATS, mimeLabel } from '@/engine/formats';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { toolById } from './registry';
import { ActiveStage, OutputControls, applyToTargets, tokenOf, useLivePreview } from './common';

const DEFAULTS = { ...defaultOutput, format: 'webp' as OutputSpec['format'], quality: 85, icoSizes: [16, 32, 48, 256] };

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

export default function Convert() {
  const tool = toolById('convert')!;
  const [s, set] = useToolSettings('convert', DEFAULTS);
  const item = useActiveItem();
  const preview = useLivePreview((v) => ({ ops: [], output: s, srcMime: v.mime }), tokenOf(s), { debounce: 350, enabled: s.format !== 'ico' && s.format !== 'tiff' && s.format !== 'jxl' });
  const fmt = s.format !== 'original' && s.format !== 'auto' ? formatById(s.format) : null;
  const src = item ? current(item) : null;

  return (
    <ToolShell
      tool={tool}
      stage={<ActiveStage preview={preview.result} busy={preview.busy} note={preview.error ?? undefined} />}
      panel={
        <>
          <Section title="Konversi">
            {src && (
              <p className="text-[13px] text-muted">
                Format sekarang: <span className="font-medium text-fg">{mimeLabel(src.mime)}</span>
                {item && item.sourceMime !== src.mime && <> (asli {mimeLabel(item.sourceMime)})</>}
              </p>
            )}
            <OutputControls spec={s} set={set} formats={FORMATS.map((f) => f.id)} />
            {s.format === 'ico' && (
              <Field label="Ukuran di dalam ICO">
                <div className="flex flex-wrap gap-1.5">
                  {ICO_SIZES.map((n) => {
                    const on = s.icoSizes.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ icoSizes: on ? s.icoSizes.filter((x) => x !== n) : [...s.icoSizes, n].sort((a, b) => a - b) })}
                        className={`h-8 rounded-md border px-2.5 text-xs font-medium tabular-nums ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line'}`}
                      >
                        {n}px
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            {(s.format === 'jxl' || s.format === 'tiff' || s.format === 'ico') && (
              <Notice>Pratinjau {fmt?.label} tidak ditampilkan karena browser belum tentu bisa menampilkannya. File tetap dibuat dengan benar.</Notice>
            )}
            {s.format === 'gif' && <Notice>GIF maksimal 256 warna. Untuk animasi dari banyak gambar, pakai alat Buat GIF.</Notice>}
          </Section>
        </>
      }
      footer={
        <ApplyBar
          label={`Ubah ke ${fmt?.label ?? ''}`}
          disabled={s.format === 'ico' && !s.icoSizes.length}
          onApply={() => applyToTargets({ label: 'Mengonversi', toolLabel: `Ke ${fmt?.label}`, build: (_i, v) => ({ ops: [], output: s, srcMime: v.mime }) })}
        />
      }
    />
  );
}
