import { useEffect, useRef, useState } from 'react';
import { CopyIcon, EyedropperIcon } from '@phosphor-icons/react';
import { ToolShell } from '@/components/ToolShell';
import { Viewport } from '@/components/Viewport';
import { Button, Section, Segmented, Slider, cx } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { toast } from '@/store/ui';
import { engine } from '@/engine/client';
import type { PaletteColor } from '@/engine/pipeline';
import { useImageBitmap, useObjectUrl } from '@/lib/hooks';
import { toolById } from './registry';

const DEFAULTS = { count: 8, format: 'hex' as 'hex' | 'rgb' | 'hsl', export: 'css' as 'css' | 'tailwind' | 'json' | 'list' };

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

function fmt(rgb: [number, number, number], f: 'hex' | 'rgb' | 'hsl') {
  if (f === 'rgb') return `rgb(${rgb.join(', ')})`;
  if (f === 'hsl') {
    const [h, s, l] = rgbToHsl(...rgb);
    return `hsl(${h} ${s}% ${l}%)`;
  }
  return `#${rgb.map(hex2).join('')}`;
}

const lum = ([r, g, b]: [number, number, number]) => 0.299 * r + 0.587 * g + 0.114 * b;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ kind: 'success', title: 'Disalin', body: text.length > 60 ? `${text.slice(0, 60)}…` : text, duration: 1800 });
  } catch {
    toast({ kind: 'error', title: 'Tidak bisa menyalin', body: text });
  }
}

export default function Palette() {
  const tool = toolById('palette')!;
  const [s, set] = useToolSettings('palette', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const url = useObjectUrl(v?.blob);
  const bmp = useImageBitmap(v?.blob);
  const [colors, setColors] = useState<PaletteColor[]>([]);
  const [picked, setPicked] = useState<[number, number, number] | null>(null);
  const sampler = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    if (!v) return;
    let alive = true;
    engine.palette(v.blob, s.count).then((c) => alive && setColors(c));
    return () => {
      alive = false;
    };
  }, [v?.id, s.count]);

  useEffect(() => {
    if (!bmp) return;
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    sampler.current = ctx;
  }, [bmp]);

  const pickAt = (e: React.MouseEvent) => {
    const ctx = sampler.current;
    if (!ctx) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * ctx.canvas.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * ctx.canvas.height);
    const d = ctx.getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data;
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      rr += d[i];
      gg += d[i + 1];
      bb += d[i + 2];
      n++;
    }
    if (n) setPicked([Math.round(rr / n), Math.round(gg / n), Math.round(bb / n)]);
  };

  const screenPick = async () => {
    try {
      const ED = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
      if (!ED) return;
      const r = await new ED().open();
      const h = r.sRGBHex.replace('#', '');
      setPicked([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
    } catch {
      /* user cancelled */
    }
  };

  const exportText = () => {
    const list = colors.map((c, i) => ({ name: `color-${i + 1}`, value: fmt(c.rgb, s.format) }));
    if (s.export === 'css') return `:root {\n${list.map((c) => `  --${c.name}: ${c.value};`).join('\n')}\n}`;
    if (s.export === 'tailwind') return `colors: {\n${list.map((c) => `  '${c.name}': '${c.value}',`).join('\n')}\n}`;
    if (s.export === 'json') return JSON.stringify(list.map((c) => c.value), null, 2);
    return list.map((c) => c.value).join('\n');
  };

  return (
    <ToolShell
      tool={tool}
      stage={
        v && (
          <Viewport width={v.width} height={v.height} resetKey={v.id} singlePan={false}>
            {() => (
              <>
                {url && <img src={url} alt="" className="absolute inset-0 size-full" draggable={false} />}
                <div data-no-pan className="absolute inset-0 cursor-crosshair" onClick={pickAt} onPointerMove={(e) => e.buttons === 1 && pickAt(e)} />
              </>
            )}
          </Viewport>
        )
      }
      panel={
        <>
          <Section title="Pipet">
            <div className="flex items-center gap-3">
              <span className="size-14 shrink-0 rounded-md border border-line" style={{ background: picked ? fmt(picked, 'hex') : 'transparent' }} />
              <div className="min-w-0 flex-1 space-y-1">
                {picked ? (
                  (['hex', 'rgb', 'hsl'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => copy(fmt(picked, f))} className="flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-0.5 text-left font-mono text-[13px] hover:bg-surface-2">
                      {fmt(picked, f)} <CopyIcon size={14} className="shrink-0 text-muted" />
                    </button>
                  ))
                ) : (
                  <p className="text-sm text-muted">Ketuk gambar untuk mengambil warna.</p>
                )}
              </div>
            </div>
            {'EyeDropper' in window && (
              <Button size="sm" icon={EyedropperIcon} onClick={screenPick}>
                Ambil warna dari layar
              </Button>
            )}
          </Section>
          <Section title="Warna dominan">
            <Slider label="Jumlah warna" value={s.count} min={2} max={16} onChange={(count) => set({ count })} defaultValue={8} />
            <Segmented
              size="sm"
              value={s.format}
              onChange={(format) => set({ format })}
              options={[
                { value: 'hex', label: 'HEX' },
                { value: 'rgb', label: 'RGB' },
                { value: 'hsl', label: 'HSL' },
              ]}
            />
            <div className="flex h-12 overflow-hidden rounded-md">
              {colors.map((c) => (
                <span key={c.hex} style={{ background: c.hex, flexGrow: Math.max(0.04, c.share) }} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {colors.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => copy(fmt(c.rgb, s.format))}
                  className={cx('flex h-14 flex-col justify-end rounded-md p-2 text-left font-mono text-xs', lum(c.rgb) > 150 ? 'text-black' : 'text-white')}
                  style={{ background: c.hex }}
                  title="Salin"
                >
                  <span>{fmt(c.rgb, s.format)}</span>
                  <span className="opacity-75">{Math.round(c.share * 100)}%</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Ekspor palet">
            <Segmented
              size="sm"
              value={s.export}
              onChange={(e) => set({ export: e })}
              options={[
                { value: 'css', label: 'CSS' },
                { value: 'tailwind', label: 'Tailwind' },
                { value: 'json', label: 'JSON' },
                { value: 'list', label: 'Daftar' },
              ]}
            />
            <pre className="max-h-48 overflow-auto rounded-md bg-surface-2 p-2.5 font-mono text-[11px]">{exportText()}</pre>
            <Button size="sm" icon={CopyIcon} onClick={() => copy(exportText())}>
              Salin
            </Button>
          </Section>
        </>
      }
    />
  );
}
