import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ToolShell } from '@/components/ToolShell';
import { ImageStage } from '@/components/ImageStage';
import { Button, ColorInput, Field, NumberInput, Notice, Section, Segmented, Slider } from '@/components/ui';
import { useToolSettings } from '@/store/settings';
import { current, type Item } from '@/store/workspace';
import { useScopedTargets } from '@/store/scope';
import { errorMessage, toast } from '@/store/ui';
import { useDebounced } from '@/lib/hooks';
import { haptic } from '@/lib/device';
import { toolById } from './registry';
import { addGenerated, canvasToBlob, clampCanvas, loadBitmaps } from './compose';
import { ScopePicker } from '@/components/ToolShell';

const DEFAULTS = {
  layout: 'grid' as 'row' | 'column' | 'grid',
  cols: 0,
  cell: '1:1',
  fit: 'cover' as 'cover' | 'contain',
  gap: 1.5,
  padding: 1.5,
  radius: 0,
  background: '#ffffff',
  size: 1600,
  format: 'image/jpeg' as 'image/jpeg' | 'image/png' | 'image/webp',
};
type S = typeof DEFAULTS;

const CELLS: Record<string, number> = { '1:1': 1, '4:5': 4 / 5, '3:4': 3 / 4, '4:3': 4 / 3, '16:9': 16 / 9, '9:16': 9 / 16 };

async function compose(items: Item[], s: S, maxOut: number) {
  const srcs = items.map((i) => current(i));
  const bmps = await loadBitmaps(srcs, Math.max(400, maxOut));
  const n = bmps.length;
  const size = Math.min(s.size, maxOut);
  const unit = size / 100;
  const gap = s.gap * unit;
  const pad = s.padding * unit;
  type Cell = { x: number; y: number; w: number; h: number; b: ImageBitmap };
  const cells: Cell[] = [];
  let W = 0;
  let H = 0;
  if (s.layout === 'row') {
    const h = size;
    let x = pad;
    for (const b of bmps) {
      const w = (b.width / b.height) * h;
      cells.push({ x, y: pad, w, h, b });
      x += w + gap;
    }
    W = x - gap + pad;
    H = h + pad * 2;
  } else if (s.layout === 'column') {
    const w = size;
    let y = pad;
    for (const b of bmps) {
      const h = (b.height / b.width) * w;
      cells.push({ x: pad, y, w, h, b });
      y += h + gap;
    }
    W = w + pad * 2;
    H = y - gap + pad;
  } else {
    const cols = s.cols > 0 ? s.cols : Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const cw = (size - pad * 2 - gap * (cols - 1)) / cols;
    const ch = cw / (CELLS[s.cell] ?? 1);
    bmps.forEach((b, i) => cells.push({ x: pad + (i % cols) * (cw + gap), y: pad + Math.floor(i / cols) * (ch + gap), w: cw, h: ch, b }));
    W = size;
    H = pad * 2 + rows * ch + (rows - 1) * gap;
  }
  const fit = clampCanvas(W, H);
  const k = fit.w / W;
  const c = new OffscreenCanvas(fit.w, fit.h);
  const ctx = c.getContext('2d')!;
  if (s.background !== 'transparent') {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.imageSmoothingQuality = 'high';
  for (const cell of cells) {
    const x = cell.x * k;
    const y = cell.y * k;
    const w = cell.w * k;
    const h = cell.h * k;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, (s.radius / 100) * Math.min(w, h));
    ctx.clip();
    const b = cell.b;
    const scale = s.layout !== 'grid' ? w / b.width : s.fit === 'cover' ? Math.max(w / b.width, h / b.height) : Math.min(w / b.width, h / b.height);
    const dw = b.width * scale;
    const dh = b.height * scale;
    ctx.drawImage(b, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  bmps.forEach((b) => b.close());
  return { canvas: c, scaled: fit.scaled };
}

export default function Collage() {
  const tool = toolById('collage')!;
  const [s, set] = useToolSettings('collage', DEFAULTS);
  const targets = useScopedTargets();
  const [preview, setPreview] = useState<{ blob: Blob; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const ds = useDebounced(s, 200);
  const key = targets.map((t) => current(t).id).join(',');

  useEffect(() => {
    if (targets.length < 2) return setPreview(null);
    let alive = true;
    compose(targets, ds, 1200)
      .then(async ({ canvas }) => {
        const blob = await canvasToBlob(canvas, ds.background === 'transparent' ? 'image/png' : 'image/jpeg', 0.85);
        if (alive) setPreview({ blob, width: canvas.width, height: canvas.height });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, key]);

  const save = async () => {
    setBusy(true);
    try {
      const { canvas, scaled } = await compose(targets, s, Infinity);
      const fmt = s.background === 'transparent' && s.format === 'image/jpeg' ? 'image/png' : s.format;
      const blob = await canvasToBlob(canvas, fmt, 0.92);
      await addGenerated([{ blob, name: `kolase-${targets.length}` }]);
      haptic('success');
      toast({ kind: 'success', title: 'Kolase ditambahkan ke Berkas', body: scaled ? 'Ukuran dibatasi memori perangkat.' : `${canvas.width}×${canvas.height}` });
    } catch (e) {
      toast({ kind: 'error', title: 'Gagal membuat kolase', body: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell
      tool={tool}
      stage={
        preview ? (
          <ImageStage before={preview} />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
            Pilih minimal 2 gambar di bawah (centang), atau pilih “Semua”.
          </div>
        )
      }
      panel={
        <>
          <Section title="Tata letak">
            <Segmented
              value={s.layout}
              onChange={(layout) => set({ layout })}
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'row', label: 'Samping' },
                { value: 'column', label: 'Atas-bawah' },
              ]}
            />
            {s.layout === 'grid' && (
              <>
                <Field label="Kolom" hint="0 = otomatis">
                  <NumberInput value={s.cols} onChange={(cols) => set({ cols: cols ?? 0 })} min={0} max={20} label="Jumlah kolom" />
                </Field>
                <Field label="Bentuk sel">
                  <Segmented value={s.cell} onChange={(cell) => set({ cell })} options={Object.keys(CELLS).map((c) => ({ value: c, label: c }))} />
                </Field>
                <Segmented
                  size="sm"
                  value={s.fit}
                  onChange={(fit) => set({ fit })}
                  options={[
                    { value: 'cover', label: 'Isi sel (potong)' },
                    { value: 'contain', label: 'Utuh' },
                  ]}
                />
              </>
            )}
            <Field label={s.layout === 'row' ? 'Tinggi' : s.layout === 'column' ? 'Lebar' : 'Lebar total'}>
              <NumberInput value={s.size} onChange={(size) => set({ size: size ?? 1600 })} min={100} max={12000} unit="px" label="Ukuran" />
            </Field>
          </Section>
          <Section title="Gaya">
            <Slider label="Jarak antar gambar" value={s.gap} min={0} max={10} step={0.25} unit="%" onChange={(gap) => set({ gap })} defaultValue={1.5} />
            <Slider label="Tepi luar" value={s.padding} min={0} max={10} step={0.25} unit="%" onChange={(padding) => set({ padding })} defaultValue={1.5} />
            <Slider label="Sudut bulat" value={s.radius} min={0} max={50} unit="%" onChange={(radius) => set({ radius })} defaultValue={0} />
            <Field label="Warna latar">
              <ColorInput value={s.background} onChange={(background) => set({ background })} allowTransparent />
            </Field>
            <Field label="Format">
              <Segmented
                value={s.format}
                onChange={(format) => set({ format })}
                options={[
                  { value: 'image/jpeg', label: 'JPG' },
                  { value: 'image/png', label: 'PNG' },
                  { value: 'image/webp', label: 'WebP' },
                ]}
              />
            </Field>
          </Section>
          <Section title="Urutan">
            <p className="text-xs text-muted">
              Urutan mengikuti halaman{' '}
              <Link to="/berkas" className="font-medium text-accent">
                Berkas
              </Link>
              . Seret di sana untuk mengubahnya.
            </p>
          </Section>
        </>
      }
      footer={
        <div className="space-y-2.5">
          <ScopePicker />
          {targets.length < 2 && <Notice>Butuh minimal 2 gambar.</Notice>}
          <Button variant="primary" size="lg" block loading={busy} disabled={targets.length < 2} onClick={save}>
            Buat kolase · {targets.length} gambar
          </Button>
        </div>
      }
    />
  );
}
