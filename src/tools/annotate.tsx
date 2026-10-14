import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowUpRightIcon,
  CircleIcon,
  CursorClickIcon,
  HighlighterIcon,
  LineSegmentIcon,
  PencilSimpleIcon,
  RectangleIcon,
  TextTIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Viewport, panKey } from '@/components/Viewport';
import { Button, ColorInput, Field, Section, Select, Slider, Switch, TextInput, cx } from '@/components/ui';
import { defaultOutput } from '@/engine/types';
import { fontStack } from '@/engine/ops';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem } from '@/store/workspace';
import { useScopedTargets, getScopedTargets } from '@/store/scope';
import { runBatch } from '@/lib/batch';
import { process } from '@/engine/client';
import { useImageBitmap, useHotkeys } from '@/lib/hooks';
import { uid } from '@/lib/format';
import { toolById } from './registry';

type ToolKind = 'select' | 'pen' | 'marker' | 'arrow' | 'line' | 'rect' | 'ellipse' | 'text';

interface PathObj {
  id: string;
  color: string;
  width: number;
  type: 'pen' | 'marker';
  points: number[];
}
interface ShapeObj {
  id: string;
  color: string;
  width: number;
  type: 'arrow' | 'line' | 'rect' | 'ellipse';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fill: boolean;
}
interface TextObj {
  id: string;
  color: string;
  width: number;
  type: 'text';
  x: number;
  y: number;
  text: string;
  size: number;
  font: string;
  bold: boolean;
  box: boolean;
  boxColor: string;
  align: 'left' | 'center';
}
type Obj = PathObj | ShapeObj | TextObj;

const isPath = (o: Obj): o is PathObj => o.type === 'pen' || o.type === 'marker';
const isText = (o: Obj): o is TextObj => o.type === 'text';

const DEFAULTS = { tool: 'arrow' as ToolKind, color: '#ff3b30', width: 0.8, fill: false, textSize: 6, font: 'sans', bold: true, box: false, boxColor: '#000000', sameForAll: false };
type S = typeof DEFAULTS;

const PALETTE = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#5e5ce6', '#ffffff', '#000000'];

function textMetrics(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, o: TextObj) {
  ctx.font = `${o.bold ? '700' : '400'} ${o.size}px ${fontStack(o.font)}`;
  const lines = o.text.split('\n');
  const lh = o.size * 1.2;
  const w = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  return { lines, lh, w, h: lh * lines.length };
}

export function drawObjects(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, objs: Obj[], k: number) {
  for (const o of objs) {
    ctx.save();
    ctx.scale(k, k);
    ctx.strokeStyle = o.color;
    ctx.fillStyle = o.color;
    ctx.lineWidth = o.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isPath(o)) {
      if (o.type === 'marker') {
        ctx.globalAlpha = 0.4;
        ctx.lineCap = 'square';
        ctx.globalCompositeOperation = 'multiply';
      }
      ctx.beginPath();
      ctx.moveTo(o.points[0], o.points[1]);
      if (o.points.length === 2) ctx.lineTo(o.points[0] + 0.01, o.points[1]);
      for (let i = 2; i < o.points.length; i += 2) ctx.lineTo(o.points[i], o.points[i + 1]);
      ctx.stroke();
    } else if (o.type === 'line' || o.type === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(o.x1, o.y1);
      ctx.lineTo(o.x2, o.y2);
      ctx.stroke();
      if (o.type === 'arrow') {
        const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
        const len = Math.max(o.width * 4, 12);
        ctx.beginPath();
        ctx.moveTo(o.x2, o.y2);
        ctx.lineTo(o.x2 - len * Math.cos(a - 0.45), o.y2 - len * Math.sin(a - 0.45));
        ctx.lineTo(o.x2 - len * Math.cos(a + 0.45), o.y2 - len * Math.sin(a + 0.45));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (o.type === 'rect' || o.type === 'ellipse') {
      const x = Math.min(o.x1, o.x2);
      const y = Math.min(o.y1, o.y2);
      const w = Math.abs(o.x2 - o.x1);
      const h = Math.abs(o.y2 - o.y1);
      ctx.beginPath();
      if (o.type === 'rect') ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.04);
      else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (o.fill) ctx.fill();
      else ctx.stroke();
    } else if (isText(o)) {
      const m = textMetrics(ctx, o);
      const pad = o.box ? o.size * 0.35 : 0;
      if (o.box) {
        ctx.fillStyle = o.boxColor;
        ctx.beginPath();
        ctx.roundRect(o.x - pad, o.y - pad, m.w + pad * 2, m.h + pad * 2, o.size * 0.25);
        ctx.fill();
      }
      ctx.fillStyle = o.color;
      ctx.textBaseline = 'top';
      if (!o.box) {
        ctx.lineWidth = o.size * 0.12;
        ctx.strokeStyle = isLight(o.color) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)';
      }
      m.lines.forEach((l, i) => {
        const tx = o.align === 'center' ? o.x + (m.w - ctx.measureText(l).width) / 2 : o.x;
        if (!o.box) ctx.strokeText(l, tx, o.y + i * m.lh + o.size * 0.08);
        ctx.fillText(l, tx, o.y + i * m.lh + o.size * 0.08);
      });
    }
    ctx.restore();
  }
}

function isLight(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 150;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function bounds(o: Obj) {
  if (isPath(o)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < o.points.length; i += 2) {
      x0 = Math.min(x0, o.points[i]);
      x1 = Math.max(x1, o.points[i]);
      y0 = Math.min(y0, o.points[i + 1]);
      y1 = Math.max(y1, o.points[i + 1]);
    }
    return { x: x0 - o.width, y: y0 - o.width, w: x1 - x0 + o.width * 2, h: y1 - y0 + o.width * 2 };
  }
  if (isText(o)) {
    measureCtx ??= document.createElement('canvas').getContext('2d');
    const m = textMetrics(measureCtx!, o);
    const pad = o.size * 0.35;
    return { x: o.x - pad, y: o.y - pad, w: m.w + pad * 2, h: m.h + pad * 2 };
  }
  const p = o.width * 2;
  return { x: Math.min(o.x1, o.x2) - p, y: Math.min(o.y1, o.y2) - p, w: Math.abs(o.x2 - o.x1) + p * 2, h: Math.abs(o.y2 - o.y1) + p * 2 };
}

function moveObj(o: Obj, dx: number, dy: number): Obj {
  if (isPath(o)) return { ...o, points: o.points.map((p, i) => p + (i % 2 ? dy : dx)) };
  if (isText(o)) return { ...o, x: o.x + dx, y: o.y + dy };
  return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
}

function scaleObj(o: Obj, kx: number, ky: number): Obj {
  const k = Math.sqrt(kx * ky);
  if (isPath(o)) return { ...o, width: o.width * k, points: o.points.map((p, i) => p * (i % 2 ? ky : kx)) };
  if (isText(o)) return { ...o, x: o.x * kx, y: o.y * ky, size: o.size * k };
  return { ...o, width: o.width * k, x1: o.x1 * kx, y1: o.y1 * ky, x2: o.x2 * kx, y2: o.y2 * ky };
}

function Editor({ width, height, objs, setObjs, s, selected, setSelected, scale }: { width: number; height: number; objs: Obj[]; setObjs: (o: Obj[], commit?: boolean) => void; s: S; selected: string | null; setSelected: (id: string | null) => void; scale: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const action = useRef<{ kind: 'draw' | 'move'; id: string; sx: number; sy: number; base: Obj[]; pid: number } | null>(null);
  const base = Math.min(width, height);

  useLayoutEffect(() => {
    const c = canvas.current;
    const w = wrap.current;
    if (!c || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.round(width * scale * dpr));
    const ch = Math.max(1, Math.round(height * scale * dpr));
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, cw, ch);
    drawObjects(ctx, objs, cw / width);
  }, [objs, width, height, scale]);

  const pt = (e: React.PointerEvent) => {
    const b = wrap.current!.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * width, y: ((e.clientY - b.top) / b.height) * height };
  };

  const hit = (x: number, y: number) => {
    for (let i = objs.length - 1; i >= 0; i--) {
      const b = bounds(objs[i]);
      const tol = 8 / scale;
      if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) return objs[i];
    }
    return null;
  };

  const sel = objs.find((o) => o.id === selected);
  const sb = sel ? bounds(sel) : null;

  return (
    <div
      ref={wrap}
      data-no-pan
      className="absolute inset-0 touch-none"
      style={{ cursor: s.tool === 'select' ? 'default' : s.tool === 'text' ? 'text' : 'crosshair' }}
      onPointerDown={(e) => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || panKey.held) return;
        if (action.current) {
          setObjs(action.current.base);
          action.current = null;
          return;
        }
        const p = pt(e);
        const target = hit(p.x, p.y);
        if (s.tool === 'select' || (target && target.id === selected)) {
          setSelected(target?.id ?? null);
          if (target) {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            action.current = { kind: 'move', id: target.id, sx: p.x, sy: p.y, base: objs, pid: e.pointerId };
          }
          return;
        }
        const id = uid();
        const width_ = (s.width / 100) * base;
        let o: Obj;
        if (s.tool === 'text') {
          o = { id, type: 'text', color: s.color, width: 0, x: p.x, y: p.y, text: 'Teks', size: (s.textSize / 100) * base, font: s.font, bold: s.bold, box: s.box, boxColor: s.boxColor, align: 'left' };
          setObjs([...objs, o], true);
          setSelected(id);
          return;
        }
        if (s.tool === 'pen' || s.tool === 'marker') o = { id, type: s.tool, color: s.color, width: s.tool === 'marker' ? width_ * 4 : width_, points: [p.x, p.y] };
        else o = { id, type: s.tool as 'arrow', color: s.color, width: width_, x1: p.x, y1: p.y, x2: p.x, y2: p.y, fill: s.fill };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        action.current = { kind: 'draw', id, sx: p.x, sy: p.y, base: objs, pid: e.pointerId };
        setObjs([...objs, o]);
        setSelected(null);
      }}
      onPointerMove={(e) => {
        const a = action.current;
        if (!a || e.pointerId !== a.pid) return;
        const p = pt(e);
        if (a.kind === 'move') {
          setObjs(a.base.map((o) => (o.id === a.id ? moveObj(o, p.x - a.sx, p.y - a.sy) : o)));
          return;
        }
        setObjs(
          objs.map((o) => {
            if (o.id !== a.id) return o;
            if (isPath(o)) return { ...o, points: [...o.points, p.x, p.y] };
            if (isText(o)) return o;
            let x2 = p.x;
            let y2 = p.y;
            if (e.shiftKey && (o.type === 'rect' || o.type === 'ellipse')) {
              const d = Math.max(Math.abs(x2 - o.x1), Math.abs(y2 - o.y1));
              x2 = o.x1 + Math.sign(x2 - o.x1) * d;
              y2 = o.y1 + Math.sign(y2 - o.y1) * d;
            }
            return { ...o, x2, y2 };
          }),
        );
      }}
      onPointerUp={() => {
        const a = action.current;
        action.current = null;
        if (!a) return;
        const o = objs.find((x) => x.id === a.id);
        if (a.kind === 'draw' && o && !isPath(o) && !isText(o) && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 3 / scale) {
          setObjs(a.base);
          return;
        }
        setObjs(objs, true);
      }}
      onPointerCancel={() => {
        if (action.current) setObjs(action.current.base);
        action.current = null;
      }}
    >
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" />
      {sb && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-accent"
          style={{ left: `${(sb.x / width) * 100}%`, top: `${(sb.y / height) * 100}%`, width: `${(sb.w / width) * 100}%`, height: `${(sb.h / height) * 100}%` }}
        />
      )}
    </div>
  );
}

export default function Annotate() {
  const tool = toolById('annotate')!;
  const [s, set] = useToolSettings('annotate', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const bmp = useImageBitmap(v?.blob);
  const targets = useScopedTargets();
  const [objs, setObjsRaw] = useState<Obj[]>([]);
  const [past, setPast] = useState<Obj[][]>([]);
  const [future, setFuture] = useState<Obj[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const committed = useRef<Obj[]>([]);
  const bgCanvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setObjsRaw([]);
    setPast([]);
    setFuture([]);
    setSelected(null);
    committed.current = [];
  }, [v?.id]);

  useEffect(() => {
    const c = bgCanvas.current;
    if (!c || !bmp) return;
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  }, [bmp]);

  const setObjs = (o: Obj[], commit = false) => {
    setObjsRaw(o);
    if (commit) {
      setPast((p) => [...p.slice(-50), committed.current]);
      setFuture([]);
      committed.current = o;
    }
  };
  const undo = () => {
    if (!past.length) return;
    setFuture((f) => [committed.current, ...f]);
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    committed.current = prev;
    setObjsRaw(prev);
  };
  const redo = () => {
    if (!future.length) return;
    setPast((p) => [...p, committed.current]);
    committed.current = future[0];
    setObjsRaw(future[0]);
    setFuture(future.slice(1));
  };
  const removeSelected = () => {
    if (!selected) return;
    setObjs(
      objs.filter((o) => o.id !== selected),
      true,
    );
    setSelected(null);
  };
  useHotkeys({ delete: removeSelected, backspace: removeSelected, escape: () => setSelected(null) });

  const sel = objs.find((o) => o.id === selected);
  const updateSel = (patch: Partial<Obj>) => sel && setObjs(objs.map((o) => (o.id === sel.id ? ({ ...o, ...patch } as Obj) : o)), true);

  const apply = async () => {
    if (!v || !item) return;
    const list = s.sameForAll ? getScopedTargets() : [item];
    await runBatch({
      label: 'Menambahkan coretan',
      toolLabel: 'Teks & coretan',
      items: list,
      work: async (_it, ver, signal) => {
        const scaled = ver.id === v.id ? objs : objs.map((o) => scaleObj(o, ver.width / v.width, ver.height / v.height));
        const layer = new OffscreenCanvas(ver.width, ver.height);
        drawObjects(layer.getContext('2d')!, scaled, 1);
        const blob = await layer.convertToBlob({ type: 'image/png' });
        return process(ver.blob, { ops: [{ type: 'overlay', layer: blob }], output: defaultOutput, srcMime: ver.mime }, signal);
      },
      onDone: () => {
        setObjsRaw([]);
        committed.current = [];
        setPast([]);
        setFuture([]);
        setSelected(null);
      },
    });
  };

  const tools: { id: ToolKind; label: string; icon: typeof PencilSimpleIcon }[] = [
    { id: 'select', label: 'Pilih', icon: CursorClickIcon },
    { id: 'arrow', label: 'Panah', icon: ArrowUpRightIcon },
    { id: 'rect', label: 'Kotak', icon: RectangleIcon },
    { id: 'ellipse', label: 'Elips', icon: CircleIcon },
    { id: 'line', label: 'Garis', icon: LineSegmentIcon },
    { id: 'pen', label: 'Pena', icon: PencilSimpleIcon },
    { id: 'marker', label: 'Stabilo', icon: HighlighterIcon },
    { id: 'text', label: 'Teks', icon: TextTIcon },
  ];

  return (
    <ToolShell
      tool={tool}
      stage={
        v && (
          <Viewport width={v.width} height={v.height} singlePan={false} resetKey={v.id}>
            {({ scale }) => (
              <>
                <canvas ref={bgCanvas} className="absolute inset-0 size-full" />
                <Editor width={v.width} height={v.height} objs={objs} setObjs={setObjs} s={s} selected={selected} setSelected={setSelected} scale={scale} />
              </>
            )}
          </Viewport>
        )
      }
      panel={
        <>
          <Section
            title="Alat"
            action={
              <div className="flex gap-0.5">
                <Button size="sm" variant="ghost" icon={ArrowCounterClockwiseIcon} disabled={!past.length} onClick={undo} aria-label="Urungkan" />
                <Button size="sm" variant="ghost" icon={ArrowClockwiseIcon} disabled={!future.length} onClick={redo} aria-label="Ulangi" />
              </div>
            }
          >
            <div className="grid grid-cols-4 gap-1.5">
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={s.tool === t.id}
                  onClick={() => set({ tool: t.id })}
                  className={cx('flex h-14 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium', s.tool === t.id ? 'bg-accent-soft text-accent' : 'bg-surface-2 hover:bg-surface-3')}
                >
                  <t.icon size={20} weight={s.tool === t.id ? 'bold' : 'regular'} />
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => {
                    set({ color: c });
                    if (sel) updateSel({ color: c });
                  }}
                  className={cx('size-8 rounded-full border', s.color === c ? 'border-accent ring-2 ring-accent/50' : 'border-line-strong')}
                  style={{ background: c }}
                />
              ))}
              <label className="relative size-8 overflow-hidden rounded-full border border-line-strong" aria-label="Warna lain" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
                <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={s.color} onChange={(e) => set({ color: e.target.value })} />
              </label>
            </div>
            {s.tool !== 'text' && s.tool !== 'select' && <Slider label="Ketebalan" value={s.width} min={0.1} max={5} step={0.1} unit="%" onChange={(width) => set({ width })} defaultValue={0.8} />}
            {(s.tool === 'rect' || s.tool === 'ellipse') && <Switch checked={s.fill} onChange={(fill) => set({ fill })} label="Isi penuh" />}
            {s.tool === 'text' && !sel && <p className="text-xs text-muted">Ketuk gambar untuk menaruh teks, lalu ubah isinya di bawah.</p>}
          </Section>

          {sel && (
            <Section title="Objek terpilih" action={<Button size="sm" variant="danger" icon={TrashIcon} onClick={removeSelected}>Hapus</Button>}>
              {sel.type === 'text' ? (
                <>
                  <Field label="Isi teks">
                    <TextInput multiline value={sel.text} onChange={(text) => setObjsRaw(objs.map((o) => (o.id === sel.id ? { ...sel, text } : o)))} label="Isi teks" />
                  </Field>
                  <Slider label="Ukuran" value={+((sel.size / Math.min(v!.width, v!.height)) * 100).toFixed(1)} min={1} max={30} step={0.5} unit="%" onChange={(p) => updateSel({ size: (p / 100) * Math.min(v!.width, v!.height) })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      label="Huruf"
                      value={sel.font}
                      onChange={(font) => updateSel({ font })}
                      options={[
                        { value: 'sans', label: 'Sans' },
                        { value: 'serif', label: 'Serif' },
                        { value: 'rounded', label: 'Rounded' },
                        { value: 'hand', label: 'Tangan' },
                        { value: 'impact', label: 'Impact' },
                        { value: 'mono', label: 'Mono' },
                      ]}
                    />
                    <Select label="Rata" value={sel.align} onChange={(align) => updateSel({ align })} options={[{ value: 'left', label: 'Rata kiri' }, { value: 'center', label: 'Tengah' }]} />
                  </div>
                  <Switch checked={sel.bold} onChange={(bold) => updateSel({ bold })} label="Tebal" />
                  <Switch checked={sel.box} onChange={(box) => updateSel({ box })} label="Latar kotak" />
                  {sel.box && <ColorInput value={sel.boxColor} onChange={(boxColor) => updateSel({ boxColor })} label="Warna kotak" />}
                </>
              ) : (
                <Slider label="Ketebalan" value={sel.width} min={1} max={Math.min(v!.width, v!.height) * 0.05} onChange={(width) => updateSel({ width })} unit="px" />
              )}
              <p className="text-xs text-muted">Seret objek untuk memindahkan. Tombol Delete untuk menghapus.</p>
            </Section>
          )}

          <Section title="Lainnya" collapsible defaultOpen={false}>
            {targets.length > 1 && <Switch checked={s.sameForAll} onChange={(sameForAll) => set({ sameForAll })} label={`Pakai coretan yang sama untuk ${targets.length} gambar`} hint="Posisi menyesuaikan ukuran tiap gambar." />}
            <Button variant="danger" size="sm" icon={TrashIcon} disabled={!objs.length} onClick={() => setObjs([], true)}>
              Hapus semua coretan
            </Button>
          </Section>
        </>
      }
      footer={<ApplyBar label="Simpan coretan" batch={false} count={s.sameForAll ? targets.length : 1} disabled={!objs.length} onApply={apply} />}
    />
  );
}
