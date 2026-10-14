import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EraserIcon, ImageIcon, MagicWandIcon, PaintBrushIcon, TrashIcon } from '@phosphor-icons/react';
import { ToolShell, ApplyBar } from '@/components/ToolShell';
import { Viewport, panKey } from '@/components/Viewport';
import { Button, ColorInput, Notice, Progress, Section, Segmented, Slider, Switch, cx } from '@/components/ui';
import { defaultOutput, type MaskOp } from '@/engine/types';
import { useToolSettings } from '@/store/settings';
import { current, useActiveItem, type Version } from '@/store/workspace';
import { getScopedTargets, useScopedTargets } from '@/store/scope';
import { errorMessage, toast } from '@/store/ui';
import { runBatch } from '@/lib/batch';
import { process } from '@/engine/client';
import { canvasLimits } from '@/lib/device';
import { pickFiles } from '@/lib/importer';
import { useImageBitmap, useObjectUrl } from '@/lib/hooks';
import { isModelCached, pickDevice, removeBackground } from '@/ai/client';
import { SEG_MODELS } from '@/ai/models';
import { toolById } from './registry';
import { ActiveStage, tokenOf, useLivePreview } from './common';

const DEFAULTS = {
  model: 'modnet',
  bgType: 'transparent' as MaskOp['bgType'],
  bgColor: '#ffffff',
  blur: 40,
  feather: 0,
  threshold: 0,
  trim: false,
  padding: 4,
  brush: 4,
  brushMode: 'restore' as 'restore' | 'erase',
};
type S = typeof DEFAULTS;

const maskCache = new Map<string, Blob>();

function maskOp(s: S, mask: Blob, bgImage: Blob | null): MaskOp {
  return { type: 'mask', mask, feather: s.feather, threshold: s.threshold, bgType: s.bgType, bgColor: s.bgColor, bgImage, blur: s.blur, trim: s.trim, padding: s.padding };
}

function Refiner({ v, mask, onMask, s }: { v: Version; mask: Blob; onMask: (b: Blob) => void; s: S }) {
  const bmp = useImageBitmap(v.blob);
  const maskBmp = useImageBitmap(mask);
  const display = useRef<HTMLCanvasElement>(null);
  const work = useRef<OffscreenCanvas | null>(null);
  const small = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ last: [number, number]; pid: number } | null>(null);
  const k = Math.min(1, 1600 / Math.max(v.width, v.height));

  useEffect(() => {
    if (!maskBmp) return;
    const { maxArea } = canvasLimits();
    const mk = Math.min(1, Math.sqrt(maxArea / 2 / (v.width * v.height)));
    const c = new OffscreenCanvas(Math.round(v.width * mk), Math.round(v.height * mk));
    c.getContext('2d')!.drawImage(maskBmp, 0, 0, c.width, c.height);
    work.current = c;
    if (bmp) {
      const sc = document.createElement('canvas');
      sc.width = Math.round(v.width * k);
      sc.height = Math.round(v.height * k);
      sc.getContext('2d')!.drawImage(bmp, 0, 0, sc.width, sc.height);
      small.current = sc;
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskBmp, bmp]);

  const redraw = () => {
    const d = display.current;
    if (!d || !work.current || !small.current) return;
    d.width = small.current.width;
    d.height = small.current.height;
    const ctx = d.getContext('2d')!;
    ctx.clearRect(0, 0, d.width, d.height);
    ctx.globalAlpha = 0.18;
    ctx.drawImage(small.current, 0, 0);
    ctx.globalAlpha = 1;
    const tmp = document.createElement('canvas');
    tmp.width = d.width;
    tmp.height = d.height;
    const t = tmp.getContext('2d')!;
    t.drawImage(small.current, 0, 0);
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(work.current, 0, 0, d.width, d.height);
    ctx.drawImage(tmp, 0, 0);
  };

  useLayoutEffect(redraw);

  const stroke = (a: [number, number], b: [number, number]) => {
    const c = work.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const sx = c.width / v.width;
    ctx.save();
    ctx.globalCompositeOperation = s.brushMode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (s.brush / 100) * Math.min(v.width, v.height) * sx;
    ctx.beginPath();
    ctx.moveTo(a[0] * sx, a[1] * sx);
    ctx.lineTo(b[0] * sx + 0.01, b[1] * sx);
    ctx.stroke();
    ctx.restore();
    redraw();
  };

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * v.width, ((e.clientY - r.top) / r.height) * v.height];
  };

  return (
    <div
      data-no-pan
      className="absolute inset-0 touch-none"
      style={{ cursor: 'crosshair' }}
      onPointerDown={(e) => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || panKey.held) return;
        if (drawing.current) {
          drawing.current = null;
          return;
        }
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const p = pt(e);
        drawing.current = { last: p, pid: e.pointerId };
        stroke(p, p);
      }}
      onPointerMove={(e) => {
        const d = drawing.current;
        if (!d || d.pid !== e.pointerId) return;
        const p = pt(e);
        stroke(d.last, p);
        d.last = p;
      }}
      onPointerUp={async () => {
        if (!drawing.current) return;
        drawing.current = null;
        if (work.current) onMask(await work.current.convertToBlob({ type: 'image/png' }));
      }}
    >
      <canvas ref={display} className="pointer-events-none absolute inset-0 size-full" />
    </div>
  );
}

export default function RemoveBg() {
  const tool = toolById('removebg')!;
  const [s, set] = useToolSettings('removebg', DEFAULTS);
  const item = useActiveItem();
  const v = item ? current(item) : null;
  const targets = useScopedTargets();
  const [mask, setMask] = useState<Blob | null>(null);
  const [busy, setBusy] = useState<{ p: number; detail?: string } | null>(null);
  const [refine, setRefine] = useState(false);
  const [bgImage, setBgImage] = useState<Blob | null>(null);
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [device, setDevice] = useState<string>('');
  const bgUrl = useObjectUrl(bgImage);
  const abort = useRef<AbortController | null>(null);
  const model = SEG_MODELS.find((m) => m.id === s.model) ?? SEG_MODELS[0];

  useEffect(() => {
    pickDevice().then(setDevice);
    SEG_MODELS.forEach((m) => isModelCached('seg', m.id).then((c) => setCached((x) => ({ ...x, [m.id]: c }))));
  }, []);

  useEffect(() => {
    setRefine(false);
    setMask(v ? (maskCache.get(`${v.id}:${s.model}`) ?? null) : null);
  }, [v?.id, s.model]);

  const detect = async () => {
    if (!v) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy({ p: 0, detail: cached[model.id] ? 'Memuat model' : 'Mengunduh model' });
    try {
      const r = await removeBackground(v.blob, model.id, (e) => setBusy({ p: e.progress, detail: e.stage === 'download' ? `Mengunduh model · ${e.detail ?? ''}` : (e.detail ?? 'Memproses') }), ctrl.signal);
      maskCache.set(`${v.id}:${model.id}`, r.mask);
      setMask(r.mask);
      setCached((x) => ({ ...x, [model.id]: true }));
      if (r.device !== (device as string)) setDevice(r.device);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ kind: 'error', title: 'Gagal menghapus latar', body: errorMessage(e) });
    } finally {
      setBusy(null);
      abort.current = null;
    }
  };

  const preview = useLivePreview((ver) => (mask && !refine ? { ops: [maskOp(s, mask, bgImage)], output: { ...defaultOutput, format: s.bgType === 'transparent' ? 'png' : 'auto' }, srcMime: ver.mime } : null), tokenOf({ s: { ...s, brush: 0, brushMode: 0 }, m: mask?.size, refine, bg: bgImage?.size }), { previewMax: 1600, debounce: 120 });

  const applyActive = () => {
    if (!item || !mask) return;
    const m = mask;
    runBatch({
      label: 'Menghapus latar',
      toolLabel: 'Hapus latar',
      items: [item],
      work: (_i, ver, signal) => process(ver.blob, { ops: [maskOp(s, m, bgImage)], output: { ...defaultOutput, format: s.bgType === 'transparent' ? 'png' : 'auto' }, srcMime: ver.mime }, signal),
      onDone: () => {
        setMask(null);
        setRefine(false);
      },
    });
  };

  const applyBatch = () =>
    runBatch({
      label: 'Menghapus latar',
      toolLabel: 'Hapus latar',
      items: getScopedTargets(),
      concurrency: 1,
      work: async (_i, ver, signal, _idx, report) => {
        const cachedMask = maskCache.get(`${ver.id}:${model.id}`);
        const m = cachedMask ?? (await removeBackground(ver.blob, model.id, (e) => report(e.progress, e.stage === 'download' ? `Mengunduh model ${e.detail ?? ''}` : 'Memisahkan objek'), signal)).mask;
        return process(ver.blob, { ops: [maskOp(s, m, bgImage)], output: { ...defaultOutput, format: s.bgType === 'transparent' ? 'png' : 'auto' }, srcMime: ver.mime }, signal);
      },
    });

  const stage = v && mask && refine ? (
    <Viewport width={v.width} height={v.height} singlePan={false} resetKey={v.id}>
      {() => <Refiner v={v} mask={mask} onMask={(b) => { setMask(b); maskCache.set(`${v.id}:${model.id}`, b); }} s={s} />}
    </Viewport>
  ) : (
    <ActiveStage preview={preview.result} busy={preview.busy} />
  );

  return (
    <ToolShell
      tool={tool}
      stage={
        <div className="relative h-full">
          {stage}
          {busy && (
            <div className="absolute inset-x-4 top-14 mx-auto max-w-sm rounded-lg border border-line bg-surface p-3 shadow-[var(--shadow-pop)]">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{busy.detail}</span>
                <button type="button" className="text-[13px] font-medium text-muted hover:text-fg" onClick={() => abort.current?.abort()}>
                  Batal
                </button>
              </div>
              <Progress value={busy.p > 0 ? busy.p : undefined} />
            </div>
          )}
        </div>
      }
      panel={
        <>
          <Section title="Model AI">
            <div className="grid gap-2">
              {SEG_MODELS.map((m) => {
                const dev = device === 'webgpu' && !m.cpuOnly ? 'webgpu' : 'wasm';
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set({ model: m.id })}
                    aria-pressed={s.model === m.id}
                    className={cx('rounded-md border p-3 text-left', s.model === m.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2')}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{m.label}</span>
                      <span className="text-[11px] tabular-nums text-muted">{cached[m.id] ? 'Tersimpan offline' : `Unduh ${m.sizeMB[dev]} MB sekali`}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{m.hint}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              Berjalan di {device === 'webgpu' && !model.cpuOnly ? 'GPU (WebGPU)' : 'CPU'}. {device !== 'webgpu' && 'Model Akurat bisa memakan waktu 10–40 detik per gambar di CPU.'}
            </p>
            <Button block variant={mask ? 'secondary' : 'primary'} icon={MagicWandIcon} loading={!!busy} onClick={detect}>
              {mask ? 'Ulangi deteksi' : 'Pisahkan objek'}
            </Button>
          </Section>

          {mask && (
            <Section title="Perbaiki tepi">
              <Switch checked={refine} onChange={setRefine} label="Kuas perbaikan" hint="Kembalikan bagian yang ikut terhapus atau hapus sisa latar." />
              {refine && (
                <>
                  <Segmented
                    value={s.brushMode}
                    onChange={(brushMode) => set({ brushMode })}
                    options={[
                      { value: 'restore', label: 'Kembalikan', icon: PaintBrushIcon },
                      { value: 'erase', label: 'Hapus', icon: EraserIcon },
                    ]}
                  />
                  <Slider label="Ukuran kuas" value={s.brush} min={0.5} max={20} step={0.5} unit="%" onChange={(brush) => set({ brush })} defaultValue={4} />
                </>
              )}
              <Slider label="Haluskan tepi" value={s.feather} min={0} max={100} onChange={(feather) => set({ feather })} defaultValue={0} />
              <Slider label="Ketegasan tepi" value={s.threshold} min={0} max={90} onChange={(threshold) => set({ threshold })} defaultValue={0} hint="Naikkan untuk membuang bayangan tipis di sekitar objek." />
            </Section>
          )}

          <Section title="Latar baru">
            <Segmented
              value={s.bgType}
              onChange={(bgType) => set({ bgType })}
              options={[
                { value: 'transparent', label: 'Transparan' },
                { value: 'color', label: 'Warna' },
                { value: 'blur', label: 'Blur' },
                { value: 'image', label: 'Gambar' },
              ]}
            />
            {s.bgType === 'color' && <ColorInput value={s.bgColor} onChange={(bgColor) => set({ bgColor })} />}
            {s.bgType === 'blur' && <Slider label="Blur latar asli" value={s.blur} min={5} max={100} onChange={(blur) => set({ blur })} defaultValue={40} />}
            {s.bgType === 'image' && (
              <div className="flex items-center gap-3">
                {bgUrl && <img src={bgUrl} alt="Latar" className="size-14 rounded-md object-cover" />}
                <Button
                  size="sm"
                  icon={ImageIcon}
                  onClick={async () => {
                    const [f] = await pickFiles({ multiple: false, accept: 'image/*' });
                    if (f) setBgImage(f);
                  }}
                >
                  {bgImage ? 'Ganti gambar latar' : 'Pilih gambar latar'}
                </Button>
                {bgImage && <Button size="sm" variant="ghost" icon={TrashIcon} onClick={() => setBgImage(null)} aria-label="Hapus latar" />}
              </div>
            )}
            {s.bgType === 'transparent' && <Notice>Hasil disimpan sebagai PNG supaya transparansinya tetap. JPG tidak mendukung transparan.</Notice>}
            <Switch checked={s.trim} onChange={(trim) => set({ trim })} label="Potong pas objek" hint="Buang area kosong di sekeliling objek." />
            {s.trim && <Slider label="Jarak tepi" value={s.padding} min={0} max={30} unit="%" onChange={(padding) => set({ padding })} defaultValue={4} />}
          </Section>

          {targets.length > 1 && (
            <Section title="Banyak gambar">
              <Button block icon={MagicWandIcon} onClick={applyBatch}>
                Hapus latar · {targets.length} gambar
              </Button>
              <p className="text-xs text-muted">Diproses satu per satu dengan pengaturan di atas, tanpa kuas manual.</p>
            </Section>
          )}
        </>
      }
      footer={<ApplyBar label={mask ? 'Simpan hasil' : 'Pisahkan objek dulu'} batch={false} count={1} disabled={!mask} onApply={applyActive} />}
    />
  );
}
