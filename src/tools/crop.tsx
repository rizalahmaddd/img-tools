import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowClockwiseIcon, ArrowCounterClockwiseIcon, FlipHorizontalIcon, FlipVerticalIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Viewport, panKey } from '@/components/Viewport';
import { Button, Field, NumberInput, Section, Segmented, Slider, Switch } from '@/components/ui';
import { defaultOutput, type Op } from '@/engine/types';
import { inscribedScale, rotatedBounds } from '@/engine/ops';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { useScopedTargets } from '@/store/scope';
import { useImageBitmap } from '@/lib/hooks';
import { toolById } from './registry';
import { applyToTargets } from './common';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const RATIOS: { id: string; label: string; r: number | null }[] = [
  { id: 'free', label: 'Bebas', r: null },
  { id: 'orig', label: 'Asli', r: -1 },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 4 / 5 },
  { id: '3:4', label: '3:4', r: 3 / 4 },
  { id: '2:3', label: '2:3', r: 2 / 3 },
  { id: '9:16', label: '9:16', r: 9 / 16 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
  { id: '4:3', label: '4:3', r: 4 / 3 },
  { id: '3:2', label: '3:2', r: 3 / 2 },
  { id: '21:9', label: '21:9', r: 21 / 9 },
];

const DEFAULTS = { ratio: 'free', others: 'relative' as 'relative' | 'center', grid: true };

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

function fitRatio(r: number, imgAspect: number): Rect {
  const k = r / imgAspect;
  const w = k >= 1 ? 1 : k;
  const h = k >= 1 ? 1 / k : 1;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

function CropOverlay({ rect, onChange, ratio, aspect, grid }: { rect: Rect; onChange: (r: Rect) => void; ratio: number | null; aspect: number; grid: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ h: Handle; sx: number; sy: number; start: Rect } | null>(null);
  const min = 0.02;

  const down = (h: Handle) => (e: React.PointerEvent) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || panKey.held) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { h, sx: e.clientX, sy: e.clientY, start: rect };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = ref.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.sx) / box.width;
    const dy = (e.clientY - d.sy) / box.height;
    let { x, y, w, h } = d.start;
    if (d.h === 'move') {
      x = Math.min(1 - w, Math.max(0, x + dx));
      y = Math.min(1 - h, Math.max(0, y + dy));
      return onChange({ x, y, w, h });
    }
    let x2 = x + w;
    let y2 = y + h;
    if (d.h.includes('w')) x = Math.min(x2 - min, Math.max(0, x + dx));
    if (d.h.includes('e')) x2 = Math.max(x + min, Math.min(1, x2 + dx));
    if (d.h.includes('n')) y = Math.min(y2 - min, Math.max(0, y + dy));
    if (d.h.includes('s')) y2 = Math.max(y + min, Math.min(1, y2 + dy));
    w = x2 - x;
    h = y2 - y;
    if (ratio) {
      const rn = ratio / aspect;
      if (d.h === 'n' || d.h === 's') {
        const nw = h * rn;
        x = Math.max(0, Math.min(1 - nw, d.start.x + (d.start.w - nw) / 2));
        w = Math.min(nw, 1);
        h = w / rn;
      } else {
        h = w / rn;
        if (d.h.includes('n')) y = y2 - h;
        if (y < 0 || y + h > 1) {
          h = d.h.includes('n') ? y2 : 1 - y;
          w = h * rn;
          if (d.h.includes('w')) x = x2 - w;
          if (d.h.includes('n')) y = y2 - h;
        }
      }
    }
    onChange({ x, y, w: Math.max(min, w), h: Math.max(min, h) });
  };

  const up = () => (drag.current = null);
  const handles: Handle[] = ratio ? ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] : ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'];
  const pos: Record<string, string> = {
    nw: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
    ne: 'right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
    sw: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
    se: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
    n: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize',
    s: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize',
    e: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
    w: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize',
  };

  return (
    <div ref={ref} className="absolute inset-0" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div
        data-no-pan
        className="absolute touch-none outline outline-2 outline-white"
        style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%`, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.55)', cursor: 'move' }}
        onPointerDown={down('move')}
      >
        {grid && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/50" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/50" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/50" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/50" />
          </div>
        )}
        {handles.map((h) => (
          <span key={h} data-no-pan onPointerDown={down(h)} className={`absolute z-10 flex size-9 touch-none items-center justify-center ${pos[h]}`}>
            <span className={h.length === 2 ? 'size-4 rounded-[3px] border-2 border-white bg-black/30' : h === 'n' || h === 's' ? 'h-1.5 w-6 rounded-full bg-white' : 'h-6 w-1.5 rounded-full bg-white'} />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Crop() {
  const tool = toolById('crop')!;
  const [s, set] = useToolSettings('crop', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const bmp = useImageBitmap(v?.blob);
  const targets = useScopedTargets();
  const [rot, setRot] = useState(0);
  const [straight, setStraight] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [rect, setRect] = useState<Rect>(FULL);
  const [previewUrl, setPreviewUrl] = useState<string>();

  const angle = rot + straight;
  const dims = useMemo(() => {
    if (!v) return { w: 1, h: 1 };
    const b = rotatedBounds(v.width, v.height, angle);
    if (straight) {
      const base = rot % 180 === 0 ? { w: v.width, h: v.height } : { w: v.height, h: v.width };
      const k = inscribedScale(base.w, base.h, straight);
      return { w: Math.floor(base.w * k), h: Math.floor(base.h * k) };
    }
    return { w: Math.round(b.w), h: Math.round(b.h) };
  }, [v, angle, rot, straight]);
  const aspect = dims.w / dims.h;
  const ratioDef = RATIOS.find((r) => r.id === s.ratio) ?? RATIOS[0];
  const ratio = ratioDef.r === -1 ? (v ? v.width / v.height : null) : ratioDef.r;

  useEffect(() => {
    setRot(0);
    setStraight(0);
    setFlipH(false);
    setFlipV(false);
    setRect(FULL);
  }, [v?.id]);

  useEffect(() => {
    setRect(ratio ? fitRatio(ratio, aspect) : FULL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ratio, rot, aspect.toFixed(4)]);

  useEffect(() => {
    if (!bmp) return;
    let alive = true;
    const max = 1800;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const sw = bmp.width * k;
    const sh = bmp.height * k;
    const rad = (angle * Math.PI) / 180;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(dims.w * k));
    c.height = Math.max(1, Math.round(dims.h * k));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(bmp, -sw / 2, -sh / 2, sw, sh);
    c.toBlob((b) => {
      if (!alive || !b) return;
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
    }, 'image/jpeg', 0.9);
    return () => {
      alive = false;
    };
  }, [bmp, angle, flipH, flipV, dims.w, dims.h]);

  const urlRef = useRef<string | undefined>(undefined);
  urlRef.current = previewUrl;
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const px = { x: Math.round(rect.x * dims.w), y: Math.round(rect.y * dims.h), w: Math.round(rect.w * dims.w), h: Math.round(rect.h * dims.h) };
  const setPx = (p: Partial<typeof px>) => {
    const n = { ...px, ...p };
    let w = Math.max(1, Math.min(dims.w, n.w));
    let h = Math.max(1, Math.min(dims.h, n.h));
    if (ratio && p.w !== undefined) h = Math.round(w / ratio);
    if (ratio && p.h !== undefined) w = Math.round(h * ratio);
    const x = Math.max(0, Math.min(dims.w - w, n.x));
    const y = Math.max(0, Math.min(dims.h - h, n.y));
    setRect({ x: x / dims.w, y: y / dims.h, w: w / dims.w, h: h / dims.h });
  };

  const changed = angle !== 0 || flipH || flipV || rect.x > 0.0005 || rect.y > 0.0005 || rect.w < 0.999 || rect.h < 0.999;

  const buildOps = (isActive: boolean): Op[] => {
    const ops: Op[] = [];
    if (flipH || flipV) ops.push({ type: 'flip', h: flipH, v: flipV });
    if (angle) ops.push({ type: 'rotate', angle, background: '#ffffff', fill: straight !== 0 });
    if (!isActive && s.others === 'center' && ratio) ops.push({ type: 'aspectCrop', ratio: rect.w * dims.w / (rect.h * dims.h), anchor: 'mc' });
    else if (rect.w < 0.999 || rect.h < 0.999 || rect.x > 0.0005 || rect.y > 0.0005) ops.push({ type: 'crop', unit: 'fraction', ...rect });
    return ops;
  };

  const reset = () => {
    setRot(0);
    setStraight(0);
    setFlipH(false);
    setFlipV(false);
    setRect(ratio ? fitRatio(ratio, v ? v.width / v.height : 1) : FULL);
  };

  return (
    <ToolShell
      tool={tool}
      stage={
        v && (
          <Viewport width={dims.w} height={dims.h} singlePan={false} resetKey={`${v.id}-${rot}`} padding={28} checker={false}>
            {() => (
              <>
                {previewUrl && <img src={previewUrl} alt="" className="absolute inset-0 size-full" draggable={false} />}
                <CropOverlay rect={rect} onChange={setRect} ratio={ratio} aspect={aspect} grid={s.grid} />
              </>
            )}
          </Viewport>
        )
      }
      panel={
        <>
          <Section title="Rasio">
            <div className="flex flex-wrap gap-1.5">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => set({ ratio: r.id })}
                  className={`h-8 rounded-md border px-2.5 text-xs font-medium ${s.ratio === r.id ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Lebar">
                <NumberInput value={px.w} onChange={(w) => w && setPx({ w })} min={1} unit="px" label="Lebar potongan" />
              </Field>
              <Field label="Tinggi">
                <NumberInput value={px.h} onChange={(h) => h && setPx({ h })} min={1} unit="px" label="Tinggi potongan" />
              </Field>
              <Field label="X">
                <NumberInput value={px.x} onChange={(x) => setPx({ x: x ?? 0 })} min={0} unit="px" label="Posisi X" />
              </Field>
              <Field label="Y">
                <NumberInput value={px.y} onChange={(y) => setPx({ y: y ?? 0 })} min={0} unit="px" label="Posisi Y" />
              </Field>
            </div>
            <Switch checked={s.grid} onChange={(grid) => set({ grid })} label="Garis bantu sepertiga" />
          </Section>
          <Section title="Putar & balik" action={<Button size="sm" variant="ghost" onClick={reset}>Reset</Button>}>
            <div className="grid grid-cols-4 gap-2">
              <Button icon={ArrowCounterClockwiseIcon} onClick={() => setRot((r) => (r + 270) % 360)} aria-label="Putar kiri" title="Putar kiri" />
              <Button icon={ArrowClockwiseIcon} onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Putar kanan" title="Putar kanan" />
              <Button icon={FlipHorizontalIcon} onClick={() => setFlipH((f) => !f)} aria-label="Balik horizontal" title="Balik horizontal" className={flipH ? 'ring-2 ring-accent' : ''} />
              <Button icon={FlipVerticalIcon} onClick={() => setFlipV((f) => !f)} aria-label="Balik vertikal" title="Balik vertikal" className={flipV ? 'ring-2 ring-accent' : ''} />
            </div>
            <Slider label="Luruskan" value={straight} min={-45} max={45} step={0.5} unit="°" onChange={setStraight} defaultValue={0} hint="Pinggiran kosong dipotong otomatis." />
          </Section>
          {targets.length > 1 && (
            <Section title="Untuk gambar lain">
              <Segmented
                value={s.others}
                onChange={(others) => set({ others })}
                options={[
                  { value: 'relative', label: 'Area relatif sama' },
                  { value: 'center', label: 'Tengah, rasio sama' },
                ]}
              />
              <p className="text-xs text-muted">Putar & balik ikut diterapkan ke semua gambar yang dipilih.</p>
            </Section>
          )}
          <Section title="Pintasan" collapsible defaultOpen={false}>
            <p className="text-xs text-muted">Seret kotak untuk menggeser, sudut untuk mengubah ukuran. Geser gambar dengan dua jari, atau tahan Spasi sambil menyeret di desktop.</p>
          </Section>
        </>
      }
      footer={
        <ApplyBar
          label="Potong"
          disabled={!changed}
          onApply={() =>
            applyToTargets({
              label: 'Memotong',
              toolLabel: 'Potong',
              build: (it, ver) => ({ ops: buildOps(it.id === item?.id), output: defaultOutput, srcMime: ver.mime }),
            })
          }
        />
      }
    />
  );
}
