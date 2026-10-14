import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, CircleIcon, PaintBrushIcon, RectangleIcon, ScanSmileyIcon, TrashIcon, XIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Viewport, panKey } from '@/components/Viewport';
import { Button, ColorInput, Field, Notice, Section, Segmented, Slider, Switch } from '@/components/ui';
import { defaultOutput, type CensorOp, type CensorShape } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { useScopedTargets, getScopedTargets } from '@/store/scope';
import { errorMessage, toast } from '@/store/ui';
import { runBatch, skip } from '@/lib/batch';
import { process } from '@/engine/client';
import { useObjectUrl } from '@/lib/hooks';
import { detectFaces } from '@/ai/faces';
import { toolById } from './registry';
import { tokenOf, useLivePreview } from './common';

const DEFAULTS = {
  mode: 'pixelate' as CensorOp['mode'],
  strength: 60,
  color: '#000000',
  shape: 'rect' as 'rect' | 'ellipse' | 'stroke',
  brush: 4,
  faceShape: 'ellipse' as 'rect' | 'ellipse',
  sameArea: false,
};
type S = typeof DEFAULTS;

function shapeBox(r: CensorShape) {
  if (r.shape !== 'stroke') return { x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < r.points.length; i += 2) {
    x0 = Math.min(x0, r.points[i]);
    x1 = Math.max(x1, r.points[i]);
    y0 = Math.min(y0, r.points[i + 1]);
    y1 = Math.max(y1, r.points[i + 1]);
  }
  return { x: x0 - r.size / 2, y: y0 - r.size / 2, w: x1 - x0 + r.size, h: y1 - y0 + r.size };
}

function scaleRegions(regions: CensorShape[], kx: number, ky: number): CensorShape[] {
  return regions.map((r) =>
    r.shape === 'stroke'
      ? { ...r, size: r.size * Math.sqrt(kx * ky), points: r.points.map((p, i) => p * (i % 2 ? ky : kx)) }
      : { ...r, x: r.x * kx, y: r.y * ky, w: r.w * kx, h: r.h * ky },
  );
}

function DrawLayer({ width, height, regions, setRegions, s, scale, selected, setSelected }: { width: number; height: number; regions: CensorShape[]; setRegions: (r: CensorShape[]) => void; s: S; scale: number; selected: number; setSelected: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<CensorShape | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const brushPx = (s.brush / 100) * Math.min(width, height);

  const pt = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * width, y: ((e.clientY - b.top) / b.height) * height };
  };

  return (
    <div
      ref={ref}
      data-no-pan
      className="absolute inset-0 touch-none"
      style={{ cursor: s.shape === 'stroke' ? 'crosshair' : 'cell' }}
      onPointerDown={(e) => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || panKey.held) return;
        if (start.current) {
          start.current = null;
          setDraft(null);
          return;
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const p = pt(e);
        start.current = { ...p, id: e.pointerId };
        setSelected(-1);
        setDraft(s.shape === 'stroke' ? { shape: 'stroke', points: [p.x, p.y], size: brushPx } : { shape: s.shape, x: p.x, y: p.y, w: 0, h: 0 });
      }}
      onPointerMove={(e) => {
        if (!start.current || e.pointerId !== start.current.id || !draft) return;
        const p = pt(e);
        if (draft.shape === 'stroke') setDraft({ ...draft, points: [...draft.points, p.x, p.y] });
        else setDraft({ ...draft, w: p.x - start.current.x, h: p.y - start.current.y });
      }}
      onPointerUp={() => {
        if (draft) {
          const box = shapeBox(draft);
          if (draft.shape === 'stroke' || (box.w > 4 / scale && box.h > 4 / scale)) {
            const norm = draft.shape === 'stroke' ? draft : { ...draft, ...box };
            setRegions([...regions, norm]);
          }
        }
        start.current = null;
        setDraft(null);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
    >
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[...regions, ...(draft ? [draft] : [])].map((r, i) => {
          const sel = i === selected;
          const stroke = sel ? 'var(--accent)' : 'white';
          const sw = 2 / scale;
          if (r.shape === 'stroke') {
            const d = r.points.reduce((acc, v, j) => acc + (j % 2 === 0 ? `${j === 0 ? 'M' : 'L'}${v} ` : `${v} `), '');
            return <path key={i} d={d} fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth={r.size} strokeLinecap="round" strokeLinejoin="round" />;
          }
          const b = shapeBox(r);
          return r.shape === 'ellipse' ? (
            <ellipse key={i} cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill="rgb(255 255 255 / 0.12)" stroke={stroke} strokeWidth={sw} strokeDasharray={`${6 / scale} ${4 / scale}`} />
          ) : (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="rgb(255 255 255 / 0.12)" stroke={stroke} strokeWidth={sw} strokeDasharray={`${6 / scale} ${4 / scale}`} />
          );
        })}
      </svg>
      {regions.map((r, i) => {
        const b = shapeBox(r);
        return (
          <button
            key={i}
            type="button"
            aria-label={`Hapus area ${i + 1}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setRegions(regions.filter((_, j) => j !== i));
            }}
            className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow hover:bg-danger"
            style={{ left: `${((b.x + b.w) / width) * 100}%`, top: `${(b.y / height) * 100}%` }}
          >
            <XIcon size={12} weight="bold" />
          </button>
        );
      })}
    </div>
  );
}

export default function Censor() {
  const tool = toolById('censor')!;
  const [s, set] = useToolSettings('censor', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const targets = useScopedTargets();
  const [regions, setRegions] = useState<CensorShape[]>([]);
  const [selected, setSelected] = useState(-1);
  const [detecting, setDetecting] = useState(false);
  useEffect(() => {
    setRegions([]);
    setSelected(-1);
  }, [v?.id]);

  const op = (r: CensorShape[]): CensorOp => ({ type: 'censor', regions: r, mode: s.mode, strength: s.strength, color: s.color });
  const preview = useLivePreview((ver) => (regions.length ? { ops: [op(regions)], output: defaultOutput, srcMime: ver.mime } : null), tokenOf({ regions, m: s.mode, st: s.strength, c: s.color }), { debounce: 120, previewMax: 2000 });
  const shown = preview.result && !preview.stale ? preview.result.blob : v?.blob;
  const url = useObjectUrl(shown);

  const faceRegions = (boxes: { x: number; y: number; w: number; h: number }[]): CensorShape[] => boxes.map((b) => ({ shape: s.faceShape, x: b.x, y: b.y, w: b.w, h: b.h }));

  const detect = async () => {
    if (!v) return;
    setDetecting(true);
    try {
      const faces = await detectFaces(v.blob);
      if (!faces.length) toast({ kind: 'warn', title: 'Tidak ada wajah terdeteksi', body: 'Wajah yang terlalu kecil, miring, atau tertutup bisa terlewat. Tandai manual dengan kotak.' });
      else {
        setRegions((r) => [...r, ...faceRegions(faces)]);
        toast({ kind: 'success', title: `${faces.length} wajah ditandai`, body: 'Periksa lagi, hapus yang salah dengan tombol ×.' });
      }
    } catch (e) {
      toast({ kind: 'error', title: 'Deteksi wajah gagal', body: errorMessage(e) });
    } finally {
      setDetecting(false);
    }
  };

  const applyManual = () => {
    if (!v || !item) return;
    const others = s.sameArea;
    runBatch({
      label: 'Menyensor',
      toolLabel: 'Sensor',
      items: others ? getScopedTargets() : [item],
      work: async (_it, ver, signal) => {
        const r = ver.id === v.id ? regions : scaleRegions(regions, ver.width / v.width, ver.height / v.height);
        return process(ver.blob, { ops: [op(r)], output: defaultOutput, srcMime: ver.mime }, signal);
      },
      onDone: () => setRegions([]),
    });
  };

  const applyAutoFaces = () =>
    runBatch({
      label: 'Mendeteksi & menyensor wajah',
      toolLabel: 'Sensor wajah',
      items: getScopedTargets(),
      concurrency: 1,
      work: async (_it, ver, signal) => {
        const faces = await detectFaces(ver.blob);
        if (!faces.length) return skip('Tidak ada wajah yang terdeteksi.');
        return process(ver.blob, { ops: [op(faceRegions(faces))], output: defaultOutput, srcMime: ver.mime }, signal);
      },
    });

  return (
    <ToolShell
      tool={tool}
      stage={
        v && (
          <Viewport width={v.width} height={v.height} singlePan={false} resetKey={v.id}>
            {({ scale }) => (
              <>
                {url && <img src={url} alt="" className="absolute inset-0 size-full" draggable={false} />}
                <DrawLayer width={v.width} height={v.height} regions={regions} setRegions={setRegions} s={s} scale={scale} selected={selected} setSelected={setSelected} />
              </>
            )}
          </Viewport>
        )
      }
      panel={
        <>
          <Section title="Gaya sensor">
            <Segmented
              value={s.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'pixelate', label: 'Piksel' },
                { value: 'blur', label: 'Blur' },
                { value: 'solid', label: 'Tutup' },
                { value: 'noise', label: 'Noise' },
              ]}
            />
            {s.mode !== 'solid' ? (
              <Slider label="Kekuatan" value={s.strength} min={5} max={100} onChange={(strength) => set({ strength })} defaultValue={60} />
            ) : (
              <Field label="Warna penutup">
                <ColorInput value={s.color} onChange={(color) => set({ color })} />
              </Field>
            )}
            {s.mode === 'blur' && s.strength < 40 && <Notice kind="warn">Blur tipis kadang masih bisa dibaca. Untuk data sensitif (KTP, plat nomor, rekening) pakai Tutup.</Notice>}
          </Section>
          <Section title="Tandai area" action={regions.length > 0 && <Button size="sm" variant="ghost" icon={TrashIcon} onClick={() => setRegions([])}>Hapus semua</Button>}>
            <Segmented
              value={s.shape}
              onChange={(shape) => set({ shape })}
              options={[
                { value: 'rect', label: 'Kotak', icon: RectangleIcon },
                { value: 'ellipse', label: 'Elips', icon: CircleIcon },
                { value: 'stroke', label: 'Kuas', icon: PaintBrushIcon },
              ]}
            />
            {s.shape === 'stroke' && <Slider label="Ukuran kuas" value={s.brush} min={0.5} max={20} step={0.5} unit="%" onChange={(brush) => set({ brush })} defaultValue={4} />}
            <div className="flex gap-2">
              <Button block icon={ScanSmileyIcon} loading={detecting} onClick={detect}>
                Deteksi wajah
              </Button>
              <Button icon={ArrowCounterClockwiseIcon} disabled={!regions.length} onClick={() => setRegions(regions.slice(0, -1))} aria-label="Urungkan area terakhir" title="Urungkan area terakhir" />
            </div>
            <p className="text-xs text-muted">
              {regions.length ? `${regions.length} area ditandai.` : 'Seret di gambar untuk menandai.'} Geser gambar dengan dua jari atau Spasi + seret.
            </p>
            {targets.length > 1 && regions.length > 0 && <Switch checked={s.sameArea} onChange={(sameArea) => set({ sameArea })} label={`Area yang sama untuk ${targets.length} gambar`} hint="Cocok untuk screenshot dengan posisi data yang sama." />}
          </Section>
          <Section title="Sensor wajah otomatis">
            <Segmented
              size="sm"
              value={s.faceShape}
              onChange={(faceShape) => set({ faceShape })}
              options={[
                { value: 'ellipse', label: 'Bentuk elips' },
                { value: 'rect', label: 'Bentuk kotak' },
              ]}
            />
            <Button block icon={ScanSmileyIcon} onClick={applyAutoFaces}>
              {targets.length > 1 ? `Sensor semua wajah · ${targets.length} gambar` : 'Sensor semua wajah'}
            </Button>
            <p className="text-xs text-muted">Wajah dideteksi di perangkat (MediaPipe). Gambar tanpa wajah dilewati.</p>
          </Section>
        </>
      }
      footer={<ApplyBar label="Terapkan sensor" batch={false} count={s.sameArea ? targets.length : 1} disabled={!regions.length} onApply={applyManual} />}
    />
  );
}
